BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

-- Isolated fixtures are rolled back at the end of this file.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-class-teacher@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rls-math-teacher@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'rls-student-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'rls-student-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('a0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'rls-parent-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb);

INSERT INTO public.users (name, email, role, staff_role, auth_user_id)
VALUES
  ('RLS Admin', 'rls-admin@example.test', 'admin', NULL, 'a0000000-0000-4000-8000-000000000001'),
  ('RLS Class Teacher', 'rls-class-teacher@example.test', 'teacher', 'Class Teacher', 'a0000000-0000-4000-8000-000000000002'),
  ('RLS Math Teacher', 'rls-math-teacher@example.test', 'teacher', 'Subject Teacher', 'a0000000-0000-4000-8000-000000000003'),
  ('RLS Student One', 'rls-student-one@example.test', 'student', NULL, 'a0000000-0000-4000-8000-000000000004'),
  ('RLS Student Two', 'rls-student-two@example.test', 'student', NULL, 'a0000000-0000-4000-8000-000000000005'),
  ('RLS Parent One', 'rls-parent-one@example.test', 'parent', NULL, 'a0000000-0000-4000-8000-000000000006');

SELECT set_config('test.rls_admin_id', (SELECT id::text FROM public.users WHERE email = 'rls-admin@example.test'), true);
SELECT set_config('test.rls_class_teacher_id', (SELECT id::text FROM public.users WHERE email = 'rls-class-teacher@example.test'), true);
SELECT set_config('test.rls_math_teacher_id', (SELECT id::text FROM public.users WHERE email = 'rls-math-teacher@example.test'), true);
SELECT set_config('test.rls_student_one_user_id', (SELECT id::text FROM public.users WHERE email = 'rls-student-one@example.test'), true);
SELECT set_config('test.rls_student_two_user_id', (SELECT id::text FROM public.users WHERE email = 'rls-student-two@example.test'), true);
SELECT set_config('test.rls_parent_one_id', (SELECT id::text FROM public.users WHERE email = 'rls-parent-one@example.test'), true);

INSERT INTO public.classes (class_name, level, year)
VALUES ('RLS Test Grade 7A', 'JSS', 7), ('RLS Test Grade 7B', 'JSS', 7);
INSERT INTO public.subjects (name, is_core)
VALUES ('RLS Test Mathematics', true), ('RLS Test English', true);
INSERT INTO public.sessions (name) VALUES ('RLS Test Session 2026/2027');
INSERT INTO public.terms (session_id, name)
SELECT id, '1st Term' FROM public.sessions WHERE name = 'RLS Test Session 2026/2027';

SELECT set_config('test.rls_class_a_id', (SELECT id::text FROM public.classes WHERE class_name = 'RLS Test Grade 7A'), true);
SELECT set_config('test.rls_class_b_id', (SELECT id::text FROM public.classes WHERE class_name = 'RLS Test Grade 7B'), true);
SELECT set_config('test.rls_math_id', (SELECT id::text FROM public.subjects WHERE name = 'RLS Test Mathematics'), true);
SELECT set_config('test.rls_english_id', (SELECT id::text FROM public.subjects WHERE name = 'RLS Test English'), true);
SELECT set_config('test.rls_session_id', (SELECT id::text FROM public.sessions WHERE name = 'RLS Test Session 2026/2027'), true);
SELECT set_config('test.rls_term_id', (SELECT id::text FROM public.terms WHERE name = '1st Term' AND session_id = (SELECT id FROM public.sessions WHERE name = 'RLS Test Session 2026/2027')), true);

INSERT INTO public.students (user_id, class_id, admission_no)
VALUES
  (current_setting('test.rls_student_one_user_id')::bigint, current_setting('test.rls_class_a_id')::bigint, 'RLS-TEST-001'),
  (current_setting('test.rls_student_two_user_id')::bigint, current_setting('test.rls_class_b_id')::bigint, 'RLS-TEST-002');
SELECT set_config('test.rls_student_one_id', (SELECT id::text FROM public.students WHERE admission_no = 'RLS-TEST-001'), true);
SELECT set_config('test.rls_student_two_id', (SELECT id::text FROM public.students WHERE admission_no = 'RLS-TEST-002'), true);

INSERT INTO public.parent_students (parent_id, student_id)
VALUES (current_setting('test.rls_parent_one_id')::bigint, current_setting('test.rls_student_one_id')::bigint);
INSERT INTO public.teacher_classes (teacher_id, class_id)
VALUES (current_setting('test.rls_class_teacher_id')::bigint, current_setting('test.rls_class_a_id')::bigint);
INSERT INTO public.teacher_subjects (teacher_id, subject_id, class_id)
VALUES (current_setting('test.rls_math_teacher_id')::bigint,
        current_setting('test.rls_math_id')::bigint,
        current_setting('test.rls_class_a_id')::bigint);
INSERT INTO public.grades (student_id, subject_id, term_id, class_id, ca_score, exam_score)
VALUES
  (current_setting('test.rls_student_one_id')::bigint, current_setting('test.rls_math_id')::bigint, current_setting('test.rls_term_id')::bigint, current_setting('test.rls_class_a_id')::bigint, 20, 50),
  (current_setting('test.rls_student_one_id')::bigint, current_setting('test.rls_english_id')::bigint, current_setting('test.rls_term_id')::bigint, current_setting('test.rls_class_a_id')::bigint, 20, 50),
  (current_setting('test.rls_student_two_id')::bigint, current_setting('test.rls_math_id')::bigint, current_setting('test.rls_term_id')::bigint, current_setting('test.rls_class_b_id')::bigint, 20, 50);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grades'::regclass), 'grades has row-level security enabled');

SET LOCAL ROLE anon;
SELECT ok(NOT has_table_privilege('anon', 'public.grades', 'SELECT'), 'anonymous users have no SELECT privilege on grades');
SELECT ok(NOT has_table_privilege('anon', 'public.students', 'SELECT'), 'anonymous users have no SELECT privilege on students');
SELECT throws_ok(
  format('INSERT INTO public.grades (student_id, subject_id, term_id, class_id) VALUES (%s, %s, %s, %s)',
    current_setting('test.rls_student_one_id'), current_setting('test.rls_english_id'),
    current_setting('test.rls_term_id'), current_setting('test.rls_class_a_id')),
  '42501', NULL, 'anonymous users cannot add grades'
);
SELECT throws_ok(
  format('SELECT * FROM public.student_positions(%s, %s)', current_setting('test.rls_session_id'), current_setting('test.rls_term_id')),
  '42501', NULL, 'anonymous users cannot call the school-wide ranking function'
);
SELECT throws_ok(
  format('UPDATE public.grades SET ca_score = 0 WHERE student_id = %s RETURNING id', current_setting('test.rls_student_one_id')),
  '42501', NULL, 'anonymous users cannot change grades'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000004', true);
SELECT is((SELECT count(*)::integer FROM public.students), 1, 'a student sees only their own student record');
SELECT is((SELECT count(*)::integer FROM public.grades), 2, 'a student sees only their own grades');
SELECT is((SELECT count(*)::integer FROM public.grades WHERE student_id = current_setting('test.rls_student_two_id')::bigint), 0, 'a student cannot read another student grades');
SELECT throws_ok(
  format('INSERT INTO public.grades (student_id, subject_id, term_id, class_id) VALUES (%s, %s, %s, %s)',
    current_setting('test.rls_student_two_id'), current_setting('test.rls_math_id'),
    current_setting('test.rls_term_id'), current_setting('test.rls_class_b_id')),
  '42501', NULL, 'a student cannot add grades'
);
SELECT is((SELECT count(*)::integer FROM public.student_positions(current_setting('test.rls_session_id')::bigint, current_setting('test.rls_term_id')::bigint)), 0, 'a student cannot retrieve school-wide position rows');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000006', true);
SELECT is((SELECT count(*)::integer FROM public.students), 1, 'a parent sees only their linked child');
SELECT is((SELECT count(*)::integer FROM public.grades), 2, 'a parent sees grades for their linked child');
SELECT is((SELECT count(*)::integer FROM public.grades WHERE student_id = current_setting('test.rls_student_two_id')::bigint), 0, 'a parent cannot read an unlinked child grades');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.grades), 1, 'a subject teacher sees only the assigned subject in the assigned class');
SELECT is_empty(
  format('UPDATE public.grades SET ca_score = 0 WHERE student_id = %s AND subject_id = %s RETURNING id',
    current_setting('test.rls_student_one_id'), current_setting('test.rls_english_id')),
  'a subject teacher cannot change an unassigned subject grade'
);
SELECT throws_ok(
  format('INSERT INTO public.grades (student_id, subject_id, term_id, class_id) VALUES (%s, %s, %s, %s)',
    current_setting('test.rls_student_one_id'), current_setting('test.rls_english_id'),
    current_setting('test.rls_term_id'), current_setting('test.rls_class_a_id')),
  '42501', NULL, 'a subject teacher cannot add a grade for an unassigned subject'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.grades), 2, 'a class teacher sees all subjects in their assigned class only');
SELECT is((SELECT count(*)::integer FROM public.grades WHERE class_id = current_setting('test.rls_class_b_id')::bigint), 0, 'a class teacher cannot see another class grades');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
SELECT is((SELECT count(*)::integer FROM public.grades), 3, 'an administrator can read school-wide grades');
SELECT is((SELECT count(*)::integer FROM public.students), 2, 'an administrator can read school-wide students');
SELECT is((SELECT count(*)::integer FROM public.student_positions(current_setting('test.rls_session_id')::bigint, current_setting('test.rls_term_id')::bigint)), 2, 'an administrator can read the position rows');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
