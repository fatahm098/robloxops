import { TRPCError } from "@trpc/server";
import { createClient, getAuthSession, type SupabaseServerClient } from "@/lib/supabase/server";

export interface TRPCContext {
  supabase: SupabaseServerClient;
  user: { id: string; email: string | null } | null;
  tenantId: string | null;
}

/**
 * Builds the tRPC context from the request. Supabase auth lives in cookies, so
 * `headers` is accepted for adapter parity but is never used as a source of
 * tenant identity. Only the verified JWT claim is trusted.
 */
export async function createTRPCContext(_opts: { headers: Headers }): Promise<TRPCContext> {
  let supabase: SupabaseServerClient;

  try {
    supabase = await createClient();
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Supabase is not configured",
    });
  }

  const session = await getAuthSession(supabase);

  return {
    supabase,
    user: session ? { id: session.userId, email: session.email } : null,
    tenantId: session?.tenantId ?? null,
  };
}
