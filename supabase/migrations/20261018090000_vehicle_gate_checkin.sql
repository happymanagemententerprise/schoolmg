-- Vehicle-based day-student arrival and authorized non-parent drop-off.
-- PIN hashes are read and written only by the private Node API (service role).
DO $$
BEGIN
  IF to_regclass('public.gate_events') IS NULL THEN
    RAISE EXCEPTION 'Required table public.gate_events is missing. Apply the earlier attendance migration (20261017104739_attendance_safety_pwa.sql) and preceding migrations first.';
  END IF;
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Required table public.users is missing. Apply the project schema migrations first.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.parent_pickup_pins (
  parent_id bigint PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parent_pickup_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_pickup_pins FROM anon, authenticated;
GRANT ALL ON public.parent_pickup_pins TO service_role;

ALTER TABLE public.gate_events
  ADD COLUMN IF NOT EXISTS dropoff_by_type text NOT NULL DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS dropoff_parent_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dropoff_person_name text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS notification_message text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.gate_events DROP CONSTRAINT IF EXISTS gate_events_dropoff_by_type_check;
ALTER TABLE public.gate_events ADD CONSTRAINT gate_events_dropoff_by_type_check
  CHECK (dropoff_by_type IN ('parent', 'non_parent'));
ALTER TABLE public.gate_events DROP CONSTRAINT IF EXISTS gate_events_vehicle_plate_check;
ALTER TABLE public.gate_events ADD CONSTRAINT gate_events_vehicle_plate_check
  CHECK (vehicle_plate IS NULL OR length(vehicle_plate) BETWEEN 2 AND 20);
CREATE UNIQUE INDEX IF NOT EXISTS gate_events_idempotency_key_unique
  ON public.gate_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS gate_events_parent_time_idx
  ON public.gate_events(dropoff_parent_id, event_at DESC);

COMMENT ON TABLE public.parent_pickup_pins IS
  'Private caregiver authorization PIN hashes. Accessible only to the private Node API service role.';
COMMENT ON COLUMN public.gate_events.notification_message IS
  'Message snapshot sent to linked guardians for this vehicle gate event.';
