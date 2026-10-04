// ============================================================
//  Happy Man Academy — /functions/verify-password Edge Function
//
//  Used by sensitive in-app actions (commit progression,
//  pool placement) that require the logged-in user to re-enter
//  their password as a second confirmation.
//
//  Receives { userId, password } — returns { ok: true } or 401.
//  The browser never sees the hash; verification stays server-side.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(plain: string, salt: string): Promise<string> {
  return sha256Hex((salt ?? '') + (plain ?? ''));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let userId: string, password: string;
  try {
    const body = await req.json();
    userId   = String(body.userId   ?? '').trim();
    password = String(body.password ?? '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!userId || !password) {
    return new Response(JSON.stringify({ error: 'userId and password are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: users, error } = await supabase
    .from('users')
    .select('password_hash, password_salt')
    .eq('id', Number(userId))
    .limit(1);

  if (error || !users || users.length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const user = users[0];
  if (!user.password_hash || !user.password_salt) {
    return new Response(JSON.stringify({ error: 'Account has no password set' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const computed = await hashPassword(password, user.password_salt);
  if (computed !== user.password_hash) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
