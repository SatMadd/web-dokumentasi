-- ==============================================================================
-- DOOR (preserveD dOcumentatiOn progRam)
-- Database Seed Script: 10 Real Accounts (5 Head, 5 Member) & Storage Setup
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the check_user_exists RPC function for the Login page
-- Allows checking if username/email exists before checking password
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

-- 3. Ensure the completion-photos storage bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'completion-photos',
  'completion-photos',
  true, -- Public read for verified documentation viewing, RLS on insert
  10485760, -- 10MB limit per file per logic.md section 3
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET public = true, file_size_limit = 10485760;

-- Storage policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'completion-photos');

DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'completion-photos');

-- 4. Seed the 10 Real Users in auth.users
-- Shared password for all 10 accounts: KOMINFO2026

DO $$
DECLARE
  v_pass text := crypt('KOMINFO2026', gen_salt('bf'));
  
  -- Heads
  u_suprapto uuid := '11111111-1111-1111-1111-111111111111';
  u_hendra   uuid := '22222222-2222-2222-2222-222222222222';
  u_dewi     uuid := '33333333-3333-3333-3333-333333333333';
  u_bambang  uuid := '44444444-4444-4444-4444-444444444444';
  u_ratna    uuid := '55555555-5555-5555-5555-555555555555';
  
  -- Members
  u_budi     uuid := '66666666-6666-6666-6666-666666666666';
  u_siti     uuid := '77777777-7777-7777-7777-777777777777';
  u_ahmad    uuid := '88888888-8888-8888-8888-888888888888';
  u_anisa    uuid := '99999999-9999-9999-9999-999999999999';
  u_fajar    uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  -- Insert into auth.users (ON CONFLICT DO UPDATE to ensure correct password and email_confirmed_at)
  
  -- 1. suprapto (Head)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_suprapto, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suprapto@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Suprapto Mulyono","role":"head","division":"Bagian Operasional & Perencanaan"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 2. hendra (Head)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_hendra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hendra@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hendra Wijaya","role":"head","division":"Divisi TI & Infrastruktur"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 3. dewi (Head)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_dewi, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dewi@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dewi Lestari","role":"head","division":"Divisi Kehumasan & Informasi Publik"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 4. bambang (Head)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_bambang, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bambang@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bambang Suryono","role":"head","division":"Bagian Tata Usaha & Kepegawaian"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 5. ratna (Head)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_ratna, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ratna@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ratna Kusuma","role":"head","division":"Divisi Pengawasan & Akuntabilitas"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 6. budi (Member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_budi, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'budi@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Budi Santoso","role":"member","division":"Divisi Dokumentasi & Acara"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 7. siti (Member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_siti, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'siti@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Siti Rahma","role":"member","division":"Divisi Dokumentasi & Acara"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 8. ahmad (Member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_ahmad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ahmad@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmad Fauzi","role":"member","division":"Divisi Kehumasan & Informasi Publik"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 9. anisa (Member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_anisa, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anisa@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Anisa Permata","role":"member","division":"Divisi TI & Infrastruktur"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 10. fajar (Member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (u_fajar, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fajar@door.id', v_pass, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fajar Nugraha","role":"member","division":"Bagian Tata Usaha & Kepegawaian"}', now(), now())
  ON CONFLICT (id) DO UPDATE SET encrypted_password = v_pass, email_confirmed_at = now();

  -- 5. Insert/Update into public.profiles
  INSERT INTO public.profiles (id, full_name, role, division, avatar_url)
  VALUES
    (u_suprapto, 'Suprapto Mulyono', 'head', 'Bagian Operasional & Perencanaan', NULL),
    (u_hendra, 'Hendra Wijaya', 'head', 'Divisi TI & Infrastruktur', NULL),
    (u_dewi, 'Dewi Lestari', 'head', 'Divisi Kehumasan & Informasi Publik', NULL),
    (u_bambang, 'Bambang Suryono', 'head', 'Bagian Tata Usaha & Kepegawaian', NULL),
    (u_ratna, 'Ratna Kusuma', 'head', 'Divisi Pengawasan & Akuntabilitas', NULL),
    (u_budi, 'Budi Santoso', 'member', 'Divisi Dokumentasi & Acara', NULL),
    (u_siti, 'Siti Rahma', 'member', 'Divisi Dokumentasi & Acara', NULL),
    (u_ahmad, 'Ahmad Fauzi', 'member', 'Divisi Kehumasan & Informasi Publik', NULL),
    (u_anisa, 'Anisa Permata', 'member', 'Divisi TI & Infrastruktur', NULL),
    (u_fajar, 'Fajar Nugraha', 'member', 'Bagian Tata Usaha & Kepegawaian', NULL)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      division = EXCLUDED.division;

END $$;
