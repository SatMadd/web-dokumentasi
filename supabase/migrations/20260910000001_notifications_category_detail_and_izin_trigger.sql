-- ==============================================================================
-- Migration: 20260910000001_notifications_category_detail_and_izin_trigger.sql
-- 1. Migrate notifications from flat type to category + detail
-- 2. Add pengajuan_izin to supabase_realtime publication
-- 3. Add handle_izin_status_notification trigger for automatic leave notifications
-- ==============================================================================

-- 1. Migrate public.notifications
-- Clear existing test notifications to cleanly transition to NOT NULL columns
DELETE FROM public.notifications;

-- Drop the old 'type' column
ALTER TABLE public.notifications DROP COLUMN IF EXISTS type;

-- Add category and detail columns
ALTER TABLE public.notifications 
  ADD COLUMN category text NOT NULL,
  ADD COLUMN detail text NOT NULL;

-- Drop old constraint if exists, then add combined CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_detail_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_detail_check
  CHECK (
    (category = 'task' AND detail = 'assigned') OR
    (category = 'izin' AND detail IN ('approved', 'rejected'))
  );

-- 2. Add public.pengajuan_izin to Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'pengajuan_izin'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pengajuan_izin;
  END IF;
END $$;

-- 3. Trigger function: handle_izin_status_notification
-- Fires ONLY on status transition from 'pending' to 'approved' or 'rejected'
CREATE OR REPLACE FUNCTION public.handle_izin_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.notifications (
      user_id,
      category,
      detail,
      reference_id,
      message,
      is_read,
      created_at
    ) VALUES (
      NEW.user_id,
      'izin',
      NEW.status,
      NEW.id,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Permohonan izin Anda telah disetujui oleh Kepala.'
        ELSE 'Permohonan izin Anda telah ditolak oleh Kepala.'
      END,
      false,
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_izin_status_updated ON public.pengajuan_izin;
CREATE TRIGGER on_izin_status_updated
  AFTER UPDATE OF status ON public.pengajuan_izin
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_izin_status_notification();
