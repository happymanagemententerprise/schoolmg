// Payment webhook — public endpoint (no caller JWT). Trust comes from
// re-verifying each transaction against the gateway's verify API using the
// secret key, then calling the idempotent confirm_payment() RPC, which marks
// the pending payment_transactions row successful and reconciles student_fees.
//
// Configure the gateway webhook URL in each provider's dashboard as:
//   https://<project>.functions.supabase.co/payment-webhook?gateway=paystack
//   https://<project>.functions.supabase.co/payment-webhook?gateway=flutterwave
//
// Secrets: PAYSTACK_SECRET_KEY, FLW_SECRET_KEY

import { serviceClient } from "../_shared/supabase.ts";

async function verifyPaystack(reference: string): Promise<boolean> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}` }
  });
  const j = await res.json();
  return res.ok && j.data && j.data.status === "success";
}

async function verifyFlutterwave(id: string | number): Promise<boolean> {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/${id}/verify`, {
    headers: { Authorization: `Bearer ${Deno.env.get("FLW_SECRET_KEY")}`, "Content-Type": "application/json" }
  });
  const j = await res.json();
  return res.ok && j.data && (j.data.status === "successful" || j.data.status === "completed");
}

Deno.serve(async (req: Request) => {
  try {
    const gateway = new URL(req.url).searchParams.get("gateway") || "";
    const body = await req.json().catch(() => ({}));
    const sb = serviceClient();
    let reference: string | null = null;
    let verified = false;

    if (gateway === "paystack") {
      reference = body?.data?.reference || null;
      if (reference) verified = await verifyPaystack(reference);
    } else if (gateway === "flutterwave") {
      reference = body?.data?.tx_ref || null;
      const txId = body?.data?.id || null;
      if (reference && txId) verified = await verifyFlutterwave(txId);
    } else {
      return new Response(JSON.stringify({ error: "Unknown gateway." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!verified || !reference) {
      // Not a successful payment (or a non-payment event) — acknowledge so the
      // gateway stops retrying; confirm_payment would no-op anyway.
      return new Response(JSON.stringify({ ok: true, verified: false }), { headers: { "Content-Type": "application/json" } });
    }

    const { error } = await sb.rpc("confirm_payment", { p_reference: reference });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, verified: true, reference }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Webhook failed." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
