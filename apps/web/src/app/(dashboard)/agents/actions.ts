"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { asRecord } from "@/lib/supabase/mappers";
import { createClient, getAuthSession } from "@/lib/supabase/server";

export interface AgentActionState {
  ok: boolean;
  message: string;
}

/**
 * Reads the tenant's jsonb settings, applies `patch`, and writes it back so
 * unrelated keys (tone, timezone, …) are preserved.
 */
async function mergeTenantSettings(
  patch: (existing: Record<string, unknown>) => Record<string, unknown>,
): Promise<AgentActionState> {
  if (isDemoMode) {
    return { ok: true, message: "Simulated in demo mode — connect Supabase to persist." };
  }

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    const { data: tenant, error: readError } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", session.tenantId)
      .single();

    if (readError) throw readError;

    const settings = patch(asRecord(tenant?.settings));

    const { error } = await supabase
      .from("tenants")
      .update({ settings })
      .eq("id", session.tenantId);

    if (error) throw error;

    revalidatePath("/agents");
    revalidatePath("/settings");
    return { ok: true, message: "Agents updated." };
  } catch (error) {
    console.error("[agents] settings update failed", error);
    return { ok: false, message: "Could not update agents. Try again." };
  }
}

export async function setAgentsPaused(paused: boolean): Promise<AgentActionState> {
  return mergeTenantSettings((existing) => ({ ...existing, ai_paused: paused }));
}

export async function setAgentPaused(
  agentId: string,
  paused: boolean,
): Promise<AgentActionState> {
  const id = agentId.slice(0, 60);

  return mergeTenantSettings((existing) => ({
    ...existing,
    agents_paused: { ...asRecord(existing.agents_paused), [id]: paused },
  }));
}
