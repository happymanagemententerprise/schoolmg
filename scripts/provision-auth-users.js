// scripts/provision-auth-users.js
// Users receive an email invite to set their own password. No temporary passwords are generated.
//
// Run once to create Supabase Auth accounts for all existing public.users.
// Usage (production): SUPABASE_SERVICE_KEY=<key> node scripts/provision-auth-users.js
//         (dev only): SUPABASE_SERVICE_KEY=<key> node scripts/provision-auth-users.js --demo
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

const DEMO_MODE = process.argv.includes('--demo');
if (DEMO_MODE) {
  console.warn('⚠  DEMO MODE: Using deterministic passwords. Do NOT run this on a live database.');
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
    if (DEMO_MODE) {
      // Dev/demo fallback: deterministic password (never for production)
      const tempPassword = 'HMA_Demo_2026!';

      const { data: authData, error: authErr } = await sb.auth.admin.createUser({
        email: u.email,
        password: tempPassword,
        email_confirm: true,
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
        console.log(`  Provisioned (demo): ${u.email} — temp password: ${tempPassword}`);
      }
    } else {
      // Production: send invite email, user sets their own password
      const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
        type: 'invite',
        email: u.email,
        options: {
          redirectTo: 'https://happyman-academy.pages.dev',
          data: { name: u.name, role: u.role }
        }
      });

      if (linkErr) {
        if (linkErr.message?.includes('already been registered')) {
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
        console.error(`  ERROR for ${u.email}:`, linkErr.message);
        continue;
      }

      // Link auth_user_id back to public.users using the new auth user's id
      const { error: updateErr } = await sb
        .from('users')
        .update({ auth_user_id: linkData.user.id })
        .eq('id', u.id);

      if (updateErr) {
        console.error(`  Failed to link ${u.email}:`, updateErr.message);
      } else {
        console.log(`  Invite sent: ${u.email} → ${linkData.properties?.action_link}`);
      }
    }
  }

  console.log('Done.');
}

main().catch(console.error);
