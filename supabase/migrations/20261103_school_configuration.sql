-- Persist administrator-managed fee schedules and grading bands per school.
-- Apply after 20261006_rls_lockdown.sql and phase4_tenancy_reconciliation.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_configuration (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, id)
);

ALTER TABLE public.school_configuration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_configuration_read_member ON public.school_configuration;
CREATE POLICY school_configuration_read_member ON public.school_configuration
  FOR SELECT TO authenticated
  USING (private.has_school_access(school_id));
DROP POLICY IF EXISTS school_configuration_admin_write ON public.school_configuration;
CREATE POLICY school_configuration_admin_write ON public.school_configuration
  FOR ALL TO authenticated
  USING (private.has_school_access(school_id) AND public.is_admin_user())
  WITH CHECK (private.has_school_access(school_id) AND public.is_admin_user());

REVOKE ALL ON public.school_configuration FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_configuration TO authenticated;

COMMIT;
