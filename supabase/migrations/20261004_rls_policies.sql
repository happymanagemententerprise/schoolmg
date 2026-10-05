-- ============================================================
-- Happy Man Academy — RLS hardening (pilot security baseline)
-- Re-runnable: all CREATE POLICY statements are preceded by
-- DROP POLICY IF EXISTS so this script is safe to run twice.
-- ============================================================

-- 1. Revoke password columns from anon role at DB level
--    (defence-in-depth: the JS query already excludes them)
REVOKE SELECT (password_hash, password_salt) ON public.users FROM anon;

-- 2. DB functions that return the current session user id/role
--    (for future per-row RLS when Supabase Auth is added)
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.user_id', true) $$;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.user_role', true) $$;

-- 3. Enable RLS on sensitive tables (safe to run if already enabled)
ALTER TABLE public.grades     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 4. Drop broad anon_all policies (replaced below)
DROP POLICY IF EXISTS anon_all       ON public.grades;
DROP POLICY IF EXISTS anon_all       ON public.students;
DROP POLICY IF EXISTS anon_all       ON public.users;
DROP POLICY IF EXISTS anon_all       ON public.promotions;

-- 5. Drop targeted policies before recreating (makes script idempotent)
DROP POLICY IF EXISTS grades_select    ON public.grades;
DROP POLICY IF EXISTS grades_insert    ON public.grades;
DROP POLICY IF EXISTS grades_update    ON public.grades;

DROP POLICY IF EXISTS students_select  ON public.students;
DROP POLICY IF EXISTS students_insert  ON public.students;
DROP POLICY IF EXISTS students_update  ON public.students;

DROP POLICY IF EXISTS users_select     ON public.users;
DROP POLICY IF EXISTS users_update     ON public.users;

DROP POLICY IF EXISTS promotions_select ON public.promotions;
DROP POLICY IF EXISTS promotions_insert ON public.promotions;
DROP POLICY IF EXISTS promotions_update ON public.promotions;

-- 6. Recreate policies: SELECT/INSERT/UPDATE open, DELETE blocked for anon

-- grades
CREATE POLICY grades_select ON public.grades FOR SELECT TO anon USING (true);
CREATE POLICY grades_insert ON public.grades FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY grades_update ON public.grades FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- students
CREATE POLICY students_select ON public.students FOR SELECT TO anon USING (true);
CREATE POLICY students_insert ON public.students FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY students_update ON public.students FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- users (no INSERT or DELETE via anon)
CREATE POLICY users_select ON public.users FOR SELECT TO anon USING (true);
CREATE POLICY users_update ON public.users FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- promotions
CREATE POLICY promotions_select ON public.promotions FOR SELECT TO anon USING (true);
CREATE POLICY promotions_insert ON public.promotions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY promotions_update ON public.promotions FOR UPDATE TO anon USING (true) WITH CHECK (true);
