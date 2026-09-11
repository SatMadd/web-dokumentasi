-- ==============================================================================
-- Migration: 20260911000001_multi_assignee_completion_status.sql
-- Update handle_task_completion_status trigger to be multi-assignee aware.
-- Only sets tasks.status = 'completed' when every assignee has submitted.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_task_completion_status()
RETURNS trigger
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
  WHERE task_id = NEW.task_id;

  SELECT COUNT(*) INTO total_completions
  FROM public.task_completions
  WHERE task_id = NEW.task_id;

  IF total_completions >= total_assignees THEN
    UPDATE public.tasks
    SET status = 'completed'
    WHERE id = NEW.task_id;
  END IF;

  RETURN NEW;
END;
$$;
