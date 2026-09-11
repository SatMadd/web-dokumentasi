-- ==============================================================================
-- Migration: 20260911000000_notifications_indonesian_minimal.sql
-- 1. Standardize notifications CHECK constraint to Indonesian minimal set:
--    ('tugas', 'baru') and ('izin', 'disetujui' | 'ditolak')
-- 2. Update handle_izin_status_notification trigger to insert 'disetujui' / 'ditolak'
-- ==============================================================================

-- 1. Update CHECK constraint
DELETE FROM public.notifications;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_detail_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_category_detail_check
  CHECK (
    (category = 'tugas' AND detail = 'baru') OR
    (category = 'izin' AND detail IN ('disetujui', 'ditolak'))
  );

-- 2. Update trigger function: handle_izin_status_notification
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
      CASE WHEN NEW.status = 'approved' THEN 'disetujui' ELSE 'ditolak' END,
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
