import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  asRecord,
  mapAuditEntry,
  AUDIT_SELECT,
  type AuditLogRow,
} from "@/lib/supabase/mappers";
import { createTRPCRouter, tenantProcedure } from "../trpc";

const auditStatusSchema = z.enum(["success", "failure", "escalated"]);

export const agentsRouter = createTRPCRouter({
  audit: tenantProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional().default(50),
          status: auditStatusSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("agent_audit_log")
        .select(AUDIT_SELECT)
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 50);

      if (input?.status) {
        query = query.eq("status", input.status);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return ((data ?? []) as unknown as AuditLogRow[]).map(mapAuditEntry);
    }),

  /**
   * Emergency stop. Merges `ai_paused` into the tenant's jsonb settings so
   * unrelated settings keys are preserved. Pass `{ paused: false }` to resume.
   */
  pauseAll: tenantProcedure
    .input(z.object({ paused: z.boolean().optional().default(true) }).optional())
    .mutation(async ({ ctx, input }) => {
      const paused = input?.paused ?? true;

      const { data: tenant, error: readError } = await ctx.supabase
        .from("tenants")
        .select("settings")
        .eq("id", ctx.tenantId)
        .single();

      if (readError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: readError.message });
      }

      const settings = { ...asRecord(tenant.settings), ai_paused: paused };

      const { error: updateError } = await ctx.supabase
        .from("tenants")
        .update({ settings })
        .eq("id", ctx.tenantId);

      if (updateError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      }

      return { aiPaused: paused };
    }),
});
