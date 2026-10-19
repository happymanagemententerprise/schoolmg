-- Limit subject teachers to the class/subject assignments they actually hold.
-- A class teacher can read all subjects in their class, but grade writes remain
-- limited to assigned subjects (or an administrator).

CREATE OR REPLACE FUNCTION public.teacher_can_read_grade(p_class_id bigint, p_subject_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_classes tc
    WHERE tc.teacher_id = public.public_user_id()
      AND tc.class_id = p_class_id
  ) OR EXISTS (
    SELECT 1 FROM public.teacher_subjects ts
    WHERE ts.teacher_id = public.public_user_id()
      AND ts.class_id = p_class_id
      AND ts.subject_id = p_subject_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.teacher_can_write_grade(p_class_id bigint, p_subject_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_subjects ts
    WHERE ts.teacher_id = public.public_user_id()
      AND ts.class_id = p_class_id
      AND ts.subject_id = p_subject_id
  );
$function$;

REVOKE ALL ON FUNCTION public.teacher_can_read_grade(bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teacher_can_write_grade(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_can_read_grade(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_write_grade(bigint, bigint) TO authenticated;

-- This ranking RPC was originally SECURITY DEFINER with the default PUBLIC
-- execute grant. Keep it available to the admin UI, but enforce admin access
-- and run it as the caller so underlying table RLS remains in force.
CREATE OR REPLACE FUNCTION public.student_positions(p_session_id bigint, p_term_id bigint)
RETURNS TABLE (
  student_id bigint, class_id bigint, year integer,
  class_position integer, year_position integer,
  term_avg numeric, session_avg numeric, terms_counted integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  WITH cohort AS (
    SELECT st.id AS sid, st.class_id, c.year
      FROM public.students st
      JOIN public.classes c ON c.id = st.class_id
     WHERE st.status = 'active'
       AND c.year IS NOT NULL
  ), marks AS (
    SELECT c.sid, g.term_id,
           coalesce(g.midterm_score, 0) + g.ca_score + g.exam_score AS mark
      FROM cohort c
      JOIN public.grades g ON g.student_id = c.sid
      JOIN public.terms t ON t.id = g.term_id
     WHERE t.session_id = p_session_id
  ), per_term AS (
    SELECT sid, term_id, round(avg(mark), 2) AS term_avg
      FROM marks
     GROUP BY sid, term_id
  ), rolled AS (
    SELECT c.sid, c.class_id, c.year,
           max(pt.term_avg) FILTER (WHERE pt.term_id = p_term_id) AS t_avg,
           round(avg(pt.term_avg), 2) AS s_avg,
           count(*) AS n_terms
      FROM cohort c
      JOIN per_term pt ON pt.sid = c.sid
     GROUP BY c.sid, c.class_id, c.year
  )
  SELECT r.sid, r.class_id, r.year,
         rank() OVER (PARTITION BY r.class_id ORDER BY r.s_avg DESC)::integer,
         rank() OVER (PARTITION BY r.year ORDER BY r.s_avg DESC)::integer,
         r.t_avg, r.s_avg, r.n_terms::integer
    FROM rolled r
   WHERE (SELECT public.is_admin_user())
$function$;
REVOKE ALL ON FUNCTION public.student_positions(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_positions(bigint, bigint) TO authenticated;

DROP POLICY IF EXISTS grades_select ON public.grades;
CREATE POLICY grades_select ON public.grades FOR SELECT TO authenticated
  USING (
    student_id = public.current_student_id()
    OR student_id = ANY(public.parent_student_ids())
    OR public.is_admin_user()
    OR public.teacher_can_read_grade(class_id, subject_id)
  );

DROP POLICY IF EXISTS grades_insert ON public.grades;
CREATE POLICY grades_insert ON public.grades FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR public.teacher_can_write_grade(class_id, subject_id)
  );

DROP POLICY IF EXISTS grades_update ON public.grades;
CREATE POLICY grades_update ON public.grades FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    OR public.teacher_can_write_grade(class_id, subject_id)
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.teacher_can_write_grade(class_id, subject_id)
  );
