"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getAuthSession } from "@/lib/supabase/server";

export interface PrepareUploadInput {
  projectId: string;
  filename: string;
  sizeBytes?: number;
  fileType?: string;
}

export interface PrepareUploadResult {
  ok: boolean;
  message: string;
  deliverableId?: string;
  path?: string;
  token?: string;
  signedUrl?: string;
  version?: number;
}

export interface FinalizeUploadResult {
  ok: boolean;
  message: string;
}

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "rbxm",
  "rbxmx",
  "rbx",
  "fbx",
  "obj",
  "blend",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "tga",
]);

/** Strips directory components and anything outside a conservative charset. */
function sanitizeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return cleaned || "file";
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

async function requireTenant(): Promise<{ tenantId: string; userId: string } | null> {
  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return null;
  return { tenantId: session.tenantId, userId: session.userId };
}

/**
 * Step 1 of the upload: validate, create the Storage signed upload URL with the
 * service role, and insert the `deliverables` row (version = latest + 1).
 * The browser then PUTs the file directly to `signedUrl`/`token`.
 */
export async function prepareUpload(input: PrepareUploadInput): Promise<PrepareUploadResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — connect Supabase to upload deliverables." };
  }

  const filename = sanitizeFilename(input.filename);
  const extension = extensionOf(filename);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, message: `Unsupported file type ".${extension || "?"}".` };
  }
  if (input.sizeBytes !== undefined && input.sizeBytes > MAX_BYTES) {
    return { ok: false, message: "File exceeds the 50 MB limit." };
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };

    const userClient = await createClient();
    const { data: project, error: projectError } = await userClient
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return { ok: false, message: "Project not found." };

    const admin = createAdminClient();

    const { data: existing, error: countError } = await admin
      .from("deliverables")
      .select("version")
      .eq("tenant_id", auth.tenantId)
      .eq("project_id", input.projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (countError) throw countError;

    const version = (existing?.version ?? 0) + 1;
    const path = `tenants/${auth.tenantId}/deliverables/${input.projectId}/${filename}`;

    const { data: signed, error: signError } = await admin.storage
      .from("deliverables")
      .createSignedUploadUrl(path);

    if (signError || !signed) {
      throw signError ?? new Error("Could not create upload URL");
    }

    const { data: inserted, error: insertError } = await admin
      .from("deliverables")
      .insert({
        tenant_id: auth.tenantId,
        project_id: input.projectId,
        version,
        file_path: path,
        file_type: input.fileType ?? extension.toUpperCase(),
        file_size_bytes: input.sizeBytes ?? null,
        is_final: false,
        qa_status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw insertError ?? new Error("Could not record deliverable");
    }

    return {
      ok: true,
      message: "Signed upload URL created.",
      deliverableId: inserted.id,
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      version,
    };
  } catch (error) {
    console.error("[deliverables.prepareUpload] failed", error);
    return { ok: false, message: "Could not start the upload. Try again." };
  }
}

/**
 * Step 3 of the upload: after the browser has PUT the file, enqueue the QA job
 * so the worker checks the deliverable against the brief.
 */
export async function finalizeUpload(deliverableId: string): Promise<FinalizeUploadResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — nothing to finalise." };
  }

  try {
    const auth = await requireTenant();
    if (!auth) return { ok: false, message: "Session expired. Sign in again." };

    const admin = createAdminClient();

    const { data: deliverable, error: readError } = await admin
      .from("deliverables")
      .select("id, project_id")
      .eq("id", deliverableId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();

    if (readError) throw readError;
    if (!deliverable) return { ok: false, message: "Deliverable not found." };

    const { error: enqueueError } = await admin.from("jobs").insert({
      tenant_id: auth.tenantId,
      kind: "qa_check",
      payload: { deliverable_id: deliverable.id, project_id: deliverable.project_id },
    });

    if (enqueueError) throw enqueueError;

    revalidatePath("/deliverables");
    revalidatePath(`/projects/${deliverable.project_id}`);
    return { ok: true, message: "Upload complete — queued for QA." };
  } catch (error) {
    console.error("[deliverables.finalizeUpload] failed", error);
    return { ok: false, message: "Upload saved but QA could not be queued." };
  }
}
