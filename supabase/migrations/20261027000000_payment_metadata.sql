-- ============================================================
--  Happy Man Academy — Payment schema + webhook confirmation
--
--  Self-contained payment tables + the idempotent confirm_payment() RPC
--  the gateway webhook calls. This is independent of 20261026000000 so the
--  payment/fee path works even if that broader platform migration has not
--  been applied yet — every statement is IF NOT EXISTS / OR REPLACE, so
--  running both in order is safe.
--
--  20261026000000 is still required for the OTHER modules (grading,
--  approvals, devices, branding, cron) and their tables.
--
--  Not executed by this repo's build.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fee_structures (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id   bigint REFERENCES public.classes(id) ON DELETE CASCADE,
  level      text,
  label      text   NOT NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  is_termly  boolean NOT NULL DEFAULT true,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_structures_school_idx ON public.fee_structures (school_id);

CREATE TABLE IF NOT EXISTS public.student_fees (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id        uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id       bigint NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id bigint NOT NULL REFERENCES public.fee_structures(id) ON DELETE CASCADE,
  term_id          bigint REFERENCES public.terms(id) ON DELETE CASCADE,
  amount_due       numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid      numeric(12,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','part_paid','paid','overpaid')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_fees_student_idx ON public.student_fees (student_id);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  uuid   NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id bigint REFERENCES public.students(id) ON DELETE SET NULL,
  parent_id  bigint REFERENCES public.users(id) ON DELETE SET NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  gateway    text   NOT NULL CHECK (gateway IN ('paystack','flutterwave','interswitch','cash')),
  reference  text   NOT NULL UNIQUE,
  status     text   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','successful','failed')),
  metadata   jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_transactions_school_idx ON public.payment_transactions (school_id);

-- metadata column for installs that created payment_transactions elsewhere.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.fee_structures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_structures_read  ON public.fee_structures;
CREATE POLICY fee_structures_read  ON public.fee_structures  FOR SELECT TO authenticated USING (private.has_school_access(school_id));
DROP POLICY IF EXISTS fee_structures_write ON public.fee_structures;
CREATE POLICY fee_structures_write ON public.fee_structures  FOR ALL    TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS student_fees_read ON public.student_fees;
CREATE POLICY student_fees_read ON public.student_fees FOR SELECT TO authenticated
  USING (private.has_school_access(school_id)
    OR student_id = public.current_student_id()
    OR student_id = ANY(public.parent_student_ids()));
DROP POLICY IF EXISTS student_fees_write ON public.student_fees;
CREATE POLICY student_fees_write ON public.student_fees FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS payment_transactions_read ON public.payment_transactions;
CREATE POLICY payment_transactions_read ON public.payment_transactions FOR SELECT TO authenticated
  USING (private.has_school_access(school_id)
    OR student_id = public.current_student_id()
    OR parent_id = public.public_user_id());
DROP POLICY IF EXISTS payment_transactions_write ON public.payment_transactions;
CREATE POLICY payment_transactions_write ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures, public.student_fees, public.payment_transactions TO authenticated;

-- Idempotent webhook confirmation. Marks the pending payment_transactions
-- row successful and reconciles student_fees (exact fee via metadata.fee_id,
-- else FIFO). record_fee_payment() remains for manual/cash entry.
CREATE OR REPLACE FUNCTION public.confirm_payment(p_reference text)
RETURNS public.payment_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row    public.payment_transactions%ROWTYPE;
  v_fee_id bigint;
BEGIN
  SELECT * INTO v_row FROM public.payment_transactions WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reference not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'successful' THEN
    RETURN v_row;  -- already processed (webhook replay)
  END IF;

  UPDATE public.payment_transactions
    SET status = 'successful'
    WHERE id = v_row.id
    RETURNING * INTO v_row;

  v_fee_id := NULLIF(v_row.metadata->>'fee_id', '')::bigint;
  IF v_fee_id IS NOT NULL THEN
    UPDATE public.student_fees
      SET amount_paid = amount_paid + v_row.amount,
          status = CASE WHEN amount_paid + v_row.amount >= amount_due THEN 'paid'
                        WHEN amount_paid + v_row.amount > 0  THEN 'part_paid'
                        ELSE status END
      WHERE id = v_fee_id AND student_id = v_row.student_id;
  ELSE
    UPDATE public.student_fees
      SET amount_paid = amount_paid + v_row.amount,
          status = CASE WHEN amount_paid + v_row.amount >= amount_due THEN 'paid'
                        WHEN amount_paid + v_row.amount > 0  THEN 'part_paid'
                        ELSE status END
      WHERE id = (
        SELECT id FROM public.student_fees
        WHERE student_id = v_row.student_id AND status IN ('unpaid','part_paid')
        ORDER BY created_at LIMIT 1
      );
  END IF;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_payment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_payment(text) TO authenticated;
