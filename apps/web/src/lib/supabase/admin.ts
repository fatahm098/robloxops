import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * SERVER ONLY. Never import this module from a Client Component or expose the
 * service-role key to the browser. Service role bypasses RLS, so every query
 * built with this client must still filter by tenant_id explicitly.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase admin client can only be used on the server");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the admin client",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
