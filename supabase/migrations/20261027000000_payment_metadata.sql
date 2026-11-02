-- ============================================================
--  Happy Man Academy — Payment webhook confirmation
--
--  Adds a metadata column to payment_transactions (carries the fee_id the
--  parent paid, so the webhook reconciles the exact fee) and a
--  confirm_payment() RPC the gateway webhook calls after signature
--  verification. confirm_payment() is idempotent and reconciles student_fees.
--  record_fee_payment() (from 20261026000000) stays for manual/cash entry.
--
--  Idempotent. Not executed by this repo's build.
-- ============================================================

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

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
    -- FIFO: apply to the oldest outstanding fee for this student.
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
