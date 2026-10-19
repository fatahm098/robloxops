import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Clock3, Home, Repeat2, Sparkles } from "lucide-react";

import { getAnalytics } from "@/lib/insights";
import { cn, formatUsd } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics — RobloxOps",
};

export default async function AnalyticsPage() {
  const data = await getAnalytics();
  const peak = Math.max(1, ...data.usage.map((point) => point.projects));
  const maxRevenue = Math.max(1, ...data.usage.map((point) => point.revenueUsd));
  const agentInteractions = data.aiActions + data.humanEscalations;
  const automationRate =
    agentInteractions > 0 ? Math.round((data.aiActions / agentInteractions) * 100) : 0;

  const stats = [
    { label: "Revenue this month", value: formatUsd(data.revenueUsd), note: `${data.revenueDelta >= 0 ? "+" : ""}${data.revenueDelta}% vs prev. month`, icon: ArrowUpRight },
    { label: "Projects delivered", value: String(data.projectsDelivered), note: "last 30 days", icon: Sparkles },
    { label: "Avg turnaround", value: `${data.avgTurnaroundDays}d`, note: "brief → delivery", icon: Clock3 },
    { label: "Revision rate", value: `${data.revisionRate}%`, note: "of delivered orders", icon: Repeat2 },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">ANALYTICS</span>
      </nav>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Studio Analytics</h1>
          <p className="text-body-md text-ink-muted">
            Throughput, revenue and agent cost across the last six months.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
              {data.aiActions.toLocaleString()}
            </div>
            <div className="meta text-[9px] leading-tight">AI ACTIONS · 30D</div>
          </div>
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-brand">
              {formatUsd(data.agentCostUsd)}
            </div>
            <div className="meta text-[9px] leading-tight">AGENT COST</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel px-4 py-3.5">
            <div className="flex items-start justify-between">
              <span className="meta">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-ink-dim" aria-hidden="true" />
            </div>
            <div className="tabular mt-2 text-[26px] font-semibold leading-none text-ink">{stat.value}</div>
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">{stat.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-sm text-ink">Projects per month</h2>
            <span className="meta text-[9px]">LAST 6 MONTHS</span>
          </div>
          <div className="mt-6 flex h-52 items-end gap-3">
            {data.usage.map((point) => (
              <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="tabular font-mono text-[10px] text-ink-muted">{point.projects}</span>
                <div
                  className="w-full rounded-sm bg-gradient-to-t from-brand-deep to-brand"
                  style={{ height: `${Math.max(8, (point.projects / peak) * 160)}px` }}
                  role="img"
                  aria-label={`${point.label}: ${point.projects} projects`}
                />
                <span className="meta text-[9px]">{point.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-sm text-ink">Revenue trend</h2>
            <span className="meta text-[9px]">USD</span>
          </div>
          <ul className="mt-4 space-y-3">
            {data.usage.map((point) => (
              <li key={point.label} className="flex items-center gap-3">
                <span className="w-8 font-mono text-[10px] uppercase text-ink-dim">{point.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((point.revenueUsd / maxRevenue) * 100)}%` }}
                  />
                </div>
                <span className="tabular w-16 text-right font-mono text-[11px] text-ink-muted">
                  {formatUsd(point.revenueUsd)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="panel p-4 xl:col-span-2">
          <h2 className="text-headline-sm text-ink">Pipeline distribution</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.throughput.map((stage) => (
              <div key={stage.status} className="rounded border border-line bg-canvas px-3 py-2.5">
                <div className="tabular text-[18px] font-semibold text-ink">{stage.count}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
                  {stage.status}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3">
            <div>
              <div className="meta text-[9px]">Human escalations</div>
              <div className="tabular font-mono text-[15px] text-status-briefing">{data.humanEscalations}</div>
            </div>
            <div>
              <div className="meta text-[9px]">Agent cost / project</div>
              <div className="tabular font-mono text-[15px] text-ink">
                {formatUsd(data.agentCostUsd / Math.max(1, data.projectsDelivered))}
              </div>
            </div>
            <div>
              <div className="meta text-[9px]">Automation rate</div>
              <div className="tabular font-mono text-[15px] text-status-delivered">
                {automationRate}%
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="text-headline-sm text-ink">Top clients</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.topClients.map((client, index) => (
              <li key={client.name} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "tabular flex h-6 w-6 items-center justify-center rounded border font-mono text-[10px]",
                      index === 0
                        ? "border-brand/40 bg-brand/15 text-brand"
                        : "border-line bg-surface-2 text-ink-muted",
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-ink">{client.name}</div>
                    <div className="font-mono text-[10px] text-ink-dim">{client.projects} projects</div>
                  </div>
                </div>
                <span className="tabular font-mono text-[11px] text-ink-muted">{formatUsd(client.revenueUsd)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
