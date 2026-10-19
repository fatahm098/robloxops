import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "../trpc";

const uploadInput = z.object({
  projectId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
});

/**
 * Sanitizes a user-supplied filename before it becomes a Storage path segment.
 * Strips directory components and anything outside a conservative charset.
 */
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

export const deliverablesRouter = createTRPCRouter({
  createUploadUrl: tenantProcedure.input(uploadInput).mutation(async ({ ctx, input }) => {
    const { data: project, error: projectError } = await ctx.supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (projectError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: projectError.message });
    }
    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    const filename = sanitizeFilename(input.filename);
    const path = `tenants/${ctx.tenantId}/deliverables/${input.projectId}/${filename}`;

    const { data, error } = await ctx.supabase.storage
      .from("deliverables")
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error?.message ?? "Could not create upload URL",
      });
    }

    return {
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
    };
  }),
});
