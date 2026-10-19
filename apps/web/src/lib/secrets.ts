import { isDemoMode } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getAuthSession } from "@/lib/supabase/server";

export const SECRET_KEYS = [
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "DISCORD_BOT_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

export interface SecretStatus {
  keyName: SecretKey;
  last4: string | null;
  updatedAt: string | null;
}

export function isSecretKey(value: string): value is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(value);
}

interface TenantSecretRow {
  key_name: string;
  last4: string | null;
  updated_at: string | null;
}

/**
 * Reads the tenant's secret metadata (never the plaintext) with the user-scoped
 * client so RLS enforces the current tenant. Demo mode and errors return `{}`.
 */
export async function listSecretStatuses(): Promise<Record<string, SecretStatus>> {
  if (isDemoMode) return {};

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) return {};

    const { data, error } = await supabase
      .from("tenant_secrets")
      .select("key_name,last4,updated_at")
      .eq("tenant_id", session.tenantId);

    if (error) throw error;

    const statuses: Record<string, SecretStatus> = {};
    for (const row of (data ?? []) as TenantSecretRow[]) {
      if (!isSecretKey(row.key_name)) continue;
      statuses[row.key_name] = {
        keyName: row.key_name,
        last4: row.last4 ?? null,
        updatedAt: row.updated_at ?? null,
      };
    }
    return statuses;
  } catch (error) {
    console.error("[secrets] list failed", error);
    return {};
  }
}

function assertSecretKey(keyName: string): asserts keyName is SecretKey {
  if (!isSecretKey(keyName)) {
    throw new Error(`Unsupported secret key: ${keyName}`);
  }
}

/**
 * Writes a secret through the service-role client. `tenantId` must come from the
 * verified session, never from request input. The plaintext never leaves the
 * server and is never logged.
 */
export async function setTenantSecret(
  tenantId: string,
  keyName: string,
  value: string,
  userId: string,
): Promise<void> {
  assertSecretKey(keyName);

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_tenant_secret", {
    p_tenant_id: tenantId,
    p_key_name: keyName,
    p_value: value,
    p_updated_by: userId,
  });

  if (error) throw error;
}

export async function deleteTenantSecret(
  tenantId: string,
  keyName: string,
): Promise<void> {
  assertSecretKey(keyName);

  const admin = createAdminClient();
  const { error } = await admin.rpc("delete_tenant_secret", {
    p_tenant_id: tenantId,
    p_key_name: keyName,
  });

  if (error) throw error;
}

/**
 * Server-only plaintext read (e.g. resolving a per-tenant Stripe key). Throws on
 * an RPC failure so callers can fall back explicitly.
 */
export async function readTenantSecret(
  tenantId: string,
  keyName: string,
): Promise<string | null> {
  assertSecretKey(keyName);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_tenant_secret", {
    p_tenant_id: tenantId,
    p_key_name: keyName,
  });

  if (error) throw error;
  return typeof data === "string" && data.length > 0 ? data : null;
}
