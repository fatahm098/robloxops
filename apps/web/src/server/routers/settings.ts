import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  asRecord,
  mapTenantSettings,
  type TenantRow,
  type TenantSettingsView,
} from "@/lib/supabase/mappers";
import { createTRPCRouter, tenantProcedure } from "../trpc";

const TENANT_SELECT = "id,name,slug,plan_id,discord_guild_id,settings";

async function readTenantSettings(ctx: {
  supabase: SupabaseServerClient;
  tenantId: string;
}): Promise<TenantSettingsView> {
  const { data, error } = await ctx.supabase
    .from("tenants")
    .select(TENANT_SELECT)
    .eq("id", ctx.tenantId)
    .single();

  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }

  return mapTenantSettings(data as unknown as TenantRow);
}

export const settingsRouter = createTRPCRouter({
  get: tenantProcedure.query(({ ctx }) => readTenantSettings(ctx)),

  update: tenantProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        discordGuildId: z.string().trim().max(64).nullable().optional(),
        settings: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};

      if (input.name !== undefined) patch.name = input.name;
      if (input.discordGuildId !== undefined) patch.discord_guild_id = input.discordGuildId;

      if (input.settings) {
        const { data: current, error: readError } = await ctx.supabase
          .from("tenants")
          .select("settings")
          .eq("id", ctx.tenantId)
          .single();

        if (readError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: readError.message });
        }

        patch.settings = { ...asRecord(current.settings), ...input.settings };
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await ctx.supabase
          .from("tenants")
          .update(patch)
          .eq("id", ctx.tenantId);

        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        }
      }

      return readTenantSettings(ctx);
    }),
});
