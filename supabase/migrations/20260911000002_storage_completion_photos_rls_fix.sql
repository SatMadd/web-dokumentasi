-- ==============================================================================
-- Storage RLS Fix: completion_photos_read
--
-- Root cause: the previous Member arm checked
--   (auth.uid())::text = (storage.foldername(name))[1]
-- but upload paths are {completion_id}/{timestamp}-{filename}, so the first
-- folder segment is a completion UUID, not a user UUID. This caused
-- createSignedUrl() to return 403 for all Members (even for their own photos).
--
-- Fix: replace the path-match with a task_completions join, matching the
-- table-level RLS policy intent in schema.md section 5:
--   Members: SELECT own only (via completion join)
--   Heads: SELECT all
--
-- Co-assignees cannot read each other's Storage objects — intentional.
-- ==============================================================================

DROP POLICY IF EXISTS "completion_photos_read" ON storage.objects;

CREATE POLICY "completion_photos_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'completion-photos'
  AND (
    -- Heads can see all completion photos
    public.is_head()
    -- Members can see photos whose completion they personally submitted
    OR EXISTS (
      SELECT 1 FROM public.task_completions
      WHERE id::text = (storage.foldername(name))[1]
        AND submitted_by = auth.uid()
    )
  )
);
