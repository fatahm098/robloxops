"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { deleteTenantSecret, isSecretKey, setTenantSecret } from "@/lib/secrets";
import { asRecord } from "@/lib/supabase/mappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getAuthSession } from "@/lib/supabase/server";

export interface SettingsState {
  ok: boolean;
  message: string;
}

interface TenantSession {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  userId: string;
}

/**
 * Resolves the verified session. `tenantId`/`userId` come from the JWT, never
 * from request input.
 */
async function requireTenant(): Promise<TenantSession | null> {
  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return null;
  return { supabase, tenantId: session.tenantId, userId: session.userId };
}

/**
 * Reads `tenants.settings`, applies `patch`, and writes it back so unrelated
 * keys (tone, timezone, …) are preserved.
 */
async function mergeTenantSettings(
  patch: (existing: Record<string, unknown>) => Record<string, unknown>,
): Promise<SettingsState> {
  try {
    const context = await requireTenant();
    if (!context) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    const { supabase, tenantId } = context;
    const { data: tenant, error: readError } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    if (readError) throw readError;

    const settings = patch(asRecord(tenant?.settings));

    const { error } = await supabase
      .from("tenants")
      .update({ settings })
      .eq("id", tenantId);

    if (error) throw error;

    revalidatePath("/settings");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    console.error("[settings] settings merge failed", error);
    return { ok: false, message: "Could not save settings. Try again." };
  }
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const tone = String(formData.get("tone") ?? "friendly").slice(0, 40);
  const timezone = String(formData.get("timezone") ?? "UTC").slice(0, 60);
  const approvalMode = String(formData.get("approval_mode") ?? "auto");
  const maxRevisions = Number(formData.get("max_revisions") ?? 2);
  const aiPaused = formData.get("ai_paused") === "on";

  if (!["friendly", "professional", "playful"].includes(tone)) {
    return { ok: false, message: "Unknown tone." };
  }
  if (!Number.isFinite(maxRevisions) || maxRevisions < 0 || maxRevisions > 10) {
    return { ok: false, message: "Max revisions must be between 0 and 10." };
  }

  if (isDemoMode) {
    return {
      ok: true,
      message: "Saved in demo mode — connect Supabase to persist tenant settings.",
    };
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

    const existing =
      tenant && typeof tenant.settings === "object" && tenant.settings !== null
        ? (tenant.settings as Record<string, unknown>)
        : {};

    const settings = {
      ...existing,
      tone,
      timezone,
      approval_mode: approvalMode,
      max_revisions: maxRevisions,
      ai_paused: aiPaused,
    };

    const { error } = await supabase
      .from("tenants")
      .update({ settings })
      .eq("id", session.tenantId);

    if (error) throw error;

    revalidatePath("/settings");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    console.error("[settings] update failed", error);
    return { ok: false, message: "Could not save settings. Try again." };
  }
}

const TENANT_TABLES = [
  "deliverables",
  "conversations",
  "tasks",
  "briefs",
  "revisions",
  "followups",
  "reports",
  "agent_audit_log",
  "projects",
  "customers",
  "jobs",
] as const;

const STORAGE_BATCH_SIZE = 100;

/**
 * Hard-deletes every tenant-owned business row. The tenant, its users and the
 * auth users are intentionally kept. Service role bypasses RLS, so every query
 * filters by the session tenant id (never by request input).
 */
export async function deleteWorkspaceData(confirmation: string): Promise<SettingsState> {
  if (isDemoMode) {
    return { ok: false, message: "Workspace deletion is disabled in demo mode." };
  }

  if (confirmation !== "DELETE") {
    return { ok: false, message: "Type DELETE to confirm workspace data deletion." };
  }

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    const admin = createAdminClient();

    const { data: member, error: roleError } = await admin
      .from("users")
      .select("role")
      .eq("id", session.userId)
      .eq("tenant_id", session.tenantId)
      .maybeSingle();

    if (roleError) throw roleError;
    if (member?.role !== "owner") {
      return { ok: false, message: "Only the workspace owner can delete workspace data." };
    }

    const { data: deliverables, error: pathError } = await admin
      .from("deliverables")
      .select("file_path")
      .eq("tenant_id", session.tenantId);

    if (pathError) throw pathError;

    const paths = ((deliverables ?? []) as Array<{ file_path: string | null }>)
      .map((row) => row.file_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);

    for (let index = 0; index < paths.length; index += STORAGE_BATCH_SIZE) {
      const batch = paths.slice(index, index + STORAGE_BATCH_SIZE);
      const { error: storageError } = await admin.storage.from("deliverables").remove(batch);
      if (storageError) throw storageError;
    }

    for (const table of TENANT_TABLES) {
      const { error } = await admin.from(table).delete().eq("tenant_id", session.tenantId);
      if (error) throw error;
    }

    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/onboarding");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath("/customers");
    revalidatePath("/deliverables");
    revalidatePath("/revisions");
    revalidatePath("/audit");

    return { ok: true, message: "Workspace data deleted." };
  } catch (error) {
    console.error("[settings] workspace delete failed", error);
    return { ok: false, message: "Could not delete workspace data. Try again." };
  }
}

export interface IntegrationSecretInput {
  keyName: string;
  value: string;
}

function validateSecretValue(keyName: string, value: string): string | null {
  if (value.length < 1 || value.length > 4096) {
    return "Secret must be between 1 and 4096 characters.";
  }
  if (keyName === "LLM_BASE_URL") {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "Base URL must start with http:// or https://.";
      }
    } catch {
      return "Base URL must be a valid http(s) URL.";
    }
  }
  return null;
}

/** Stores an integration secret via the service-role RPC. Never logs the value. */
export async function saveIntegrationSecret(
  input: IntegrationSecretInput,
): Promise<SettingsState> {
  if (isDemoMode) {
    return {
      ok: false,
      message: "Integrations are disabled in demo mode — connect Supabase to store keys.",
    };
  }

  const keyName = String(input?.keyName ?? "");
  if (!isSecretKey(keyName)) {
    return { ok: false, message: "Unknown integration key." };
  }

  const value = String(input?.value ?? "");
  const invalid = validateSecretValue(keyName, value);
  if (invalid) {
    return { ok: false, message: invalid };
  }

  try {
    const context = await requireTenant();
    if (!context) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    await setTenantSecret(context.tenantId, keyName, value, context.userId);
    revalidatePath("/settings");
    return { ok: true, message: "Key saved." };
  } catch (error) {
    console.error("[settings] secret save failed", keyName, error);
    return { ok: false, message: "Could not save the key. Try again." };
  }
}

export async function clearIntegrationSecret(input: {
  keyName: string;
}): Promise<SettingsState> {
  if (isDemoMode) {
    return {
      ok: false,
      message: "Integrations are disabled in demo mode — connect Supabase to manage keys.",
    };
  }

  const keyName = String(input?.keyName ?? "");
  if (!isSecretKey(keyName)) {
    return { ok: false, message: "Unknown integration key." };
  }

  try {
    const context = await requireTenant();
    if (!context) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    await deleteTenantSecret(context.tenantId, keyName);
    revalidatePath("/settings");
    return { ok: true, message: "Key cleared." };
  } catch (error) {
    console.error("[settings] secret clear failed", keyName, error);
    return { ok: false, message: "Could not clear the key. Try again." };
  }
}

export interface LlmModelInput {
  modelFast?: string;
  modelMid?: string;
  modelVision?: string;
}

const LLM_MODEL_MAX_LENGTH = 120;

/** Merges non-secret model names into `tenants.settings.integrations.llm`. */
export async function saveLlmModels(input: LlmModelInput): Promise<SettingsState> {
  if (isDemoMode) {
    return {
      ok: false,
      message: "Model settings are disabled in demo mode — connect Supabase to persist.",
    };
  }

  const models: Record<string, string> = {};
  const entries: Array<[string, string | undefined]> = [
    ["model_fast", input?.modelFast],
    ["model_mid", input?.modelMid],
    ["model_vision", input?.modelVision],
  ];

  for (const [key, raw] of entries) {
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value.length > LLM_MODEL_MAX_LENGTH) {
      return { ok: false, message: "Model names must be 120 characters or fewer." };
    }
    models[key] = value;
  }

  return mergeTenantSettings((existing) => {
    const integrations = asRecord(existing.integrations);
    const llm = { ...asRecord(integrations.llm) };

    for (const [key] of entries) {
      if (!(key in models)) continue;
      if (models[key]) {
        llm[key] = models[key];
      } else {
        delete llm[key];
      }
    }

    return {
      ...existing,
      integrations: { ...integrations, llm },
    };
  });
}
