-- Attendance safety, residence classification, cover scheduling and PWA support.
-- All private operational writes are mediated by the Node API (service-role key
-- stays server-side); authenticated reads are scoped by RLS.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS residence_status text NOT NULL DEFAULT 'DAY_STUDENT';
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_residence_status_check;
ALTER TABLE public.students ADD CONSTRAINT students_residence_status_check
  CHECK (residence_status IN ('BOARDER', 'DAY_STUDENT'));
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS hostel_id bigint;
ALTER TABLE public.students REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS public.hostels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_hostel_id_fkey;
ALTER TABLE public.students ADD CONSTRAINT students_hostel_id_fkey
  FOREIGN KEY (hostel_id) REFERENCES public.hostels(id) ON DELETE SET NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','teacher','student','parent','security_guard','hostel_staff'));

CREATE TABLE IF NOT EXISTS public.hostel_staff_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hostel_id bigint NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  UNIQUE (hostel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.timetable_swaps (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id bigint NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
  covering_teacher_id bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  requested_by bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by bigint REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  effective_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS timetable_swaps_effective_idx
  ON public.timetable_swaps(timetable_id, effective_date, status);

CREATE TABLE IF NOT EXISTS public.class_period_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id bigint NOT NULL REFERENCES public.timetables(id) ON DELETE CASCADE,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT current_date,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  recorded_by bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS public.gate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('arrival','pickup')),
  method text NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','qr','rfid')),
  recorded_by bigint NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_at timestamptz NOT NULL DEFAULT now(),
  parent_sms_status text NOT NULL DEFAULT 'pending' CHECK (parent_sms_status IN ('pending','sent','failed','not_configured')),
  parent_sms_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gate_events_student_time_idx ON public.gate_events(student_id, event_at DESC);

CREATE TABLE IF NOT EXISTS public.hostel_presence_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hostel_id bigint NOT NULL REFERENCES public.hostels(id) ON DELETE RESTRICT,
  student_id bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('check_in','check_out','auto_checkout')),
  event_date date NOT NULL DEFAULT current_date,
  recorded_by bigint REFERENCES public.users(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hostel_presence_student_date_idx ON public.hostel_presence_events(student_id, event_date, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hostel_daily_summaries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hostel_id bigint NOT NULL REFERENCES public.hostels(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  checked_in_count integer NOT NULL DEFAULT 0,
  checked_out_count integer NOT NULL DEFAULT 0,
  auto_checkout_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostel_id, summary_date)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_dispatches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispatch_key text NOT NULL UNIQUE,
  user_id bigint REFERENCES public.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Only administrators can change residence_status through the browser.
-- Column grants prevent other authenticated roles from changing that field even
-- if another broad UPDATE policy is introduced later.
REVOKE UPDATE (residence_status) ON public.students FROM anon, authenticated;
GRANT UPDATE (residence_status) ON public.students TO authenticated;
DROP POLICY IF EXISTS students_residence_admin_update ON public.students;
CREATE POLICY students_residence_admin_update ON public.students FOR UPDATE TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_period_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_presence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;

-- Private service operations use the Node API with service role. Authenticated
-- users can read only the operational records appropriate to their role.
GRANT SELECT ON public.hostels, public.hostel_staff_assignments,
  public.timetable_swaps, public.class_period_attendance,
  public.gate_events, public.hostel_presence_events, public.hostel_daily_summaries TO authenticated;
GRANT ALL ON public.hostels, public.hostel_staff_assignments,
  public.timetable_swaps, public.class_period_attendance,
  public.gate_events, public.hostel_presence_events,
  public.hostel_daily_summaries,
  public.push_subscriptions, public.notification_dispatches TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS hostels_read ON public.hostels;
CREATE POLICY hostels_read ON public.hostels FOR SELECT TO authenticated USING (
  is_admin_user() OR EXISTS (
    SELECT 1 FROM public.hostel_staff_assignments a
    WHERE a.hostel_id = hostels.id AND a.user_id = public_user_id()
  ) OR EXISTS (
    SELECT 1 FROM public.hostel_presence_events h
    WHERE h.hostel_id = hostels.id AND h.student_id = ANY(parent_student_ids())
  )
);

DROP POLICY IF EXISTS hostel_staff_assignments_read ON public.hostel_staff_assignments;
CREATE POLICY hostel_staff_assignments_read ON public.hostel_staff_assignments FOR SELECT TO authenticated
  USING (is_admin_user() OR user_id = public_user_id());

DROP POLICY IF EXISTS timetable_swaps_read ON public.timetable_swaps;
CREATE POLICY timetable_swaps_read ON public.timetable_swaps FOR SELECT TO authenticated USING (
  is_admin_user() OR requested_by = public_user_id() OR covering_teacher_id = public_user_id()
  OR EXISTS (SELECT 1 FROM public.timetables t WHERE t.id = timetable_id AND t.teacher_id = public_user_id())
);

DROP POLICY IF EXISTS class_period_attendance_read ON public.class_period_attendance;
CREATE POLICY class_period_attendance_read ON public.class_period_attendance FOR SELECT TO authenticated USING (
  is_admin_user() OR student_id = current_student_id() OR student_id = ANY(parent_student_ids())
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.class_id = ANY(teacher_class_ids()))
);

DROP POLICY IF EXISTS gate_events_read ON public.gate_events;
CREATE POLICY gate_events_read ON public.gate_events FOR SELECT TO authenticated USING (
  is_admin_user() OR student_id = ANY(parent_student_ids())
);

DROP POLICY IF EXISTS hostel_presence_read ON public.hostel_presence_events;
CREATE POLICY hostel_presence_read ON public.hostel_presence_events FOR SELECT TO authenticated USING (
  is_admin_user() OR student_id = current_student_id() OR student_id = ANY(parent_student_ids())
  OR EXISTS (SELECT 1 FROM public.hostel_staff_assignments a
             WHERE a.hostel_id = public.hostel_presence_events.hostel_id AND a.user_id = public_user_id())
);

DROP POLICY IF EXISTS hostel_daily_summaries_read ON public.hostel_daily_summaries;
CREATE POLICY hostel_daily_summaries_read ON public.hostel_daily_summaries FOR SELECT TO authenticated USING (
  is_admin_user() OR EXISTS (SELECT 1 FROM public.hostel_staff_assignments a
    WHERE a.hostel_id = public.hostel_daily_summaries.hostel_id AND a.user_id = public_user_id())
  OR EXISTS (SELECT 1 FROM public.hostel_presence_events h
    WHERE h.hostel_id = public.hostel_daily_summaries.hostel_id AND h.student_id = ANY(parent_student_ids()))
);

-- Browser clients cannot access subscription secrets or dispatch bookkeeping.
REVOKE ALL ON public.push_subscriptions, public.notification_dispatches FROM anon, authenticated;

-- Enable Postgres Changes for the two live status feeds where the publication
-- is available (fresh Supabase projects include this publication).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.students; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.timetable_swaps; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.hostel_presence_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
