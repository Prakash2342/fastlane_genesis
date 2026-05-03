-- Fix for 403 Forbidden when querying profiles
-- Run this in your Supabase SQL Editor

-- 1. Ensure authenticated users have permissions to select from profiles
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 2. Fix potential infinite recursion in profiles RLS policy
-- Instead of querying the profiles table inside its own policy,
-- we read the 'society' from the JWT user_metadata which was set during signup.

CREATE OR REPLACE FUNCTION public.current_user_society()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  -- Extract society from the current JWT token's user_metadata
  SELECT current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'society';
$$;

-- IMPORTANT: Grant execute permission so PostgREST can use it in the policy
GRANT EXECUTE ON FUNCTION public.current_user_society() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_society() TO anon;

-- 3. Recreate the policy just in case it was corrupted or missing
DROP POLICY IF EXISTS "Users in same society can view profiles" ON public.profiles;

CREATE POLICY "Users in same society can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid() 
    OR 
    society = public.current_user_society()
  );
