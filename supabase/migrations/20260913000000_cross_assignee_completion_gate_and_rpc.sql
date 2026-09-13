-- ==============================================================================
-- Migration: Cross-Assignee Completion Visibility Gate & RPC Function
--
-- 1. get_task_completion_status(p_task_id uuid) RPC function (SECURITY DEFINER):
--    - Returns { user_id, full_name, has_submitted } for each assignee
--    - Exposes submission status only — never minutes, times, location, or photos
--    - Protected by access check: Head, or assignee/creator of the task
--
-- 2. task_completions SELECT RLS:
--    - Submitter sees own row
--    - Head sees all rows
--    - Co-assignee sees all rows ONLY IF parent tasks.status = 'completed'
--
-- 3. completion_photos SELECT RLS:
--    - Submitter sees own photos
--    - Head sees all photos
--    - Co-assignee sees all photos ONLY IF parent tasks.status = 'completed'
--
-- 4. Storage objects completion_photos_read policy:
--    - Head sees all objects
--    - Submitter sees own objects
--    - Co-assignee sees objects ONLY IF parent tasks.status = 'completed'
--
-- 5. Storage objects completion_photos_upload policy:
--    - Submitter only (submitted_by = auth.uid())
-- ==============================================================================

-- 1. Helper function is_task_assignee_or_creator
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

-- 2. RPC function get_task_completion_status
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

-- 3. Update task_completions SELECT RLS
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

-- 4. Update completion_photos SELECT RLS
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

-- 5. Update completion_photos_read Storage policy on storage.objects
DROP POLICY IF EXISTS "completion_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;

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

-- 6. Update completion_photos_upload Storage policy on storage.objects
DROP POLICY IF EXISTS "completion_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

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
