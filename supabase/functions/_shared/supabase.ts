// Supabase clients for edge functions. Supabase injects SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY and the anon key into the function runtime.
// The service-role client bypasses RLS (for trusted server-side writes);
// the anon client verifies the caller's JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLIC_ANON_KEY") ||
  "";

export const serviceClient = () =>
  createClient(url, serviceKey, { auth: { persistSession: false } });

export const anonClient = () =>
  createClient(url, anonKey, { auth: { persistSession: false } });

// Resolve the caller's Supabase Auth user from a Bearer token.
export async function verifyUser(authHeader: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await anonClient().auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

// Look up the public.users row + active schools for an auth user.
export async function callerContext(authUserId: string) {
  const sb = serviceClient();
  const { data: pubUser } = await sb
    .from("users")
    .select("id, email, role, admin_tier")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!pubUser) return null;
  const { data: memberships } = await sb
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", pubUser.id)
    .eq("is_active", true);
  return { pubUser, schoolIds: (memberships || []).map((m: any) => String(m.school_id)) };
}
