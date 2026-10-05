// scripts/provision-auth-users.js
// Run once to create Supabase Auth accounts for all existing public.users.
// Usage: SUPABASE_SERVICE_KEY=<service_role_key> node scripts/provision-auth-users.js
//
// The service role key is NEVER committed. Get it from:
// https://supabase.com/dashboard/project/erlhyrswcqpqpqzbgmgb/settings/api
// under "service_role" (secret).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://erlhyrswcqpqpqzbgmgb.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY environment variable first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  // Fetch all users from public.users
  const { data: users, error } = await sb
    .from('users')
    .select('id, name, email, role, auth_user_id')
    .is('auth_user_id', null); // only provision ones not yet linked

  if (error) { console.error('Failed to fetch users:', error.message); process.exit(1); }
  console.log(`Found ${users.length} users to provision.`);

  for (const u of users) {
    // Create Supabase Auth account
    // Temporary password = HMA@ + first 4 chars of email + 2026
    // School must force-reset these on first login or use password reset flow
    const tempPassword = `HMA@${u.email.slice(0, 4)}2026`;

    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: u.email,
      password: tempPassword,
      email_confirm: true,  // skip email confirmation for existing users
      user_metadata: { name: u.name, role: u.role }
    });

    if (authErr) {
      if (authErr.message?.includes('already been registered')) {
        // User already exists in auth — find and link them
        const { data: existing } = await sb.auth.admin.listUsers();
        const found = existing?.users?.find(au => au.email === u.email);
        if (found) {
          await sb.from('users').update({ auth_user_id: found.id }).eq('id', u.id);
          console.log(`  Linked existing auth user: ${u.email}`);
        } else {
          console.warn(`  Could not link: ${u.email}`);
        }
        continue;
      }
      console.error(`  ERROR for ${u.email}:`, authErr.message);
      continue;
    }

    // Link auth_user_id back to public.users
    const { error: updateErr } = await sb
      .from('users')
      .update({ auth_user_id: authData.user.id })
      .eq('id', u.id);

    if (updateErr) {
      console.error(`  Failed to link ${u.email}:`, updateErr.message);
    } else {
      console.log(`  Provisioned: ${u.email}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
