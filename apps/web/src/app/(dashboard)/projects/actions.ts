"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { getProjectReport, type ReportKind } from "@/lib/insights";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROJECT_STATUSES } from "@/lib/supabase/mappers";
import { createClient, getAuthSession } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

export interface ProjectActionResult {
  ok: boolean;
  message: string;
}

export interface ProjectReportContentResult {
  ok: boolean;
  message: string;
  markdown?: string;
  reportId?: string;
}

export interface CreateProjectInput {
  title: string;
  projectType?: string;
  customerId?: string;
  customerName?: string;
  customerDiscordUsername?: string;
  deadline?: string;
  priceUsd?: number | null;
  maxRevisions?: number | null;
}

export interface CreateProjectResult {
  ok: boolean;
  message: string;
  projectId?: string;
  reference?: string;
}

const PROJECT_TYPE_VALUES = ["clothing", "accessory", "avatar_item", "game_asset", "other"] as const;

const WORKER_URL = (process.env.INTERNAL_WORKER_URL ?? "http://localhost:8080").replace(/\/+$/, "");

/**
 * Best-effort request to the worker to generate + persist a project report.
 * Never throws: a failure must not block the human status change.
 */
async function requestProjectReport(tenantId: string, projectId: string): Promise<void> {
  const token = process.env.INTERNAL_WORKER_TOKEN;
  if (!token) {
    console.error("[projects] INTERNAL_WORKER_TOKEN is not configured — report skipped");
    return;
  }
  try {
    const response = await fetch(`${WORKER_URL}/report/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenant_id: tenantId, project_id: projectId, kind: "delivery" }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("[projects] report generation failed", response.status);
    }
  } catch (error) {
    console.error("[projects] report generation failed", error);
  }
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

async function requireTenant(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string; userId: string } | null
> {
  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return null;
  return { supabase, tenantId: session.tenantId, userId: session.userId };
}

/**
 * Creates a manual commission from the dashboard, resolving or creating the
 * customer first. The per-tenant reference code is allocated by the
 * `projects_set_reference` trigger, so it is intentionally omitted here.
 */
export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — connect Supabase to create projects." };
  }

  const title = input.title?.trim();
  if (!title) return { ok: false, message: "A project title is required." };
  if (title.length > 160) return { ok: false, message: "Keep the title under 160 characters." };

  const projectType =
    input.projectType && (PROJECT_TYPE_VALUES as readonly string[]).includes(input.projectType)
      ? input.projectType
      : "other";

  let priceUsd: number | null = null;
  if (input.priceUsd !== undefined && input.priceUsd !== null) {
    const parsed = Number(input.priceUsd);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, message: "Price must be a positive number." };
    }
    priceUsd = parsed;
  }

  let deadline: string | null = null;
  if (input.deadline) {
    const parsed = new Date(input.deadline);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "Deadline is not a valid date." };
    }
    deadline = parsed.toISOString();
  }

  let maxRevisions: number | undefined;
  if (input.maxRevisions !== undefined && input.maxRevisions !== null) {
    const parsed = Number(input.maxRevisions);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
      return { ok: false, message: "Max revisions must be between 0 and 10." };
    }
    maxRevisions = parsed;
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };
    const { supabase, tenantId, userId } = auth;

    let customerId: string | null = null;

    if (input.customerId) {
      const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", input.customerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, message: "Selected customer was not found." };
      customerId = data.id;
    } else {
      const displayName = input.customerName?.trim() || input.customerDiscordUsername?.trim();
      if (!displayName) {
        return { ok: false, message: "Pick a customer or enter a new customer name." };
      }
      const discordUsername = (input.customerDiscordUsername ?? "").trim().replace(/^@/, "") || null;
      const discordUserId = `manual:${discordUsername ?? displayName.toLowerCase()}`;

      const { data: existing, error: findError } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("discord_user_id", discordUserId)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        customerId = existing.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("customers")
          .insert({
            tenant_id: tenantId,
            discord_user_id: discordUserId,
            discord_username: discordUsername,
            display_name: input.customerName?.trim() || discordUsername || displayName,
          })
          .select("id")
          .single();

        if (insertError) {
          const { data: raced } = await supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("discord_user_id", discordUserId)
            .maybeSingle();
          if (!raced) throw insertError;
          customerId = raced.id;
        } else {
          customerId = inserted.id;
        }
      }
    }

    if (!customerId) return { ok: false, message: "Could not resolve the customer." };

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        title,
        project_type: projectType,
        deadline,
        price_usd: priceUsd,
        ...(maxRevisions === undefined ? {} : { max_revisions: maxRevisions }),
      })
      .select("id, reference_code")
      .single();

    if (projectError) throw projectError;

    const { error: auditError } = await supabase.from("agent_audit_log").insert({
      tenant_id: tenantId,
      agent_name: `human:${userId}`,
      action: "project_created",
      entity_type: "project",
      entity_id: project.id,
      input_summary: `type=${projectType}`,
      output_summary: `Manual order ${project.reference_code} created`,
      status: "success",
    });
    if (auditError) console.error("[projects.createProject] audit failed", auditError);

    revalidatePath("/projects");
    revalidatePath("/");
    revalidatePath("/tasks");
    return {
      ok: true,
      message: `Project ${project.reference_code} created.`,
      projectId: project.id,
      reference: project.reference_code,
    };
  } catch (error) {
    console.error("[projects.createProject] failed", error);
    return { ok: false, message: "Could not create the project. Try again." };
  }
}

/**
 * Human status override from the dashboard. Writes an audit row attributed to
 * the signed-in user, mirroring the `human:<id>` convention used elsewhere.
 */
export async function updateProjectStatus(
  projectId: string,
  status: string,
): Promise<ProjectActionResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — connect Supabase to change project status." };
  }
  if (!isProjectStatus(status)) {
    return { ok: false, message: "Unknown project status." };
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };

    const { data, error } = await auth.supabase
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("tenant_id", auth.tenantId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ok: false, message: "Project not found." };

    const { error: auditError } = await auth.supabase.from("agent_audit_log").insert({
      tenant_id: auth.tenantId,
      agent_name: `human:${auth.userId}`,
      action: "status_override",
      entity_type: "project",
      entity_id: projectId,
      input_summary: `status=${status}`,
      output_summary: `Project ${projectId} status set to ${status}`,
      status: "success",
    });

    if (auditError) console.error("[projects.updateProjectStatus] audit failed", auditError);

    // Delivering a project generates + persists its completion report. Best-effort:
    // a worker failure must not fail the status change.
    if (status === "delivered") {
      await requestProjectReport(auth.tenantId, projectId);
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return { ok: true, message: `Status set to ${status}.` };
  } catch (error) {
    console.error("[projects.updateProjectStatus] failed", error);
    return { ok: false, message: "Could not change the status. Try again." };
  }
}

/** Mints a short-lived signed download URL for a deliverable (service role). */
export async function createDeliverableDownloadUrl(
  deliverableId: string,
): Promise<{ ok: boolean; message: string; url?: string }> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — no file to download." };
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };

    const admin = createAdminClient();
    const { data: deliverable, error } = await admin
      .from("deliverables")
      .select("file_path")
      .eq("id", deliverableId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!deliverable) return { ok: false, message: "Deliverable not found." };

    const { data: signed, error: signError } = await admin.storage
      .from("deliverables")
      .createSignedUrl(deliverable.file_path, 300);

    if (signError || !signed) {
      throw signError ?? new Error("Could not create download URL");
    }

    return { ok: true, message: "Signed URL created.", url: signed.signedUrl };
  } catch (error) {
    console.error("[projects.createDeliverableDownloadUrl] failed", error);
    return { ok: false, message: "Could not prepare the download." };
  }
}

/** Reads the persisted report markdown for a project (tenant-scoped). */
export async function fetchProjectReport(
  projectId: string,
  kind: ReportKind = "delivery",
): Promise<ProjectReportContentResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — no report to download." };
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };

    const report = await getProjectReport(projectId, kind);
    if (!report) return { ok: false, message: "No report available yet." };

    return { ok: true, message: "Report ready.", markdown: report.contentMd, reportId: report.id };
  } catch (error) {
    console.error("[projects.fetchProjectReport] failed", error);
    return { ok: false, message: "Could not load the report." };
  }
}
