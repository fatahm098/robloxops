import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  mapProjectSummary,
  PROJECT_SELECT,
  PROJECT_STATUSES,
  type ProjectRow,
} from "@/lib/supabase/mappers";
import { createTRPCRouter, tenantProcedure } from "../trpc";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const projectStatusSchema = z.enum(PROJECT_STATUSES);

const listInput = z
  .object({
    status: z.union([projectStatusSchema, z.literal("all")]).optional().default("all"),
    search: z.string().trim().max(120).optional(),
  })
  .optional();

export const projectsRouter = createTRPCRouter({
  list: tenantProcedure.input(listInput).query(async ({ ctx, input }) => {
    const status = input?.status ?? "all";
    const search = input?.search?.toLowerCase();

    let query = ctx.supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("tenant_id", ctx.tenantId)
      .order("updated_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    const projects = ((data ?? []) as unknown as ProjectRow[]).map(mapProjectSummary);

    if (!search) return projects;

    return projects.filter(
      (project) =>
        project.reference.toLowerCase().includes(search) ||
        project.title.toLowerCase().includes(search) ||
        project.customer.displayName.toLowerCase().includes(search) ||
        project.discordTicket?.toLowerCase().includes(search),
    );
  }),

  byId: tenantProcedure
    .input(z.object({ id: z.string().trim().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const column = UUID_PATTERN.test(input.id) ? "id" : "reference_code";

      const { data, error } = await ctx.supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("tenant_id", ctx.tenantId)
        .eq(column, input.id)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return mapProjectSummary(data as unknown as ProjectRow);
    }),

  updateStatus: tenantProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        status: projectStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("projects")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.projectId)
        .eq("tenant_id", ctx.tenantId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const { error: auditError } = await ctx.supabase.from("agent_audit_log").insert({
        tenant_id: ctx.tenantId,
        agent_name: `human:${ctx.user.id}`,
        action: "status_override",
        entity_type: "project",
        entity_id: input.projectId,
        input_summary: `status=${input.status}`,
        output_summary: `Project ${input.projectId} status set to ${input.status}`,
        status: "success",
      });

      if (auditError) {
        console.error("[projects.updateStatus] audit log insert failed", auditError);
      }

      return { id: data.id, status: input.status };
    }),
});
