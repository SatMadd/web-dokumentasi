-- ==============================================================================
-- Migration: Head-Editable Task Assignees
--
-- 1. task_assignees RLS:
--    - INSERT: Any Head can assign members to any task (public.is_head())
--    - DELETE: Any Head can remove assignees from any task, UNLESS that assignee
--      has already submitted a completion for this task.
--
-- 2. notifications CHECK constraint:
--    - Update to allow ('tugas', 'dihapus') alongside existing canonical pairs.
--
-- 3. Automatic task completion status re-evaluation on assignee removal:
--    - Shared evaluate_task_completion_status(p_task_id uuid) function
--    - handle_task_completion_status() on task_completions INSERT
--    - handle_task_assignee_removed() on task_assignees DELETE
-- ==============================================================================

-- 1. Shared function to evaluate task completion status
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

-- 2. Trigger on task_completions INSERT
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

-- 3. Trigger on task_assignees DELETE
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

-- 4. Update task_assignees RLS policies for INSERT and DELETE
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
CREATE POLICY "task_assignees_insert"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (public.is_head());

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

-- 5. Update notifications CHECK constraint to allow ('tugas', 'dihapus')
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_detail_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_detail_check
  CHECK (
    (category = 'tugas' AND detail IN ('baru', 'dihapus')) OR
    (category = 'izin' AND detail IN ('disetujui', 'ditolak'))
  );
