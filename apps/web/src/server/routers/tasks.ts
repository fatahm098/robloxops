import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mapTask, TASK_SELECT, TASK_STATUSES, type TaskRow } from "@/lib/supabase/mappers";
import { createTRPCRouter, tenantProcedure } from "../trpc";

const taskStatusSchema = z.enum(TASK_STATUSES);

export const tasksRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ status: taskStatusSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("tenant_id", ctx.tenantId)
        .order("priority", { ascending: false })
        .order("due_at", { ascending: true, nullsFirst: false });

      if (input?.status) {
        query = query.eq("status", input.status);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return ((data ?? []) as unknown as TaskRow[]).map(mapTask);
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: taskStatusSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tasks")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("tenant_id", ctx.tenantId)
        .select(TASK_SELECT)
        .maybeSingle();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      return mapTask(data as unknown as TaskRow);
    }),
});
