-- ============================================================
-- Happy Man Academy — RLS hardening (pilot security baseline)
-- ============================================================

-- 1. Revoke password columns from anon role at DB level
--    (defence-in-depth: the JS query already excludes them)
REVOKE SELECT (password_hash, password_salt) ON public.users FROM anon;

-- 2. DB functions that return the current session's user id and role
--    (set by the app via a Supabase RPC call after login — for future use)
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.user_id', true) $$;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.user_role', true) $$;

-- 3. Enable RLS on sensitive tables
ALTER TABLE public.grades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions      ENABLE ROW LEVEL SECURITY;

-- 4. Drop the broad anon_all policies on these tables
--    (defined in the initial migration; replaced below with targeted policies)
DROP POLICY IF EXISTS anon_all ON public.grades;
DROP POLICY IF EXISTS anon_all ON public.students;
DROP POLICY IF EXISTS anon_all ON public.users;
DROP POLICY IF EXISTS anon_all ON public.promotions;

-- 5. Replacement policies: open SELECT/INSERT/UPDATE, block DELETE for anon

-- grades: read and write allowed, no DELETE
CREATE POLICY grades_select ON public.grades FOR SELECT TO anon USING (true);
CREATE POLICY grades_insert ON public.grades FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY grades_update ON public.grades FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- students: read and write allowed, no DELETE
CREATE POLICY students_select ON public.students FOR SELECT TO anon USING (true);
CREATE POLICY students_insert ON public.students FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY students_update ON public.students FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- users: read and update allowed, no INSERT or DELETE via anon
CREATE POLICY users_select ON public.users FOR SELECT TO anon USING (true);
CREATE POLICY users_update ON public.users FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- promotions: read and write allowed, no DELETE
CREATE POLICY promotions_select ON public.promotions FOR SELECT TO anon USING (true);
CREATE POLICY promotions_insert ON public.promotions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY promotions_update ON public.promotions FOR UPDATE TO anon USING (true) WITH CHECK (true);
