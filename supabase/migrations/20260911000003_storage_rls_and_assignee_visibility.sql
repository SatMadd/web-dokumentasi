-- ==============================================================================
-- Migration: Storage RLS Fix & Task Assignees Co-Visibility Fix
-- 
-- 1. Storage RLS on completion-photos:
--    - Enforce private bucket (public = false)
--    - SELECT (read): Heads see all; Members see own completion photos only
--    - INSERT (upload): Only the actual submitter (submitted_by = auth.uid())
--      can upload to completion-photos/{completion_id}/...
--    - Co-assignees cannot read or upload each other's photos.
--
-- 2. Task Assignees SELECT RLS:
--    - Heads see all assignees on all tasks.
--    - Assigned users (and creators) see all assignees for their assigned tasks.
--    - Resolves Bug 2 where multi-assignee tasks displayed only 1 assignee
--      to assigned Members.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Storage Bucket Configuration & RLS Policies
-- ------------------------------------------------------------------------------

-- Ensure bucket is private
UPDATE storage.buckets
SET public = false
WHERE id = 'completion-photos';

-- Drop old storage policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "completion_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "completion_photos_read" ON storage.objects;

-- Read policy: Heads see all, Members see only photos from their own completion
CREATE POLICY "completion_photos_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'completion-photos'
  AND (
    public.is_head()
    OR EXISTS (
      SELECT 1 FROM public.task_completions
      WHERE id::text = (storage.foldername(name))[1]
        AND submitted_by = auth.uid()
    )
  )
);

-- Upload (INSERT) policy: Only the actual submitter can upload to their completion folder
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

-- ------------------------------------------------------------------------------
-- 2. Task Assignees Co-Visibility (Bug 2 Fix)
-- ------------------------------------------------------------------------------

-- Helper function to safely check task membership without RLS recursion
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

-- Update task_assignees_select policy
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;

CREATE POLICY "task_assignees_select"
ON public.task_assignees FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR user_id = auth.uid()
  OR public.is_task_assignee_or_creator(task_id)
);
