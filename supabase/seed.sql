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

-- 4. NOTE ON AUTH USER CREATION:
-- DO NOT insert rows directly into auth.users via raw SQL!
-- Raw SQL inserts cannot produce the password hash and email confirmation state required by Supabase Auth (GoTrue).
-- All user accounts must be created using the Supabase Admin API:
--   Run: npm run seed
-- Or via Supabase Dashboard -> Authentication -> Users -> "Add user".

