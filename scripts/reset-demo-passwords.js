// scripts/reset-demo-passwords.js
// One-off: reset Supabase Auth passwords for the demo accounts so the
// Playwright audit can log in. The service key is read ONLY from the
// environment — it is never written into this file or committed.
//
// Usage (in your own terminal, key never leaves your machine):
//   PowerShell:  $env:SUPABASE_SERVICE_KEY='<service_role key>'; node scripts/reset-demo-passwords.js
//   cmd.exe:     set SUPABASE_SERVICE_KEY=<service_role key> && node scripts/reset-demo-passwords.js
//
// Optional: override the password with DEMO_PW (defaults to HMA_Demo_2026!).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://erlhyrswcqpqpqzbgmgb.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const NEW_PASSWORD = process.env.DEMO_PW || 'HMA_Demo_2026!';

const EMAILS = [
  'admin@happyman.edu',
  'class@happyman.edu',
  'subject@happyman.edu',
  'hod@happyman.edu',
  'ama.osei@happyman.edu',
  'parent@happyman.edu',
  'emeka.okafor@happyman.edu',
];

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY in your environment first (do NOT paste it here).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const { data: list, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) { console.error('listUsers failed:', error.message); process.exit(1); }
  const byEmail = new Map((list?.users || []).map(u => [u.email?.toLowerCase(), u]));

  for (const email of EMAILS) {
    const existing = byEmail.get(email.toLowerCase());
    if (existing) {
      const { error: upErr } = await sb.auth.admin.updateUserById(existing.id, {
        password: NEW_PASSWORD,
        email_confirm: true,
      });
      console.log(upErr ? `FAIL  ${email}: ${upErr.message}` : `RESET ${email}`);
    } else {
      const { error: crErr } = await sb.auth.admin.createUser({
        email, password: NEW_PASSWORD, email_confirm: true,
      });
      console.log(crErr ? `FAIL  ${email}: ${crErr.message}` : `CREATE ${email}`);
    }
  }
  console.log('Done.');
}

main().catch(e => console.error(e));
