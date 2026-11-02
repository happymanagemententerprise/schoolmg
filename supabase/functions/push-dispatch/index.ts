// Pre-class push dispatcher — drains pending push_outbox rows and sends them
// via FCM (HTTP v1). The pg_cron job preclass_push_scan() (see
// 20261026000001) writes the outbox with dedup already applied; this function
// only sends. Firebase delivers to Android directly and to iOS via the APNs
// key configured in the Firebase console, so one FCM call covers both.
//
// Invoke from a scheduler (Supabase Cron / campus API) every minute with:
//   Authorization: Bearer <PUSH_DISPATCH_SECRET>
//
// Secrets: PUSH_DISPATCH_SECRET, FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON

import { serviceClient } from "../_shared/supabase.ts";
import { sendFcm } from "../_shared/fcm.ts";

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "PUSH_DISPATCH_SECRET not set." }), { status: 500, headers: { "Content-Type": "application/json" } });
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (auth !== secret) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const sb = serviceClient();
    const { data: rows, error } = await sb
      .from("push_outbox")
      .select("id,user_id,device_token,platform,payload")
      .eq("status", "pending")
      .order("created_at")
      .limit(50);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    if (!rows || !rows.length) return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } });

    let sent = 0, failed = 0;
    for (const row of rows) {
      const payload = row.payload || {};
      try {
        const ok = await sendFcm(row.device_token, payload);
        if (ok) {
          await sb.from("push_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
          sent++;
        } else {
          await sb.from("push_outbox").update({ status: "failed" }).eq("id", row.id);
          failed++;
        }
      } catch (e) {
        // FCM not configured, or a bad token — mark failed and continue.
        await sb.from("push_outbox").update({ status: "failed" }).eq("id", row.id);
        failed++;
      }
    }
    return new Response(JSON.stringify({ processed: rows.length, sent, failed }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Dispatch failed." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
