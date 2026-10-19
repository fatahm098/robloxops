import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type SupabaseServerClient = SupabaseClient;

/**
 * Server-side Supabase client bound to the request cookie store.
 * Next 15 exposes `cookies()` asynchronously.
 */
export async function createClient(): Promise<SupabaseServerClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware.
        }
      },
    },
  });
}

export interface AuthSession {
  userId: string;
  email: string | null;
  tenantId: string | null;
}

/**
 * Resolves the authenticated user and the `tenant_id` claim from the verified
 * JWT. The claim is the only trusted source of tenant identity on the server.
 */
export async function getAuthSession(
  supabase: SupabaseServerClient,
): Promise<AuthSession | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  let tenantId: string | null = null;

  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    if (claimsData) {
      tenantId = readTenantId(claimsData.claims as unknown as Record<string, unknown>);
    }
  } catch {
    // getClaims can fail on older projects; fall back to app_metadata below.
  }

  if (!tenantId) {
    tenantId = readTenantId(userData.user.app_metadata as Record<string, unknown>);
  }

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    tenantId,
  };
}

function readTenantId(source: Record<string, unknown> | null | undefined): string | null {
  if (!source) return null;
  const candidate = source.tenant_id ?? source.tenantId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}
