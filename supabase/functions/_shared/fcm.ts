// FCM HTTP v1 sender. Uses a Google service account JSON (env
// FCM_SERVICE_ACCOUNT_JSON) to mint an OAuth2 access token, then sends to the
// FCM registration token via the v1 messages:send endpoint. Firebase
// delivers to Android directly and to iOS via the APNs key configured in the
// Firebase console, so the same call works for both platforms — store the
// FCM registration token (from the Firebase SDK) as user_device_tokens.device_token.

let _accessToken: string | null = null;
let _exp = 0;

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return b64url(bin);
}
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_accessToken && now < _exp - 60) return _accessToken;

  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!saRaw || !projectId) throw new Error("FCM_SERVICE_ACCOUNT_JSON or FCM_PROJECT_ID not set");
  const sa = JSON.parse(saRaw);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${bufToB64url(sig)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error("FCM token exchange failed: " + JSON.stringify(tok));
  _accessToken = tok.access_token;
  _exp = now + (tok.expires_in || 3600);
  return _accessToken;
}

// Returns true if accepted by FCM. Caller marks the outbox row accordingly.
export async function sendFcm(token: string, payload: Record<string, any>): Promise<boolean> {
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!projectId) throw new Error("FCM_PROJECT_ID not set");
  const accessToken = await getAccessToken();

  const data: Record<string, string> = {};
  for (const k of Object.keys(payload)) data[k] = String(payload[k]);

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } }
      }
    })
  });
  return res.ok;
}
