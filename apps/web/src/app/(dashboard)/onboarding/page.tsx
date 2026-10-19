import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Circle, Home } from "lucide-react";

import { isDemoMode } from "@/lib/data";
import { getTenantSettings } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Onboarding — RobloxOps",
};

function buildSteps(input: {
  discordConnected: boolean;
  channelsConfigured: boolean;
  guardrailsReviewed: boolean;
  designersInvited: boolean;
}) {
  return [
    {
      title: "Connect your Discord server",
      body: "Authorise the platform bot with thread and message permissions. One guild per workspace.",
      href: "/api/discord/authorize",
      cta: "Connect Discord",
      done: input.discordConnected,
    },
    {
      title: "Choose monitored channels",
      body: "Pick the channels where customers post commissions. Everything else is ignored.",
      href: "/settings",
      cta: "Configure channels",
      done: input.channelsConfigured,
    },
    {
      title: "Review agent guardrails",
      body: "Set tone, approval mode and the revision cap before the first customer message.",
      href: "/settings",
      cta: "Open settings",
      done: input.guardrailsReviewed,
    },
    {
      title: "Invite your designers",
      body: "Designers see the prepared queue and upload deliverables. No admin access needed.",
      href: "/tasks",
      cta: "Open task queue",
      done: input.designersInvited,
    },
  ];
}

export default async function OnboardingPage() {
  const tenant = await getTenantSettings();
  const STEPS = buildSteps({
    discordConnected: Boolean(tenant.discordGuildId),
    channelsConfigured: tenant.monitoredChannels.length > 0,
    guardrailsReviewed:
      tenant.settings.tone !== undefined && tenant.settings.approval_mode !== undefined,
    designersInvited: tenant.teamCount > 1,
  });
  const completed = STEPS.filter((step) => step.done).length;
  const progress = Math.round((completed / STEPS.length) * 100);

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">ONBOARDING</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-headline-xl leading-tight text-ink">Set up {tenant.name}</h1>
        <p className="text-body-md text-ink-muted">
          Four steps to a working commission pipeline. Nothing is charged until the first
          project is delivered.
        </p>
      </header>

      <section className="panel p-4">
        <div className="flex items-center justify-between">
          <span className="meta">Setup progress</span>
          <span className="tabular font-mono text-[12px] text-brand">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          {completed} of {STEPS.length} complete
          {isDemoMode ? " · demo mode" : ""}
        </p>
      </section>

      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                step.done
                  ? "border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] text-status-delivered"
                  : "border-line-strong bg-surface-2 text-ink-muted",
              )}
            >
              {step.done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-ink">{step.title}</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{step.body}</p>
            </div>

            <Link
              href={step.href}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded border border-line-strong px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-brand hover:text-brand"
            >
              {step.done ? "Review" : step.cta}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 rounded border border-line bg-surface-1 px-3 py-2.5">
        <Circle className="h-3 w-3 text-brand" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          First commission usually appears within 10 seconds of a Discord message
        </p>
      </div>
    </div>
  );
}
