-- ==============================================================================
-- DOOR (preserveD dOcumentatiOn progRam)
-- Database Schema & Row Level Security (RLS) Migration
-- Authoritative reference: schema.md
-- ==============================================================================

-- 1. Helper function for role checking
CREATE OR REPLACE FUNCTION public.is_head()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'head'
  );
$$;

-- 2. Create tables

-- 2.1 profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('head', 'member')),
    division text,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.2 tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    planned_location text,
    planned_location_lat float8,
    planned_location_lng float8,
    scheduled_start timestamptz NOT NULL,
    scheduled_end timestamptz,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.3 task_assignees
CREATE TABLE IF NOT EXISTS public.task_assignees (
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, user_id)
);

-- 2.4 task_completions
CREATE TABLE IF NOT EXISTS public.task_completions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    minutes_text text,
    meeting_start_time timestamptz,
    meeting_end_time timestamptz,
    actual_location_lat float8,
    actual_location_lng float8,
    actual_location_address text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_task_submitted_by UNIQUE (task_id, submitted_by)
);

-- 2.5 completion_photos
CREATE TABLE IF NOT EXISTS public.completion_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    completion_id uuid NOT NULL REFERENCES public.task_completions(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- 2.6 pengajuan_izin (leave requests)
CREATE TABLE IF NOT EXISTS public.pengajuan_izin (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2.7 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL,
    reference_id uuid NOT NULL,
    message text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON public.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON public.task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_submitted_by ON public.task_completions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_completion_photos_completion_id ON public.completion_photos(completion_id);
CREATE INDEX IF NOT EXISTS idx_pengajuan_izin_user_id ON public.pengajuan_izin(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, is_read);

-- 4. Triggers & Functions

-- 4.1 Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, division, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'member'),
    COALESCE(new.raw_user_meta_data->>'division', 'Umum'),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.2 Auto-update task status to 'completed' on completion submit
CREATE OR REPLACE FUNCTION public.handle_task_completion_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tasks
  SET status = 'completed'
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_task_completion_inserted ON public.task_completions;
CREATE TRIGGER on_task_completion_inserted
  AFTER INSERT ON public.task_completions
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion_status();

-- 5. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajuan_izin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 6. Row Level Security Policies

-- 6.1 profiles
-- Readable by all authenticated users (needed for assignee directory/search)
CREATE POLICY "profiles_select_all_authenticated"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Self-editable for profile fields only, role cannot be modified by user
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

-- 6.2 tasks
-- Only Head can create tasks
CREATE POLICY "tasks_insert_head_only"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.is_head()
);

-- Heads can view all tasks; Members can view tasks assigned to them or created by them
CREATE POLICY "tasks_select"
ON public.tasks FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = public.tasks.id AND user_id = auth.uid()
  )
);

-- Heads can update tasks they created
CREATE POLICY "tasks_update_creator_head"
ON public.tasks FOR UPDATE
TO authenticated
USING (created_by = auth.uid() AND public.is_head())
WITH CHECK (created_by = auth.uid() AND public.is_head());

-- Heads can delete tasks they created
CREATE POLICY "tasks_delete_creator_head"
ON public.tasks FOR DELETE
TO authenticated
USING (created_by = auth.uid() AND public.is_head());

-- 6.3 task_assignees
-- Task creator (Head) can insert assignees
CREATE POLICY "task_assignees_insert"
ON public.task_assignees FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_id AND created_by = auth.uid() AND public.is_head()
  )
);

-- Task creator (Head) can delete assignees
CREATE POLICY "task_assignees_delete"
ON public.task_assignees FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_id AND created_by = auth.uid() AND public.is_head()
  )
);

-- Heads see all assignees; Members see their own assignment rows
CREATE POLICY "task_assignees_select"
ON public.task_assignees FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR user_id = auth.uid()
);

-- 6.4 task_completions
-- Insert restricted to assigned users; submitted_by must match auth.uid()
CREATE POLICY "task_completions_insert"
ON public.task_completions FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = public.task_completions.task_id AND user_id = auth.uid()
  )
);

-- Heads see all completions; Members see own completions
CREATE POLICY "task_completions_select"
ON public.task_completions FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR submitted_by = auth.uid()
);

-- NON-NEGOTIABLE RULE 3:
-- Completions are immutable once submitted.
-- NO UPDATE POLICY IS CREATED FOR ANY ROLE.
-- NO DELETE POLICY IS CREATED FOR ANY ROLE.

-- 6.5 completion_photos
-- Submitter can insert photos for their own completion
CREATE POLICY "completion_photos_insert"
ON public.completion_photos FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.task_completions
    WHERE id = completion_id AND submitted_by = auth.uid()
  )
);

-- Heads see all photos; Members see photos of completions they submitted
CREATE POLICY "completion_photos_select"
ON public.completion_photos FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR EXISTS (
    SELECT 1 FROM public.task_completions
    WHERE id = completion_id AND submitted_by = auth.uid()
  )
);

-- NO UPDATE POLICY FOR ANY ROLE.

-- 6.6 pengajuan_izin
-- Any authenticated user can submit leave request for themselves
CREATE POLICY "pengajuan_izin_insert_own"
ON public.pengajuan_izin FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Heads see all; Members see own
CREATE POLICY "pengajuan_izin_select"
ON public.pengajuan_izin FOR SELECT
TO authenticated
USING (
  public.is_head()
  OR user_id = auth.uid()
);

-- Only Heads can update status / review
CREATE POLICY "pengajuan_izin_update_head_only"
ON public.pengajuan_izin FOR UPDATE
TO authenticated
USING (public.is_head())
WITH CHECK (public.is_head());

-- 6.7 notifications
-- Users can only select their own notifications
CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can only update their own notifications (e.g. mark as read)
CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- System or authenticated users can insert notifications (e.g., when a Head assigns a task)
CREATE POLICY "notifications_insert_authenticated"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7. Realtime configuration
-- Enable Realtime publication for tables needed on Dashboard and Notification bell
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_completions;

-- 8. Storage bucket setup for completion photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('completion-photos', 'completion-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for private bucket 'completion-photos'
-- Upload policy: authenticated users can upload to their completion folder
CREATE POLICY "completion_photos_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'completion-photos');

-- Read policy: Heads can read all, Members can read photos for completions they own
CREATE POLICY "completion_photos_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'completion-photos'
  AND (
    public.is_head()
    OR (auth.uid())::text = (storage.foldername(name))[1]
  )
);
