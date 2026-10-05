-- ============================================================
-- Happy Man Academy — Supabase Auth integration
-- ============================================================

-- 1. Add auth_user_id to public.users (links to auth.users)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_auth_user_id_idx ON public.users(auth_user_id);

-- 2. Helper: resolve the public.users.id for the currently authenticated user
CREATE OR REPLACE FUNCTION public_user_id() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1
  $$;

-- 3. Helper: get the students.id for the logged-in student
CREATE OR REPLACE FUNCTION current_student_id() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT id FROM public.students WHERE user_id = public_user_id() LIMIT 1
  $$;

-- 4. Helper: get class_ids for the logged-in teacher
CREATE OR REPLACE FUNCTION teacher_class_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT ARRAY(
      SELECT DISTINCT class_id FROM teacher_subjects
      WHERE teacher_id = public_user_id()
    )
  $$;

-- 5. Helper: get student_ids that are children of the logged-in parent
CREATE OR REPLACE FUNCTION parent_student_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT ARRAY(
      SELECT student_id FROM parent_students
      WHERE parent_id = public_user_id()
    )
  $$;

-- 6. Helper: is the logged-in user an admin?
CREATE OR REPLACE FUNCTION is_admin_user() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS(
      SELECT 1 FROM public.users
      WHERE id = public_user_id() AND role = 'admin'
    )
  $$;

-- 7. Re-enable RLS and replace open policies with per-user policies
--    Drop existing open policies first
DROP POLICY IF EXISTS grades_select     ON public.grades;
DROP POLICY IF EXISTS grades_insert     ON public.grades;
DROP POLICY IF EXISTS grades_update     ON public.grades;
DROP POLICY IF EXISTS students_select   ON public.students;
DROP POLICY IF EXISTS students_insert   ON public.students;
DROP POLICY IF EXISTS students_update   ON public.students;
DROP POLICY IF EXISTS users_select      ON public.users;
DROP POLICY IF EXISTS users_update      ON public.users;
DROP POLICY IF EXISTS promotions_select ON public.promotions;
DROP POLICY IF EXISTS promotions_insert ON public.promotions;
DROP POLICY IF EXISTS promotions_update ON public.promotions;
DROP POLICY IF EXISTS anon_all          ON public.grades;
DROP POLICY IF EXISTS anon_all          ON public.students;
DROP POLICY IF EXISTS anon_all          ON public.users;
DROP POLICY IF EXISTS anon_all          ON public.promotions;

-- grades: student sees own, teacher sees taught class, parent sees children, admin sees all
CREATE POLICY grades_select ON public.grades FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR class_id = ANY(teacher_class_ids())
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );
CREATE POLICY grades_insert ON public.grades FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY grades_update ON public.grades FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- students: student sees own, teacher sees class, parent sees children, admin sees all
CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
  USING (
    id = current_student_id()
    OR class_id = ANY(teacher_class_ids())
    OR id = ANY(parent_student_ids())
    OR is_admin_user()
  );
CREATE POLICY students_insert ON public.students FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());
CREATE POLICY students_update ON public.students FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- users: own row + admin sees all (teachers need to see student names for their class)
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (
    id = public_user_id()
    OR is_admin_user()
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.user_id = users.id
        AND s.class_id = ANY(teacher_class_ids())
    )
    OR EXISTS (
      SELECT 1 FROM parent_students ps
      WHERE ps.parent_id = public_user_id()
        AND ps.student_id = (SELECT id FROM students WHERE user_id = users.id LIMIT 1)
    )
  );
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
  USING (id = public_user_id() OR is_admin_user())
  WITH CHECK (id = public_user_id() OR is_admin_user());

-- promotions: student/parent/teacher/admin
CREATE POLICY promotions_select ON public.promotions FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = promotions.student_id
        AND s.class_id = ANY(teacher_class_ids())
    )
  );
CREATE POLICY promotions_insert ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());
CREATE POLICY promotions_update ON public.promotions FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());
