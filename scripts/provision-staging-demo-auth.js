// Create/link demo Auth identities for the isolated staging project only.
// The service key and demo password must be supplied through environment
// variables and are never written to the repository or printed.
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'fxakrqtybwlrjwlnylhq';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DEMO_PASSWORD = process.env.STAGING_DEMO_PASSWORD;

if (!SERVICE_KEY) throw new Error('Set SUPABASE_SERVICE_KEY in this shell first.');
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  throw new Error('Set STAGING_DEMO_PASSWORD to a staging-only password of at least 12 characters.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email, role, auth_user_id')
    .order('id');
  if (usersError) throw usersError;

  const { data: authList, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw authError;
  const authByEmail = new Map((authList.users || []).map(user => [user.email?.toLowerCase(), user]));

  let linked = 0;
  for (const user of users) {
    const email = user.email.toLowerCase();
    let authUser = authByEmail.get(email);

    if (authUser) {
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: user.name, role: user.role }
      });
      if (error) throw new Error(`Could not prepare Auth account for ${email}: ${error.message}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: user.name, role: user.role }
      });
      if (error) throw new Error(`Could not create Auth account for ${email}: ${error.message}`);
      authUser = data.user;
      authByEmail.set(email, authUser);
    }

    if (user.auth_user_id !== authUser.id) {
      const { error } = await supabase.from('users').update({ auth_user_id: authUser.id }).eq('id', user.id);
      if (error) throw new Error(`Could not link Auth account for ${email}: ${error.message}`);
      linked += 1;
    }
  }

  console.log(`Staging demo Auth accounts ready: ${users.length}; profile links added: ${linked}.`);
  console.log('Target: happyman-academy-staging. Shared staging password was not printed.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
