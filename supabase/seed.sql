-- ==============================================================================
-- DOOR (preserveD dOcumentatiOn progRam)
-- Database Setup & Storage Configuration Script
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the check_user_exists RPC function for the Login page
CREATE OR REPLACE FUNCTION public.check_user_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_user_exists(text) TO anon, authenticated;

-- 3. Ensure the completion-photos storage bucket exists (private bucket per schema.md section 6)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'completion-photos',
  'completion-photos',
  false, -- Private bucket: signed URLs generated per-request
  10485760, -- 10MB limit per file per logic.md section 3
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 10485760;

-- 4. Helper function and policy for task_assignees co-visibility and management
CREATE OR REPLACE FUNCTION public.is_task_assignee_or_creator(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = p_task_id AND created_by = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_task_assignee_or_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
CREATE POLICY "task_assignees_select"
ON public.task_assignees FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR user_id = auth.uid()
  OR public.is_task_assignee_or_creator(task_id)
);

-- Task assignees INSERT: any Head can assign
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
CREATE POLICY "task_assignees_insert"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (public.is_head());

-- Task assignees DELETE: any Head can delete UNLESS target already submitted completion
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;
CREATE POLICY "task_assignees_delete"
ON public.task_assignees FOR DELETE
TO authenticated
USING (
  public.is_head()
  AND NOT EXISTS (
    SELECT 1 FROM public.task_completions tc
    WHERE tc.task_id = public.task_assignees.task_id
      AND tc.submitted_by = public.task_assignees.user_id
  )
);

-- 4b. Shared function to evaluate task completion status & triggers
CREATE OR REPLACE FUNCTION public.evaluate_task_completion_status(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_assignees int;
  total_completions int;
BEGIN
  SELECT COUNT(*) INTO total_assignees
  FROM public.task_assignees
  WHERE task_id = p_task_id;

  SELECT COUNT(*) INTO total_completions
  FROM public.task_completions
  WHERE task_id = p_task_id;

  IF total_assignees > 0 AND total_completions >= total_assignees THEN
    UPDATE public.tasks
    SET status = 'completed'
    WHERE id = p_task_id AND status != 'completed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_task_completion_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.evaluate_task_completion_status(NEW.task_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_completion_inserted ON public.task_completions;
CREATE TRIGGER on_task_completion_inserted
  AFTER INSERT ON public.task_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion_status();

CREATE OR REPLACE FUNCTION public.handle_task_assignee_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.evaluate_task_completion_status(OLD.task_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_task_assignee_removed ON public.task_assignees;
CREATE TRIGGER on_task_assignee_removed
  AFTER DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignee_removed();

-- 4c. Update notifications CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_detail_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_detail_check
  CHECK (
    (category = 'tugas' AND detail IN ('baru', 'dihapus')) OR
    (category = 'izin' AND detail IN ('disetujui', 'ditolak'))
  );

-- 5. RPC function get_task_completion_status
CREATE OR REPLACE FUNCTION public.get_task_completion_status(p_task_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  has_submitted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Access check: caller must be a Head, or an assignee/creator of this task
  IF NOT (public.is_head() OR public.is_task_assignee_or_creator(p_task_id)) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda bukan petugas atau pembuat tugas ini.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ta.user_id,
    COALESCE(p.full_name, 'Petugas') AS full_name,
    EXISTS (
      SELECT 1
      FROM public.task_completions tc
      WHERE tc.task_id = p_task_id
        AND tc.submitted_by = ta.user_id
    ) AS has_submitted
  FROM public.task_assignees ta
  LEFT JOIN public.profiles p ON p.id = ta.user_id
  WHERE ta.task_id = p_task_id
  ORDER BY p.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_completion_status(uuid) TO authenticated;

-- 6. Update task_completions SELECT RLS (cross-assignee gated by task completed status)
DROP POLICY IF EXISTS "task_completions_select" ON public.task_completions;

CREATE POLICY "task_completions_select"
ON public.task_completions FOR SELECT
TO authenticated
USING (
  submitted_by = auth.uid()
  OR public.is_head()
  OR (
    public.is_task_assignee_or_creator(task_id)
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = public.task_completions.task_id
        AND t.status = 'completed'
    )
  )
);

-- 7. Update completion_photos SELECT RLS
DROP POLICY IF EXISTS "completion_photos_select" ON public.completion_photos;

CREATE POLICY "completion_photos_select"
ON public.completion_photos FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR EXISTS (
    SELECT 1 FROM public.task_completions tc
    JOIN public.tasks t ON t.id = tc.task_id
    WHERE tc.id = public.completion_photos.completion_id
      AND (
        tc.submitted_by = auth.uid()
        OR (
          public.is_task_assignee_or_creator(t.id)
          AND t.status = 'completed'
        )
      )
  )
);

-- 8. Storage policies for completion-photos bucket
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "completion_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "completion_photos_read" ON storage.objects;

-- Read policy: Heads see all; Members see own + co-assignees if completed
CREATE POLICY "completion_photos_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'completion-photos'
  AND (
    public.is_head()
    OR EXISTS (
      SELECT 1
      FROM public.task_completions tc
      JOIN public.tasks t ON t.id = tc.task_id
      WHERE tc.id::text = (storage.foldername(name))[1]
        AND (
          tc.submitted_by = auth.uid()
          OR (
            public.is_task_assignee_or_creator(t.id)
            AND t.status = 'completed'
          )
        )
    )
  )
);

-- Upload policy: Only actual submitter uploads to their completion folder
CREATE POLICY "completion_photos_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'completion-photos'
  AND EXISTS (
    SELECT 1 FROM public.task_completions
    WHERE id::text = (storage.foldername(name))[1]
      AND submitted_by = auth.uid()
  )
);

-- 9. NOTE ON AUTH USER CREATION:
-- All user accounts must be created using the Supabase Admin API:
--   Run: node --env-file=.env.local scripts/seed.mjs
