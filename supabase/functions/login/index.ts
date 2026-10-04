// ============================================================
//  Happy Man Academy — /functions/login Edge Function
//
//  Receives { email, password } in the request body.
//  Looks up the user server-side, checks the SHA-256 salted
//  hash, and returns the user record WITHOUT password_hash or
//  password_salt.  The browser never sees the hash.
//
//  Runs on Supabase Deno runtime (no npm, ESM URLs only).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── SHA-256 (same algorithm as the client-side hashPassword) ─
async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(plain: string, salt: string): Promise<string> {
  return sha256Hex((salt ?? '') + (plain ?? ''));
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let email: string, password: string;
  try {
    const body = await req.json();
    email    = (body.email    ?? '').trim().toLowerCase();
    password = (body.password ?? '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'email and password are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Use service_role key so we can read password_hash even after RLS
  // restricts the anon role from reading those columns.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Fetch only the columns we need for auth — never return hash/salt
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role, staff_role, tone, initials, phone, is_mentor, mentor_subject, mentor_bio, admin_tier, password_hash, password_salt')
    .eq('email', email)
    .limit(1);

  if (error || !users || users.length === 0) {
    // Return the same generic message whether the email doesn't exist
    // or the DB had an error — don't leak which it was.
    return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const user = users[0];

  // Verify password
  if (!user.password_hash || !user.password_salt) {
    return new Response(JSON.stringify({ error: 'Account has no password set' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const computed = await hashPassword(password, user.password_salt);
  if (computed !== user.password_hash) {
    return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Strip the hash and salt before sending to the browser
  const { password_hash: _h, password_salt: _s, ...safeUser } = user;

  return new Response(JSON.stringify({ user: safeUser }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
