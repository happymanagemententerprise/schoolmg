-- Keep mutable authorization attributes out of ordinary self-service updates.
REVOKE UPDATE ON public.users FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, phone, initials, tone, mentor_subject, mentor_bio)
  ON public.users TO authenticated;
DO $block$
DECLARE v_column text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY['password_hash','password_salt'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public' AND c.table_name = 'users' AND c.column_name = v_column) THEN
      EXECUTE format('REVOKE SELECT (%I) ON public.users FROM PUBLIC, anon, authenticated', v_column);
    END IF;
  END LOOP;
END;
$block$;
ALTER TABLE public.users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS password_salt,
  DROP COLUMN IF EXISTS password;

CREATE OR REPLACE FUNCTION public.public_user_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1 $function$;
CREATE OR REPLACE FUNCTION public.current_student_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT s.id FROM public.students s WHERE s.user_id = public.public_user_id() LIMIT 1 $function$;
CREATE OR REPLACE FUNCTION public.teacher_class_ids() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT ARRAY(SELECT tc.class_id FROM public.teacher_subjects tc WHERE tc.teacher_id = public.public_user_id()
               UNION SELECT c.class_id FROM public.teacher_classes c WHERE c.teacher_id = public.public_user_id())
$function$;
CREATE OR REPLACE FUNCTION public.parent_student_ids() RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT ARRAY(SELECT ps.student_id FROM public.parent_students ps WHERE ps.parent_id = public.public_user_id()) $function$;
CREATE OR REPLACE FUNCTION public.is_admin_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = public.public_user_id() AND u.role = 'admin') $function$;
REVOKE ALL ON FUNCTION public.public_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_student_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teacher_class_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_student_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_user_id(), public.current_student_id(), public.teacher_class_ids(), public.parent_student_ids(), public.is_admin_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user(p_user_id bigint, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
                WHERE key NOT IN ('name','phone','initials','tone','is_mentor','mentor_subject','mentor_bio','role','staff_role','admin_tier')) THEN
    RAISE EXCEPTION 'unsupported user fields';
  END IF;
  UPDATE public.users SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
    phone = CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE phone END,
    initials = CASE WHEN p_patch ? 'initials' THEN p_patch->>'initials' ELSE initials END,
    tone = CASE WHEN p_patch ? 'tone' THEN p_patch->>'tone' ELSE tone END,
    is_mentor = CASE WHEN p_patch ? 'is_mentor' THEN (p_patch->>'is_mentor')::boolean ELSE is_mentor END,
    mentor_subject = CASE WHEN p_patch ? 'mentor_subject' THEN p_patch->>'mentor_subject' ELSE mentor_subject END,
    mentor_bio = CASE WHEN p_patch ? 'mentor_bio' THEN p_patch->>'mentor_bio' ELSE mentor_bio END,
    role = CASE WHEN p_patch ? 'role' THEN p_patch->>'role' ELSE role END,
    staff_role = CASE WHEN p_patch ? 'staff_role' THEN p_patch->>'staff_role' ELSE staff_role END,
    admin_tier = CASE WHEN p_patch ? 'admin_tier' THEN p_patch->>'admin_tier' ELSE admin_tier END
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_user(bigint,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user(bigint,jsonb) TO authenticated;

-- Question keys are returned only to administrators and teachers assigned to
-- the quiz's class. Students receive published questions for their own class.
REVOKE SELECT ON public.lms_questions FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.lms_questions_for_current_user()
RETURNS TABLE(id bigint, quiz_id bigint, question_text text, question_type text,
              option_a text, option_b text, option_c text, option_d text,
              correct_answer text, points integer, question_position integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT q.id, q.quiz_id, q.question_text, q.question_type,
         q.option_a, q.option_b, q.option_c, q.option_d,
         CASE WHEN public.is_admin_user() OR z.class_id = ANY(public.teacher_class_ids())
              THEN q.correct_answer ELSE NULL END,
         q.points, q.position
  FROM public.lms_questions q
  JOIN public.lms_quizzes z ON z.id = q.quiz_id
  WHERE public.is_admin_user()
     OR z.class_id = ANY(public.teacher_class_ids())
     OR (z.is_published AND z.class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id()))
  ORDER BY q.position;
$function$;
REVOKE ALL ON FUNCTION public.lms_questions_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lms_questions_for_current_user() TO authenticated;

DROP POLICY IF EXISTS lms_lessons_select ON public.lms_lessons;
CREATE POLICY lms_lessons_select ON public.lms_lessons FOR SELECT TO authenticated USING (
  public.is_admin_user() OR class_id = ANY(public.teacher_class_ids())
  OR class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id())
  OR class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids()))
);
DROP POLICY IF EXISTS lms_quizzes_select ON public.lms_quizzes;
CREATE POLICY lms_quizzes_select ON public.lms_quizzes FOR SELECT TO authenticated USING (
  public.is_admin_user() OR class_id = ANY(public.teacher_class_ids())
  OR (is_published AND class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id()))
  OR (is_published AND class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids())))
);
DROP POLICY IF EXISTS lms_discussions_select ON public.lms_discussions;
CREATE POLICY lms_discussions_select ON public.lms_discussions FOR SELECT TO authenticated USING (
  public.is_admin_user() OR class_id = ANY(public.teacher_class_ids())
  OR class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id())
  OR class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids()))
);
DROP POLICY IF EXISTS lms_posts_select ON public.lms_posts;
CREATE POLICY lms_posts_select ON public.lms_posts FOR SELECT TO authenticated USING (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.lms_discussions d WHERE d.id = lms_posts.discussion_id
    AND (d.class_id = ANY(public.teacher_class_ids())
      OR d.class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id())
      OR d.class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids()))))
);
DROP POLICY IF EXISTS lms_posts_insert ON public.lms_posts;
CREATE POLICY lms_posts_insert ON public.lms_posts FOR INSERT TO authenticated WITH CHECK (
  user_id = public.public_user_id() AND EXISTS (
    SELECT 1 FROM public.lms_discussions d WHERE d.id = lms_posts.discussion_id
      AND (public.is_admin_user() OR d.class_id = ANY(public.teacher_class_ids())
        OR d.class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id())
        OR d.class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids())))
  )
);
DROP POLICY IF EXISTS lms_posts_delete ON public.lms_posts;
CREATE POLICY lms_posts_delete ON public.lms_posts FOR DELETE TO authenticated USING (
  (user_id = public.public_user_id() OR public.is_admin_user()) AND EXISTS (
    SELECT 1 FROM public.lms_discussions d WHERE d.id = lms_posts.discussion_id
      AND (public.is_admin_user() OR d.class_id = ANY(public.teacher_class_ids())
        OR d.class_id = (SELECT s.class_id FROM public.students s WHERE s.id = public.current_student_id())
        OR d.class_id IN (SELECT s.class_id FROM public.students s WHERE s.id = ANY(public.parent_student_ids())))
  )
);

-- Grade from the database answer key. Never accept a client-supplied score or
-- student identity, and make each quiz a one-shot submission.
REVOKE INSERT, UPDATE ON public.lms_attempts FROM PUBLIC, anon, authenticated;
-- Recompute stored historical scores from the answer key and submitted answers.
UPDATE public.lms_attempts a SET
  score = (SELECT coalesce(sum(q.points) FILTER (
    WHERE lower(btrim(coalesce(a.answers->>q.id::text, ''))) = lower(btrim(q.correct_answer))
  ), 0)::integer FROM public.lms_questions q WHERE q.quiz_id = a.quiz_id),
  total = (SELECT coalesce(sum(q.points), 0)::integer FROM public.lms_questions q WHERE q.quiz_id = a.quiz_id);
CREATE OR REPLACE FUNCTION public.submit_lms_quiz(p_quiz_id bigint, p_answers jsonb)
RETURNS TABLE(score integer, total integer, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_student_id bigint := public.current_student_id();
  v_score integer := 0;
  v_total integer := 0;
  v_q record;
  v_answer text;
  v_submitted timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR v_student_id IS NULL THEN RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'invalid answers'; END IF;
  IF jsonb_object_length(p_answers) > 200 OR EXISTS (
    SELECT 1 FROM jsonb_each_text(p_answers) a WHERE length(a.value) > 500
  ) THEN RAISE EXCEPTION 'answers exceed allowed size'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lms_quizzes z JOIN public.students s ON s.class_id = z.class_id
                 WHERE z.id = p_quiz_id AND z.is_published AND s.id = v_student_id) THEN
    RAISE EXCEPTION 'quiz is unavailable' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_answers) a(key)
             WHERE NOT EXISTS (SELECT 1 FROM public.lms_questions q WHERE q.quiz_id = p_quiz_id AND q.id::text = a.key)) THEN
    RAISE EXCEPTION 'answer contains an unknown question';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lms_attempts a WHERE a.quiz_id = p_quiz_id AND a.student_id = v_student_id) THEN
    RAISE EXCEPTION 'quiz already submitted';
  END IF;
  FOR v_q IN SELECT q.id, q.correct_answer, q.points FROM public.lms_questions q WHERE q.quiz_id = p_quiz_id LOOP
    v_total := v_total + v_q.points;
    v_answer := p_answers->>v_q.id::text;
    IF lower(btrim(coalesce(v_answer, ''))) = lower(btrim(v_q.correct_answer)) THEN v_score := v_score + v_q.points; END IF;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'quiz has no questions'; END IF;
  INSERT INTO public.lms_attempts(quiz_id, student_id, score, total, answers, submitted_at)
  VALUES (p_quiz_id, v_student_id, v_score, v_total, p_answers, v_submitted);
  RETURN QUERY SELECT v_score, v_total, v_submitted;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_lms_quiz(bigint,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_lms_quiz(bigint,jsonb) TO authenticated;

-- Remove cross-student visibility of workflow records.
DROP POLICY IF EXISTS path_requests_select ON public.path_requests;
CREATE POLICY path_requests_select ON public.path_requests FOR SELECT TO authenticated USING (
  student_id = public.current_student_id() OR student_id = ANY(public.parent_student_ids()) OR public.is_admin_user()
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = path_requests.student_id AND s.class_id = ANY(public.teacher_class_ids()))
);
DROP POLICY IF EXISTS subject_selections_select ON public.subject_selections;
CREATE POLICY subject_selections_select ON public.subject_selections FOR SELECT TO authenticated USING (
  student_id = public.current_student_id() OR student_id = ANY(public.parent_student_ids()) OR public.is_admin_user()
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = subject_selections.student_id AND s.class_id = ANY(public.teacher_class_ids()))
);
DROP POLICY IF EXISTS student_transfers_select ON public.student_transfers;
CREATE POLICY student_transfers_select ON public.student_transfers FOR SELECT TO authenticated USING (public.is_admin_user());
DROP POLICY IF EXISTS approval_requests_select ON public.approval_requests;
CREATE POLICY approval_requests_select ON public.approval_requests FOR SELECT TO authenticated USING (public.is_admin_user() OR requested_by = public.public_user_id());
