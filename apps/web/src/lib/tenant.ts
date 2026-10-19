import { demoTenant, isDemoMode, readContext, withFallback } from "@/lib/data";
import { mapTenantSettings, type TenantRow } from "@/lib/supabase/mappers";

export interface TenantSettings {
  name: string;
  slug: string;
  plan: "starter" | "growth" | "pro";
  discordGuildId: string | null;
  settings: Record<string, unknown>;
  aiPaused: boolean;
  monitoredChannels: string[];
  teamCount: number;
}

const DEMO_SETTINGS: Record<string, unknown> = {
  tone: "friendly",
  timezone: "Asia/Jakarta",
  approval_mode: "auto",
  max_revisions: 2,
  ai_paused: false,
  monitored_channel_ids: ["#commissions", "#support"],
};

function readMonitoredChannels(settings: Record<string, unknown>): string[] {
  for (const key of ["monitored_channel_ids", "monitored_channels"]) {
    const value = settings[key];
    if (Array.isArray(value)) {
      return [
        ...new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0),
        ),
      ];
    }
  }
  return [];
}

function demoSettings(): TenantSettings {
  const discordGuildId =
    demoTenant.discordGuild === "Not connected" ? null : demoTenant.discordGuild;

  return {
    name: demoTenant.name,
    slug: demoTenant.slug,
    plan: demoTenant.plan,
    discordGuildId,
    settings: { ...DEMO_SETTINGS },
    aiPaused: false,
    monitoredChannels: readMonitoredChannels(DEMO_SETTINGS),
    teamCount: 4,
  };
}

export async function getTenantSettings(): Promise<TenantSettings> {
  if (isDemoMode) return demoSettings();

  return withFallback<TenantSettings>(
    "getTenantSettings",
    async () => {
      const { supabase, tenantId } = await readContext();

      const [tenantResult, userResult] = await Promise.all([
        supabase
          .from("tenants")
          .select("id,name,slug,plan_id,discord_guild_id,settings")
          .eq("id", tenantId)
          .single(),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
      ]);

      if (tenantResult.error) throw tenantResult.error;
      if (userResult.error) throw userResult.error;

      const tenant = mapTenantSettings(tenantResult.data as unknown as TenantRow);

      return {
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        discordGuildId: tenant.discordGuildId,
        settings: tenant.settings,
        aiPaused: tenant.aiPaused,
        monitoredChannels: readMonitoredChannels(tenant.settings),
        teamCount: userResult.count ?? 0,
      };
    },
    demoSettings,
  );
}
