// Birthday email digest — reads today's birthday school_notifications (written
// by the birthday_digest() pg_cron job), groups them per recipient, and emails
// each recipient a digest. Dedup via notification_dispatches so re-runs the
// same day don't double-send.
//
// Invoke daily (see 20261028000000_schedule_dispatch.sql) with:
//   Authorization: Bearer <EMAIL_DIGEST_SECRET>
//
// Secrets: EMAIL_DIGEST_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

import { serviceClient } from "../_shared/supabase.ts";
import { sendMail } from "../_shared/smtp.ts";

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("EMAIL_DIGEST_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "EMAIL_DIGEST_SECRET not set." }), { status: 500, headers: { "Content-Type": "application/json" } });
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (auth !== secret) return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const sb = serviceClient();
    const today = new Date().toISOString().slice(0, 10);
    const start = `${today}T00:00:00Z`;
    const end = `${today}T23:59:59Z`;

    // Birthday in-app notifications created today, addressed to specific users.
    const { data: rows, error } = await sb
      .from("school_notifications")
      .select("id,user_id,body")
      .eq("kind", "birthday_digest")
      .gte("created_at", start)
      .lte("created_at", end);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    if (!rows || !rows.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } });

    // Group notifications by recipient.
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.user_id) continue;
      const uid = String(r.user_id);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(r.body || "A student celebrates a birthday today.");
    }

    // Resolve recipient emails.
    const userIds = [...byUser.keys()];
    const { data: users } = await sb.from("users").select("id,email,name").in("id", userIds.map(Number));
    const emailByUser = new Map((users || []).map((u: any) => [String(u.id), u]));

    let sent = 0;
    for (const [uid, items] of byUser) {
      const u: any = emailByUser.get(uid);
      if (!u?.email) continue;

      // Dedup per recipient per day.
      const key = `email-digest:${uid}:${today}`;
      const { data: existing } = await sb.from("notification_dispatches")
        .select("dispatch_key").eq("dispatch_key", key).maybeSingle();
      if (existing) continue;

      const list = items.map(b => `<li>${b}</li>`).join("");
      await sendMail({
        to: u.email,
        subject: "Birthday reminders — today",
        html: `<p>Hi ${u.name || ""},</p><p>Students celebrating a birthday today:</p><ul>${list}</ul><p style="color:#888;font-size:11px">Happy Man Academy</p>`
      });
      await sb.from("notification_dispatches").insert({ dispatch_key: key, user_id: Number(uid), notification_type: "email_digest" });
      sent++;
    }
    return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Email digest failed." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
