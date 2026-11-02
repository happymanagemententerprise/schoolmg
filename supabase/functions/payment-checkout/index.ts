// Payment checkout — initiates a gateway transaction for a student fee and
// returns the authorization/redirect URL. Called by the parent portal with
// the parent's Bearer token; the function inserts a pending
// payment_transactions row using the service-role client (parents can't write
// that table under RLS) and verifies the student belongs to the caller's school.
//
// Secrets (set with `supabase secrets set`):
//   PAYSTACK_SECRET_KEY, FLW_SECRET_KEY   (Interswitch not yet implemented)
//
// POST body: { student_id, fee_id?, gateway, amount?, callback_url, school_id? }

import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, verifyUser, callerContext } from "../_shared/supabase.ts";

async function initPaystack(reference: string, email: string, amount: number, callbackUrl: string, meta: Record<string, any>) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, amount: Math.round(amount * 100), currency: "NGN", reference, callback_url: callbackUrl, metadata: meta })
  });
  const j = await res.json();
  if (!res.ok || !j.data?.authorization_url) throw new Error(j.message || "Paystack initialization failed");
  return j.data.authorization_url as string;
}

async function initFlutterwave(reference: string, email: string, amount: number, callbackUrl: string) {
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("FLW_SECRET_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tx_ref: reference, amount, currency: "NGN", customer: { email }, redirect_url: callbackUrl, payment_options: "card" })
  });
  const j = await res.json();
  if (!res.ok || !j.data?.link) throw new Error(j.message || "Flutterwave initialization failed");
  return j.data.link as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await verifyUser(req.headers.get("Authorization"));
    if (!user) return new Response(JSON.stringify({ error: "Sign in required." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ctx = await callerContext(user.id);
    if (!ctx || !ctx.schoolIds.length) return new Response(JSON.stringify({ error: "No school access linked to this account." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const gateway = String(body.gateway || "");
    const studentId = body.student_id ? Number(body.student_id) : null;
    const feeId = body.fee_id ? Number(body.fee_id) : null;
    const callbackUrl = String(body.callback_url || "");
    const email = user.email || ctx.pubUser.email;
    if (!["paystack", "flutterwave", "interswitch"].includes(gateway)) return new Response(JSON.stringify({ error: "Unknown gateway." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!studentId || !callbackUrl) return new Response(JSON.stringify({ error: "student_id and callback_url are required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const schoolId = body.school_id && ctx.schoolIds.includes(String(body.school_id)) ? String(body.school_id) : ctx.schoolIds[0];
    const sb = serviceClient();

    // Validate the student belongs to the caller's school.
    const { data: student } = await sb.from("students").select("id,school_id").eq("id", studentId).maybeSingle();
    if (!student || String(student.school_id) !== schoolId) return new Response(JSON.stringify({ error: "Student not found in your school." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Parents must be linked to the student; admins may pay for any student.
    if (ctx.pubUser.role === "parent") {
      const { data: link } = await sb.from("parent_students").select("id").eq("parent_id", ctx.pubUser.id).eq("student_id", studentId).maybeSingle();
      if (!link) return new Response(JSON.stringify({ error: "This student is not linked to your parent account." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve the amount: explicit, or the outstanding balance on the fee.
    let amount = body.amount != null ? Number(body.amount) : null;
    if (amount == null && feeId) {
      const { data: fee } = await sb.from("student_fees").select("amount_due,amount_paid").eq("id", feeId).eq("student_id", studentId).maybeSingle();
      if (!fee) return new Response(JSON.stringify({ error: "Fee not found for this student." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      amount = Math.max(0, Number(fee.amount_due) - Number(fee.amount_paid));
    }
    if (amount == null || amount <= 0) return new Response(JSON.stringify({ error: "A positive amount is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const reference = `HMA-${schoolId.slice(0, 8)}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { error: insErr } = await sb.from("payment_transactions").insert({
      school_id: schoolId, student_id: studentId, parent_id: ctx.pubUser.role === "parent" ? ctx.pubUser.id : null,
      amount, gateway, reference, status: "pending",
      metadata: { fee_id: feeId ?? null, callback_url: callbackUrl }
    });
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    try {
      let authUrl: string;
      if (gateway === "paystack") authUrl = await initPaystack(reference, email, amount, callbackUrl, { student_id: studentId, fee_id: feeId, school_id: schoolId });
      else if (gateway === "flutterwave") authUrl = await initFlutterwave(reference, email, amount, callbackUrl);
      else throw new Error("Interswitch checkout is not yet implemented; configure the Interswitch merchant details first.");
      return new Response(JSON.stringify({ authorization_url: authUrl, reference, gateway }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      await sb.from("payment_transactions").update({ status: "failed" }).eq("reference", reference);
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Checkout failed." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
