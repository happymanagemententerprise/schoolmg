-- PRODUCTION ROLLOUT DRAFT — REVIEW BEFORE EXECUTION.
-- Target: happyman-academy (erlhyrswcqpqpqzbgmgb)
-- No SQL in this file has been applied to production or staging.
--
-- This reconciles grants for the checked-in Node API in server/index.js.
-- Production currently grants service_role all operations on all 54 public
-- relations. Staging's present grants are narrower but underprovide this API:
-- the server also uses its service-role client for roster, account, timetable,
-- and hostel reads/writes. Applying only the staging grants would break those
-- endpoints. This script grants the operations actually used by the API.
--
-- Preconditions:
--   * reviewed server auth/role checks and all db.from() call sites
--   * confirmed no other production service-role client needs additional tables
--   * take/verify a production backup and separately review the anon revocation
--   * apply only after the complete production access diff is approved

BEGIN;

-- Anonymous clients have no application data routes; the app checks Auth
-- before loading school records. The class_subjects lookup is unused by the
-- checked-in frontend/server code.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;

-- Remove the existing blanket service_role grants, then restore only the
-- checked-in API's table needs. Column-level grants on users are handled below.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Read-only data used by authentication, linked-parent, roster, timetable,
-- and current-term lookups (including embedded PostgREST relationships).
GRANT SELECT ON public.users, public.parent_students, public.students,
  public.classes, public.subjects, public.terms, public.teacher_classes,
  public.teacher_subjects, public.time_slots, public.timetables
  TO service_role;

-- Account creation uses the Admin Auth API and inserts the linked school
-- profile. The staging provisioning tool also updates only auth_user_id.
GRANT INSERT ON public.users TO service_role;
GRANT UPDATE (auth_user_id) ON public.users TO service_role;

-- Campus and hostel operations.
GRANT SELECT, INSERT ON public.hostels TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.hostel_staff_assignments TO service_role;
GRANT SELECT, INSERT ON public.hostel_presence_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.hostel_daily_summaries TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.gate_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.class_period_attendance TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.timetable_swaps TO service_role;

-- The admin endpoint changes only these two student fields.
GRANT UPDATE (residence_status, hostel_id) ON public.students TO service_role;

-- Private push and pickup-PIN records are read/written by server endpoints.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.parent_pickup_pins TO service_role;
GRANT INSERT ON public.notification_dispatches TO service_role;

-- Supabase REST writes that use identity/serial defaults also require sequence
-- privileges. Restrict these to sequences owned by tables this API inserts.
DO $grants$
DECLARE v_sequence record;
BEGIN
  FOR v_sequence IN
    SELECT seq_ns.nspname AS sequence_schema, seq.relname AS sequence_name
      FROM pg_class seq
      JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
      JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
      JOIN pg_class tbl ON tbl.oid = dep.refobjid
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
     WHERE seq.relkind = 'S'
       AND seq_ns.nspname = 'public'
       AND tbl_ns.nspname = 'public'
       AND tbl.relname = ANY (ARRAY[
         'users', 'hostels', 'hostel_staff_assignments',
         'hostel_presence_events', 'hostel_daily_summaries', 'gate_events',
         'class_period_attendance', 'timetable_swaps', 'push_subscriptions',
         'parent_pickup_pins', 'notification_dispatches'
       ])
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO service_role',
                   v_sequence.sequence_schema, v_sequence.sequence_name);
  END LOOP;
END;
$grants$;

COMMIT;

-- This does not reconcile authenticated grants or postgres default ACLs.
-- Those require the complete policy/routine diff and a separate reviewed step.
-- After approval, verify each protected endpoint and scheduled job with the
-- production API before considering the access-control rollout complete.
