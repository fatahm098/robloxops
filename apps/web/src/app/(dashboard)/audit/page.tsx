import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { AuditTable, type AuditRow } from "@/components/audit/audit-table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Agent Audit Log — RobloxOps",
  description: "Append-only record of every automated action.",
};

const auditRows: AuditRow[] = [
  {
    id: "a_01",
    time: "09:42:18",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Parsed Discord intake message into draft brief",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1284,
    tokensOut: 386,
    costUsd: 0.000424,
    durationMs: 1840,
    status: "success",
  },
  {
    id: "a_02",
    time: "09:38:04",
    date: "Oct 19",
    agent: "Brief Collector",
    model: "gpt-4o-mini",
    action: "Extracted palette and poly budget from attachments",
    entity: "ROB-104",
    entityHref: "/projects/p_104",
    tokensIn: 2960,
    tokensOut: 742,
    costUsd: 0.000889,
    durationMs: 3210,
    status: "success",
  },
  {
    id: "a_03",
    time: "09:31:47",
    date: "Oct 19",
    agent: "QA Agent",
    model: "gpt-4o-mini",
    action: "Validated mesh bounds against UGC accessory spec",
    entity: "ROB-104",
    entityHref: "/projects/p_104",
    tokensIn: 8240,
    tokensOut: 512,
    costUsd: 0.001543,
    durationMs: 6480,
    status: "success",
  },
  {
    id: "a_04",
    time: "09:27:12",
    date: "Oct 19",
    agent: "Project Manager",
    model: "gpt-4o-mini",
    action: "Reassigned overdue QA task to Elena R.",
    entity: "TASK-104-03",
    tokensIn: 1120,
    tokensOut: 214,
    costUsd: 0.000296,
    durationMs: 980,
    status: "success",
  },
  {
    id: "a_05",
    time: "09:14:55",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Escalated ambiguous rig request to human review",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1640,
    tokensOut: 298,
    costUsd: 0.000425,
    durationMs: 1460,
    status: "escalated",
  },
  {
    id: "a_06",
    time: "08:58:31",
    date: "Oct 19",
    agent: "QA Agent",
    model: "claude-3.5-sonnet",
    action: "Texture resolution below 1024px threshold",
    entity: "ROB-097",
    entityHref: "/projects/p_097",
    tokensIn: 604,
    tokensOut: 142,
    costUsd: 0.003942,
    durationMs: 2940,
    status: "failure",
  },
  {
    id: "a_07",
    time: "08:44:09",
    date: "Oct 19",
    agent: "Brief Collector",
    model: "gpt-4o-mini",
    action: "Merged client revision notes into brief v3",
    entity: "ROB-097",
    entityHref: "/projects/p_097",
    tokensIn: 2240,
    tokensOut: 618,
    costUsd: 0.000707,
    durationMs: 2610,
    status: "success",
  },
  {
    id: "a_08",
    time: "08:21:36",
    date: "Oct 19",
    agent: "Project Manager",
    model: "gpt-4o-mini",
    action: "Queued delivery reminder in Discord ticket",
    entity: "ROB-102",
    entityHref: "/projects/p_102",
    tokensIn: 860,
    tokensOut: 164,
    costUsd: 0.000227,
    durationMs: 740,
    status: "success",
  },
  {
    id: "a_09",
    time: "07:59:02",
    date: "Oct 19",
    agent: "QA Agent",
    model: "gpt-4o-mini",
    action: "Asset manifest fetch timed out — retry scheduled",
    entity: "ROB-100",
    entityHref: "/projects/p_100",
    tokensIn: 980,
    tokensOut: 96,
    costUsd: 0.000205,
    durationMs: 12480,
    status: "failure",
  },
  {
    id: "a_10",
    time: "07:41:20",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Created commission from #order-098 thread",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1540,
    tokensOut: 402,
    costUsd: 0.000472,
    durationMs: 1980,
    status: "success",
  },
];

const filters = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "escalated", label: "Escalated" },
] as const;

type AuditFilter = (typeof filters)[number]["value"];

function isAuditFilter(value: string | undefined): value is AuditFilter {
  return filters.some((filter) => filter.value === value);
}

function filterHref(value: AuditFilter) {
  return value === "all" ? "/audit" : `/audit?status=${value}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const active: AuditFilter = isAuditFilter(params.status) ? params.status : "all";
  const rows = active === "all" ? auditRows : auditRows.filter((row) => row.status === active);

  const countFor = (value: AuditFilter) =>
    value === "all" ? auditRows.length : auditRows.filter((row) => row.status === value).length;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
            <Link href="/" className="transition-colors hover:text-ink-muted">
              Roblox-Ops
            </Link>
            <span aria-hidden className="text-line-muted">
              /
            </span>
            <span className="text-ink-muted">AI Ops &amp; Agents</span>
          </nav>
          <h1 className="mt-2 text-headline-xl text-ink">Agent Audit Log</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            Append-only record of every automated action.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-status-delivered">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-status-delivered" aria-hidden />
            Live
          </span>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-surface-2"
          >
            <Download aria-hidden className="h-4 w-4" strokeWidth={2} />
            Export JSON
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const isActive = active === filter.value;

            return (
              <Link
                key={filter.value}
                href={filterHref(filter.value)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center gap-2 rounded border px-3 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors",
                  "after:absolute after:inset-x-0 after:-bottom-1 after:-top-1 after:content-['']",
                  isActive
                    ? "border-brand/60 bg-[rgba(0,162,255,0.12)] text-brand"
                    : "border-line-strong text-ink-muted hover:border-line-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    "tabular text-[10px]",
                    isActive ? "text-brand/70" : "text-ink-dim",
                  )}
                >
                  {countFor(filter.value)}
                </span>
              </Link>
            );
          })}
        </nav>

        <span className="font-mono text-label-sm uppercase tracking-[0.08em] text-ink-dim">
          <span className="tabular text-ink-muted">{rows.length}</span> events · last 24h
        </span>
      </div>

      <AuditTable rows={rows} />
    </div>
  );
}
