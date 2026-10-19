import type { Metadata } from "next";
import Link from "next/link";

import { AuditExportButton } from "@/components/audit/audit-export-button";
import { AuditTable } from "@/components/audit/audit-table";
import { listAuditEntries } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Agent Audit Log — RobloxOps",
  description: "Append-only record of every automated action.",
};

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

  const allRows = await listAuditEntries(100);
  const rows = active === "all" ? allRows : allRows.filter((row) => row.status === active);

  const countFor = (value: AuditFilter) =>
    value === "all" ? allRows.length : allRows.filter((row) => row.status === value).length;

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
          <AuditExportButton rows={rows} />
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
