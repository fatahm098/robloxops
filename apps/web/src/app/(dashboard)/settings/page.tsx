import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Home, Link2, MessageSquare, ShieldAlert } from "lucide-react";

import { ApprovalForm } from "@/components/settings/approval-form";
import { DeleteWorkspaceButton } from "@/components/settings/delete-workspace-button";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { isDemoMode } from "@/lib/data";
import { listSecretStatuses } from "@/lib/secrets";
import { getSocialAccount } from "@/lib/portfolio";
import { asRecord } from "@/lib/supabase/mappers";
import { getTenantSettings } from "@/lib/tenant";

export const metadata: Metadata = {
  title: "Studio Settings — RobloxOps",
};

function readModel(settings: Record<string, unknown>, key: string): string {
  const llm = asRecord(asRecord(settings.integrations).llm);
  const value = llm[key];
  return typeof value === "string" ? value : "";
}

type ApprovalMode = "auto" | "preview" | "human";

function readApprovalKind(value: unknown, fallback: ApprovalMode): ApprovalMode {
  return value === "auto" || value === "preview" || value === "human" ? value : fallback;
}

export default async function SettingsPage() {
  const [tenant, secretStatuses, socialAccount] = await Promise.all([
    getTenantSettings(),
    listSecretStatuses(),
    getSocialAccount(),
  ]);

  const rawTone = tenant.settings.tone;
  const tone =
    rawTone === "professional" || rawTone === "playful" ? rawTone : "friendly";
  const rawTimezone = tenant.settings.timezone;
  const timezone =
    typeof rawTimezone === "string" &&
    ["UTC", "Asia/Jakarta", "America/New_York", "Europe/London"].includes(rawTimezone)
      ? rawTimezone
      : "UTC";
  const rawApproval = tenant.settings.approval_mode;
  const approvalMode: ApprovalMode =
    rawApproval === "preview" || rawApproval === "human" ? rawApproval : "auto";
  const approvalSettings = asRecord(tenant.settings.approval);
  const approvalDefaults: Record<string, ApprovalMode> = {
    first_message: readApprovalKind(approvalSettings.first_message, approvalMode),
    brief: readApprovalKind(approvalSettings.brief, approvalMode),
    deliverable: readApprovalKind(approvalSettings.deliverable, approvalMode),
    status: readApprovalKind(approvalSettings.status, approvalMode),
    followup: readApprovalKind(approvalSettings.followup, approvalMode),
  };
  const rawMaxRevisions = tenant.settings.max_revisions;
  const parsedMaxRevisions =
    typeof rawMaxRevisions === "number"
      ? rawMaxRevisions
      : typeof rawMaxRevisions === "string"
        ? Number(rawMaxRevisions)
        : Number.NaN;
  const maxRevisions =
    Number.isFinite(parsedMaxRevisions) && parsedMaxRevisions >= 0 && parsedMaxRevisions <= 10
      ? parsedMaxRevisions
      : 2;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">STUDIO SETTINGS</span>
      </nav>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Studio Settings</h1>
          <p className="text-body-md text-ink-muted">
            Tenant configuration, Discord connection and agent guardrails.
          </p>
        </div>
        <span className="inline-flex h-7 items-center rounded border border-line-strong bg-surface-1 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          PLAN · {tenant.plan}
        </span>
      </header>

      {isDemoMode ? (
        <div className="flex items-start gap-2 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-briefing" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Demo mode: values are read from the mock tenant and saving returns a simulated
            success. Add Supabase env vars to persist changes.
          </p>
        </div>
      ) : null}

      <section className="panel p-4">
        <h2 className="text-headline-sm text-ink">Studio profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="meta">Studio name</span>
            <input
              defaultValue={tenant.name}
              readOnly
              className="mt-1.5 h-11 w-full rounded border border-line bg-surface-1 px-3 text-[13px] text-ink-muted"
            />
          </label>
          <label className="block">
            <span className="meta">Workspace slug</span>
            <input
              defaultValue={tenant.slug}
              readOnly
              className="mt-1.5 h-11 w-full rounded border border-line bg-surface-1 px-3 font-mono text-[13px] text-ink-muted"
            />
          </label>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          Workspace identity is fixed after provisioning — contact support to rename.
        </p>
      </section>

      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-headline-sm text-ink">Discord connection</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              The platform bot listens in the selected channels and opens a thread per commission.
            </p>
          </div>
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered">
            <span className="h-1.5 w-1.5 rounded-full bg-status-delivered" />
            {isDemoMode ? "Simulated" : "Connected"}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border border-line bg-canvas px-3 py-2.5">
            <dt className="meta text-[9px]">Guild</dt>
            <dd className="mt-1 truncate font-mono text-[12px] text-ink">
              {tenant.discordGuildId ?? "Not connected"}
            </dd>
          </div>
          <div className="rounded border border-line bg-canvas px-3 py-2.5">
            <dt className="meta text-[9px]">Monitored channels</dt>
            <dd className="mt-1 font-mono text-[12px] text-ink">
              {tenant.monitoredChannels.length > 0
                ? tenant.monitoredChannels.join(" · ")
                : "None configured"}
            </dd>
          </div>
          <div className="rounded border border-line bg-canvas px-3 py-2.5">
            <dt className="meta text-[9px]">Permissions</dt>
            <dd className="mt-1 font-mono text-[12px] text-ink">threads · messages · history</dd>
          </div>
        </dl>

        <p className="mt-3 rounded border border-line bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
            Note:
          </span>{" "}
          The Discord bot token is platform-global — it is set once via the worker
          <code className="mx-1 font-mono text-ink-muted">.env</code>
          <code className="mr-1 font-mono text-ink-muted">DISCORD_BOT_TOKEN</code>
          and is not stored per tenant. Per-tenant Discord is the guild connection below;
          use the connect action to link or relink a server.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/api/discord/authorize"
            className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {isDemoMode ? "Connect Discord (needs env)" : "Reconnect Discord"}
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-11 items-center gap-2 rounded border border-line-strong px-4 text-[13px] text-ink-muted transition-colors hover:border-brand hover:text-brand"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Onboarding checklist
          </Link>
        </div>
      </section>

      <SettingsForm
        demoMode={isDemoMode}
        defaults={{
          tone,
          timezone,
          approvalMode,
          maxRevisions,
          aiPaused: tenant.aiPaused,
        }}
      />

      <ApprovalForm
        demoMode={isDemoMode}
        fallbackMode={approvalMode}
        defaults={approvalDefaults}
      />

      <IntegrationsForm
        demoMode={isDemoMode}
        statuses={secretStatuses}
        models={{
          modelFast: readModel(tenant.settings, "model_fast"),
          modelMid: readModel(tenant.settings, "model_mid"),
          modelVision: readModel(tenant.settings, "model_vision"),
        }}
        socialHandle={socialAccount.handle}
      />

      <section className="panel border-danger/40 p-4">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-danger-bright" aria-hidden="true" />
          <div>
            <h2 className="text-headline-sm text-ink">Danger zone</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              Deleting workspace data hard-deletes projects, customers, conversations and stored
              deliverables. The workspace, team and billing records are kept.
            </p>
          </div>
        </div>
        <DeleteWorkspaceButton demoMode={isDemoMode} />
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Requires owner role + typing DELETE to confirm
        </p>
      </section>
    </div>
  );
}
