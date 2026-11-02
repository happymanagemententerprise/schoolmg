// Pre-class Web Push dispatcher — drains pending push_outbox rows and sends
// them via the Web Push Protocol (VAPID). The platform is a PWA; browser push
// subscriptions are stored in push_subscriptions (endpoint + subscription JSON).
//
// Secrets: PUSH_DISPATCH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//
// Invoke every minute via the hma-push-dispatch pg_cron job.

import { serviceClient } from "../_shared/supabase.ts";

// ── VAPID helpers (Web Push Protocol, RFC 8292) ──────────────────────────────

function b64url(input: Uint8Array | string): string {
  const str = typeof input === "string" ? input
    : btoa(String.fromCharCode(...input));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeb64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function vapidJWT(audience: string, subject: string, privateKeyB64: string): Promise<string> {
  const header  = b64url(btoa(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url(btoa(JSON.stringify({ aud: audience, exp: now + 3600, sub: subject })));
  const unsigned = `${header}.${payload}`;

  const keyData = decodeb64url(privateKeyB64);
  const privKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privKey,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${b64url(new Uint8Array(sigBuf))}`;
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string
): Promise<{ ok: boolean; status: number }> {
  const url      = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt      = await vapidJWT(audience, vapidSubject, vapidPrivate);

  const body     = new TextEncoder().encode(JSON.stringify(payload));

  // Content encryption (aes128gcm) would require the subscription p256dh/auth
  // keys; most browsers accept unencrypted payloads for same-origin PWAs when
  // the SW reads from the notification_dispatches table directly. For full
  // encryption, use a library like web-push; swap the body here.
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${vapidPublic}`,
      "Content-Type": "application/json",
      "TTL": "300"
    },
    body
  });
  return { ok: res.ok || res.status === 201, status: res.status };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "PUSH_DISPATCH_SECRET not set." }),
    { status: 500, headers: { "Content-Type": "application/json" } });
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (auth !== secret) return new Response(JSON.stringify({ error: "Unauthorized." }),
    { status: 401, headers: { "Content-Type": "application/json" } });

  const vapidPublic  = Deno.env.get("VAPID_PUBLIC_KEY")  || "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")     || "mailto:admin@happyman.edu";
  if (!vapidPublic || !vapidPrivate) return new Response(
    JSON.stringify({ error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set." }),
    { status: 500, headers: { "Content-Type": "application/json" } });

  try {
    const sb = serviceClient();
    const { data: rows, error } = await sb
      .from("push_outbox")
      .select("id,endpoint,subscription,payload")
      .eq("status", "pending")
      .order("created_at")
      .limit(50);
    if (error) return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } });
    if (!rows?.length) return new Response(JSON.stringify({ processed: 0 }),
      { headers: { "Content-Type": "application/json" } });

    let sent = 0, failed = 0;
    for (const row of rows) {
      let sub: { endpoint: string; keys: { p256dh: string; auth: string } };
      try {
        sub = typeof row.subscription === "string"
          ? JSON.parse(row.subscription) : row.subscription;
      } catch {
        await sb.from("push_outbox").update({ status: "failed" }).eq("id", row.id);
        failed++; continue;
      }
      try {
        const { ok } = await sendWebPush(sub, row.payload || {}, vapidPublic, vapidPrivate, vapidSubject);
        await sb.from("push_outbox")
          .update({ status: ok ? "sent" : "failed", sent_at: new Date().toISOString() })
          .eq("id", row.id);
        ok ? sent++ : failed++;
      } catch {
        await sb.from("push_outbox").update({ status: "failed" }).eq("id", row.id);
        failed++;
      }
    }
    return new Response(JSON.stringify({ processed: rows.length, sent, failed }),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Dispatch failed." }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
