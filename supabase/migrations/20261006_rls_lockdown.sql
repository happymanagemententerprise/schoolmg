-- ============================================================
-- Happy Man Academy — RLS lockdown: close all remaining anon gaps
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- Run after 20261005_supabase_auth.sql.
-- ============================================================

-- ============================================================
-- Fix 2: Replace teacher_class_ids() to also include teacher_classes
-- (teachers who are class teachers but have no rows in teacher_subjects
--  were invisible to every RLS policy that called this function)
-- ============================================================

CREATE OR REPLACE FUNCTION teacher_class_ids() RETURNS bigint[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT ARRAY(
      SELECT DISTINCT class_id FROM teacher_subjects
       WHERE teacher_id = public_user_id()
      UNION
      SELECT class_id FROM teacher_classes
       WHERE teacher_id = public_user_id()
    )
  $$;

-- ============================================================
-- Drop all remaining anon_all policies (idempotent)
-- ============================================================

-- Group A: sensitive personal-data tables
DROP POLICY IF EXISTS anon_all ON public.attendance;
DROP POLICY IF EXISTS anon_all ON public.attendance_weekly;
DROP POLICY IF EXISTS anon_all ON public.attendance_daily;
DROP POLICY IF EXISTS anon_all ON public.remarks;
DROP POLICY IF EXISTS anon_all ON public.lms_attempts;
DROP POLICY IF EXISTS anon_all ON public.parent_students;
DROP POLICY IF EXISTS anon_all ON public.portfolio_artifacts;
DROP POLICY IF EXISTS anon_all ON public.commendations;
DROP POLICY IF EXISTS anon_all ON public.parent_engagements;
DROP POLICY IF EXISTS anon_all ON public.promotion_overrides;
DROP POLICY IF EXISTS anon_all ON public.teacher_recognitions;

-- Group B: school-wide lookup tables
DROP POLICY IF EXISTS anon_all ON public.sessions;
DROP POLICY IF EXISTS anon_all ON public.terms;
DROP POLICY IF EXISTS anon_all ON public.classes;
DROP POLICY IF EXISTS anon_all ON public.subjects;
DROP POLICY IF EXISTS anon_all ON public.rooms;
DROP POLICY IF EXISTS anon_all ON public.time_slots;
DROP POLICY IF EXISTS anon_all ON public.timetables;
DROP POLICY IF EXISTS anon_all ON public.events;
DROP POLICY IF EXISTS anon_all ON public.departments;
DROP POLICY IF EXISTS anon_all ON public.assignments;
DROP POLICY IF EXISTS anon_all ON public.score_uploads;
DROP POLICY IF EXISTS anon_all ON public.weekly_topics;
DROP POLICY IF EXISTS anon_all ON public.teacher_classes;
DROP POLICY IF EXISTS anon_all ON public.teacher_subjects;
DROP POLICY IF EXISTS anon_all ON public.subject_selection_rules;
DROP POLICY IF EXISTS anon_all ON public.timetable_settings;
DROP POLICY IF EXISTS anon_all ON public.lms_lessons;
DROP POLICY IF EXISTS anon_all ON public.lms_quizzes;
DROP POLICY IF EXISTS anon_all ON public.lms_questions;
DROP POLICY IF EXISTS anon_all ON public.lms_discussions;
DROP POLICY IF EXISTS anon_all ON public.lms_posts;
DROP POLICY IF EXISTS anon_all ON public.path_requests;
DROP POLICY IF EXISTS anon_all ON public.subject_selections;
DROP POLICY IF EXISTS anon_all ON public.student_transfers;
DROP POLICY IF EXISTS anon_all ON public.approval_requests;

-- ============================================================
-- Enable RLS on tables not yet covered by 20261005
-- ============================================================

ALTER TABLE public.attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_weekly     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remarks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_artifacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commendations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_engagements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_recognitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_uploads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_selection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lessons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quizzes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_discussions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.path_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_selections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_transfers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GROUP A — Sensitive tables: per-user filtered policies
-- ============================================================

-- ------------------------------------------------------------
-- attendance (original daily table from 20260926)
-- Columns: student_id, term_id, date, status
-- ------------------------------------------------------------

DROP POLICY IF EXISTS attendance_select ON public.attendance;
DROP POLICY IF EXISTS attendance_insert ON public.attendance;
DROP POLICY IF EXISTS attendance_update ON public.attendance;

CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = attendance.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- ------------------------------------------------------------
-- attendance_weekly
-- Columns: student_id, term_id, week_number, days_present
-- No class_id column — resolve class via students.class_id join
-- ------------------------------------------------------------

DROP POLICY IF EXISTS attendance_weekly_select ON public.attendance_weekly;
DROP POLICY IF EXISTS attendance_weekly_insert ON public.attendance_weekly;
DROP POLICY IF EXISTS attendance_weekly_update ON public.attendance_weekly;

CREATE POLICY attendance_weekly_select ON public.attendance_weekly FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = attendance_weekly.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY attendance_weekly_insert ON public.attendance_weekly FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_weekly.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

CREATE POLICY attendance_weekly_update ON public.attendance_weekly FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_weekly.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_weekly.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- ------------------------------------------------------------
-- attendance_daily
-- Columns: student_id, term_id, week_number, day_index, status
-- ------------------------------------------------------------

DROP POLICY IF EXISTS attendance_daily_select ON public.attendance_daily;
DROP POLICY IF EXISTS attendance_daily_insert ON public.attendance_daily;
DROP POLICY IF EXISTS attendance_daily_update ON public.attendance_daily;

CREATE POLICY attendance_daily_select ON public.attendance_daily FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = attendance_daily.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY attendance_daily_insert ON public.attendance_daily FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_daily.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

CREATE POLICY attendance_daily_update ON public.attendance_daily FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_daily.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = attendance_daily.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- ------------------------------------------------------------
-- remarks
-- Columns: student_id, term_id, teacher_remark, principal_remark
-- ------------------------------------------------------------

DROP POLICY IF EXISTS remarks_select ON public.remarks;
DROP POLICY IF EXISTS remarks_insert ON public.remarks;
DROP POLICY IF EXISTS remarks_update ON public.remarks;

CREATE POLICY remarks_select ON public.remarks FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = remarks.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY remarks_insert ON public.remarks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = remarks.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

CREATE POLICY remarks_update ON public.remarks FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = remarks.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = remarks.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- ------------------------------------------------------------
-- lms_attempts
-- Columns: quiz_id, student_id, score, total, answers
-- ------------------------------------------------------------

DROP POLICY IF EXISTS lms_attempts_select ON public.lms_attempts;
DROP POLICY IF EXISTS lms_attempts_insert ON public.lms_attempts;
DROP POLICY IF EXISTS lms_attempts_update ON public.lms_attempts;

CREATE POLICY lms_attempts_select ON public.lms_attempts FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM lms_quizzes q
               WHERE q.id = lms_attempts.quiz_id
                 AND q.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY lms_attempts_insert ON public.lms_attempts FOR INSERT TO authenticated
  WITH CHECK (student_id = current_student_id());

CREATE POLICY lms_attempts_update ON public.lms_attempts FOR UPDATE TO authenticated
  USING (student_id = current_student_id())
  WITH CHECK (student_id = current_student_id());

-- ------------------------------------------------------------
-- parent_students
-- Columns: parent_id, student_id
-- ------------------------------------------------------------

DROP POLICY IF EXISTS parent_students_select ON public.parent_students;
DROP POLICY IF EXISTS parent_students_insert ON public.parent_students;
DROP POLICY IF EXISTS parent_students_update ON public.parent_students;

CREATE POLICY parent_students_select ON public.parent_students FOR SELECT TO authenticated
  USING (parent_id = public_user_id() OR is_admin_user());

CREATE POLICY parent_students_insert ON public.parent_students FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());

CREATE POLICY parent_students_update ON public.parent_students FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ------------------------------------------------------------
-- portfolio_artifacts
-- Columns: student_id, kind, title, note, status, created_by, verified_by
-- ------------------------------------------------------------

DROP POLICY IF EXISTS portfolio_artifacts_select ON public.portfolio_artifacts;
DROP POLICY IF EXISTS portfolio_artifacts_insert ON public.portfolio_artifacts;
DROP POLICY IF EXISTS portfolio_artifacts_update ON public.portfolio_artifacts;

CREATE POLICY portfolio_artifacts_select ON public.portfolio_artifacts FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = portfolio_artifacts.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY portfolio_artifacts_insert ON public.portfolio_artifacts FOR INSERT TO authenticated
  WITH CHECK (student_id = current_student_id() OR is_admin_user());

CREATE POLICY portfolio_artifacts_update ON public.portfolio_artifacts FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = portfolio_artifacts.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = portfolio_artifacts.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- ------------------------------------------------------------
-- commendations
-- Columns: student_id, teacher_id, note
-- ------------------------------------------------------------

DROP POLICY IF EXISTS commendations_select ON public.commendations;
DROP POLICY IF EXISTS commendations_insert ON public.commendations;

CREATE POLICY commendations_select ON public.commendations FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR teacher_id = public_user_id()
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY commendations_insert ON public.commendations FOR INSERT TO authenticated
  WITH CHECK (teacher_id = public_user_id() OR is_admin_user());

-- ------------------------------------------------------------
-- parent_engagements
-- Columns: parent_id, kind, session_id
-- ------------------------------------------------------------

DROP POLICY IF EXISTS parent_engagements_select ON public.parent_engagements;
DROP POLICY IF EXISTS parent_engagements_insert ON public.parent_engagements;

CREATE POLICY parent_engagements_select ON public.parent_engagements FOR SELECT TO authenticated
  USING (parent_id = public_user_id() OR is_admin_user());

CREATE POLICY parent_engagements_insert ON public.parent_engagements FOR INSERT TO authenticated
  WITH CHECK (parent_id = public_user_id() OR is_admin_user());

-- ------------------------------------------------------------
-- promotion_overrides
-- Columns: student_id, session_id, decision, reason, set_by
-- ------------------------------------------------------------

DROP POLICY IF EXISTS promotion_overrides_select ON public.promotion_overrides;
DROP POLICY IF EXISTS promotion_overrides_insert ON public.promotion_overrides;
DROP POLICY IF EXISTS promotion_overrides_update ON public.promotion_overrides;
DROP POLICY IF EXISTS promotion_overrides_delete ON public.promotion_overrides;

CREATE POLICY promotion_overrides_select ON public.promotion_overrides FOR SELECT TO authenticated
  USING (
    student_id = current_student_id()
    OR EXISTS (SELECT 1 FROM students s
               WHERE s.id = promotion_overrides.student_id
                 AND s.class_id = ANY(teacher_class_ids()))
    OR student_id = ANY(parent_student_ids())
    OR is_admin_user()
  );

CREATE POLICY promotion_overrides_insert ON public.promotion_overrides FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());

CREATE POLICY promotion_overrides_update ON public.promotion_overrides FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

CREATE POLICY promotion_overrides_delete ON public.promotion_overrides FOR DELETE TO authenticated
  USING (is_admin_user());

-- ------------------------------------------------------------
-- teacher_recognitions
-- Columns: teacher_id, kind, session_id, note
-- ------------------------------------------------------------

DROP POLICY IF EXISTS teacher_recognitions_select ON public.teacher_recognitions;
DROP POLICY IF EXISTS teacher_recognitions_insert ON public.teacher_recognitions;

CREATE POLICY teacher_recognitions_select ON public.teacher_recognitions FOR SELECT TO authenticated
  USING (teacher_id = public_user_id() OR is_admin_user());

CREATE POLICY teacher_recognitions_insert ON public.teacher_recognitions FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());

-- ============================================================
-- GROUP B — School-wide lookup tables: open read for any authenticated user
-- ============================================================

-- sessions
DROP POLICY IF EXISTS sessions_select ON public.sessions;
DROP POLICY IF EXISTS sessions_insert ON public.sessions;
DROP POLICY IF EXISTS sessions_update ON public.sessions;
CREATE POLICY sessions_select ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY sessions_insert ON public.sessions FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY sessions_update ON public.sessions FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- terms
DROP POLICY IF EXISTS terms_select ON public.terms;
DROP POLICY IF EXISTS terms_insert ON public.terms;
DROP POLICY IF EXISTS terms_update ON public.terms;
CREATE POLICY terms_select ON public.terms FOR SELECT TO authenticated USING (true);
CREATE POLICY terms_insert ON public.terms FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY terms_update ON public.terms FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- classes
DROP POLICY IF EXISTS classes_select ON public.classes;
DROP POLICY IF EXISTS classes_insert ON public.classes;
DROP POLICY IF EXISTS classes_update ON public.classes;
CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY classes_insert ON public.classes FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY classes_update ON public.classes FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- subjects
DROP POLICY IF EXISTS subjects_select ON public.subjects;
DROP POLICY IF EXISTS subjects_insert ON public.subjects;
DROP POLICY IF EXISTS subjects_update ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY subjects_insert ON public.subjects FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY subjects_update ON public.subjects FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- rooms
DROP POLICY IF EXISTS rooms_select ON public.rooms;
DROP POLICY IF EXISTS rooms_insert ON public.rooms;
DROP POLICY IF EXISTS rooms_update ON public.rooms;
CREATE POLICY rooms_select ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY rooms_insert ON public.rooms FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY rooms_update ON public.rooms FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- time_slots
DROP POLICY IF EXISTS time_slots_select ON public.time_slots;
DROP POLICY IF EXISTS time_slots_insert ON public.time_slots;
DROP POLICY IF EXISTS time_slots_update ON public.time_slots;
CREATE POLICY time_slots_select ON public.time_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY time_slots_insert ON public.time_slots FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY time_slots_update ON public.time_slots FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- timetables
DROP POLICY IF EXISTS timetables_select ON public.timetables;
DROP POLICY IF EXISTS timetables_insert ON public.timetables;
DROP POLICY IF EXISTS timetables_update ON public.timetables;
CREATE POLICY timetables_select ON public.timetables FOR SELECT TO authenticated USING (true);
CREATE POLICY timetables_insert ON public.timetables FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY timetables_update ON public.timetables FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- events
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- departments
DROP POLICY IF EXISTS departments_select ON public.departments;
DROP POLICY IF EXISTS departments_insert ON public.departments;
DROP POLICY IF EXISTS departments_update ON public.departments;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_insert ON public.departments FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY departments_update ON public.departments FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- assignments
DROP POLICY IF EXISTS assignments_select ON public.assignments;
DROP POLICY IF EXISTS assignments_insert ON public.assignments;
DROP POLICY IF EXISTS assignments_update ON public.assignments;
CREATE POLICY assignments_select ON public.assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY assignments_insert ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY assignments_update ON public.assignments FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- score_uploads
DROP POLICY IF EXISTS score_uploads_select ON public.score_uploads;
DROP POLICY IF EXISTS score_uploads_insert ON public.score_uploads;
DROP POLICY IF EXISTS score_uploads_update ON public.score_uploads;
CREATE POLICY score_uploads_select ON public.score_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY score_uploads_insert ON public.score_uploads FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY score_uploads_update ON public.score_uploads FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- weekly_topics
DROP POLICY IF EXISTS weekly_topics_select ON public.weekly_topics;
DROP POLICY IF EXISTS weekly_topics_insert ON public.weekly_topics;
DROP POLICY IF EXISTS weekly_topics_update ON public.weekly_topics;
CREATE POLICY weekly_topics_select ON public.weekly_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY weekly_topics_insert ON public.weekly_topics FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY weekly_topics_update ON public.weekly_topics FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- teacher_classes
DROP POLICY IF EXISTS teacher_classes_select ON public.teacher_classes;
DROP POLICY IF EXISTS teacher_classes_insert ON public.teacher_classes;
DROP POLICY IF EXISTS teacher_classes_update ON public.teacher_classes;
CREATE POLICY teacher_classes_select ON public.teacher_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY teacher_classes_insert ON public.teacher_classes FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY teacher_classes_update ON public.teacher_classes FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- teacher_subjects
DROP POLICY IF EXISTS teacher_subjects_select ON public.teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_insert ON public.teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_update ON public.teacher_subjects;
CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY teacher_subjects_insert ON public.teacher_subjects FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY teacher_subjects_update ON public.teacher_subjects FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- subject_selection_rules (single-row config)
DROP POLICY IF EXISTS subject_selection_rules_select ON public.subject_selection_rules;
DROP POLICY IF EXISTS subject_selection_rules_update ON public.subject_selection_rules;
CREATE POLICY subject_selection_rules_select ON public.subject_selection_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY subject_selection_rules_update ON public.subject_selection_rules FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- timetable_settings (single-row config)
DROP POLICY IF EXISTS timetable_settings_select ON public.timetable_settings;
DROP POLICY IF EXISTS timetable_settings_update ON public.timetable_settings;
CREATE POLICY timetable_settings_select ON public.timetable_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY timetable_settings_update ON public.timetable_settings FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- lms_lessons
DROP POLICY IF EXISTS lms_lessons_select ON public.lms_lessons;
DROP POLICY IF EXISTS lms_lessons_insert ON public.lms_lessons;
DROP POLICY IF EXISTS lms_lessons_update ON public.lms_lessons;
CREATE POLICY lms_lessons_select ON public.lms_lessons FOR SELECT TO authenticated USING (true);
CREATE POLICY lms_lessons_insert ON public.lms_lessons FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY lms_lessons_update ON public.lms_lessons FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- lms_quizzes
DROP POLICY IF EXISTS lms_quizzes_select ON public.lms_quizzes;
DROP POLICY IF EXISTS lms_quizzes_insert ON public.lms_quizzes;
DROP POLICY IF EXISTS lms_quizzes_update ON public.lms_quizzes;
CREATE POLICY lms_quizzes_select ON public.lms_quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY lms_quizzes_insert ON public.lms_quizzes FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY lms_quizzes_update ON public.lms_quizzes FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- lms_questions (keyed via quiz, but quiz_id uniquely identifies a class)
DROP POLICY IF EXISTS lms_questions_select ON public.lms_questions;
DROP POLICY IF EXISTS lms_questions_insert ON public.lms_questions;
DROP POLICY IF EXISTS lms_questions_update ON public.lms_questions;
CREATE POLICY lms_questions_select ON public.lms_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY lms_questions_insert ON public.lms_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM lms_quizzes q
            WHERE q.id = lms_questions.quiz_id
              AND (q.class_id = ANY(teacher_class_ids()) OR is_admin_user()))
  );
CREATE POLICY lms_questions_update ON public.lms_questions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM lms_quizzes q
            WHERE q.id = lms_questions.quiz_id
              AND (q.class_id = ANY(teacher_class_ids()) OR is_admin_user()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM lms_quizzes q
            WHERE q.id = lms_questions.quiz_id
              AND (q.class_id = ANY(teacher_class_ids()) OR is_admin_user()))
  );

-- lms_discussions
DROP POLICY IF EXISTS lms_discussions_select ON public.lms_discussions;
DROP POLICY IF EXISTS lms_discussions_insert ON public.lms_discussions;
DROP POLICY IF EXISTS lms_discussions_update ON public.lms_discussions;
CREATE POLICY lms_discussions_select ON public.lms_discussions FOR SELECT TO authenticated USING (true);
CREATE POLICY lms_discussions_insert ON public.lms_discussions FOR INSERT TO authenticated
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());
CREATE POLICY lms_discussions_update ON public.lms_discussions FOR UPDATE TO authenticated
  USING (class_id = ANY(teacher_class_ids()) OR is_admin_user())
  WITH CHECK (class_id = ANY(teacher_class_ids()) OR is_admin_user());

-- lms_posts (any authenticated user can post in a discussion; own-post delete)
DROP POLICY IF EXISTS lms_posts_select ON public.lms_posts;
DROP POLICY IF EXISTS lms_posts_insert ON public.lms_posts;
DROP POLICY IF EXISTS lms_posts_delete ON public.lms_posts;
CREATE POLICY lms_posts_select ON public.lms_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY lms_posts_insert ON public.lms_posts FOR INSERT TO authenticated
  WITH CHECK (user_id = public_user_id());
CREATE POLICY lms_posts_delete ON public.lms_posts FOR DELETE TO authenticated
  USING (user_id = public_user_id() OR is_admin_user());

-- path_requests
DROP POLICY IF EXISTS path_requests_select ON public.path_requests;
DROP POLICY IF EXISTS path_requests_insert ON public.path_requests;
DROP POLICY IF EXISTS path_requests_update ON public.path_requests;
CREATE POLICY path_requests_select ON public.path_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY path_requests_insert ON public.path_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = current_student_id() OR is_admin_user());
CREATE POLICY path_requests_update ON public.path_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = path_requests.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = path_requests.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- subject_selections
DROP POLICY IF EXISTS subject_selections_select ON public.subject_selections;
DROP POLICY IF EXISTS subject_selections_insert ON public.subject_selections;
DROP POLICY IF EXISTS subject_selections_update ON public.subject_selections;
CREATE POLICY subject_selections_select ON public.subject_selections FOR SELECT TO authenticated USING (true);
CREATE POLICY subject_selections_insert ON public.subject_selections FOR INSERT TO authenticated
  WITH CHECK (student_id = current_student_id() OR is_admin_user());
CREATE POLICY subject_selections_update ON public.subject_selections FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = subject_selections.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM students s
            WHERE s.id = subject_selections.student_id
              AND s.class_id = ANY(teacher_class_ids()))
    OR is_admin_user()
  );

-- student_transfers (admin only for writes)
DROP POLICY IF EXISTS student_transfers_select ON public.student_transfers;
DROP POLICY IF EXISTS student_transfers_insert ON public.student_transfers;
DROP POLICY IF EXISTS student_transfers_update ON public.student_transfers;
CREATE POLICY student_transfers_select ON public.student_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY student_transfers_insert ON public.student_transfers FOR INSERT TO authenticated
  WITH CHECK (is_admin_user());
CREATE POLICY student_transfers_update ON public.student_transfers FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- approval_requests (admin only for writes)
DROP POLICY IF EXISTS approval_requests_select ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_insert ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_update ON public.approval_requests;
CREATE POLICY approval_requests_select ON public.approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY approval_requests_insert ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (is_admin_user() OR public_user_id() = requested_by);
CREATE POLICY approval_requests_update ON public.approval_requests FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());
