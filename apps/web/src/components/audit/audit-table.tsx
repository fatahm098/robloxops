import Link from "next/link";

import type { AuditStatus, AuditTableRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AuditRow = AuditTableRow;
export type { AuditStatus };

const statusBadge: Record<AuditStatus, { label: string; dot: string; className: string }> = {
  success: {
    label: "Success",
    dot: "bg-status-delivered",
    className: "border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] text-status-delivered",
  },
  failure: {
    label: "Failure",
    dot: "bg-danger-bright",
    className: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.15)] text-danger-bright",
  },
  escalated: {
    label: "Escalated",
    dot: "bg-status-briefing",
    className: "border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.15)] text-status-briefing",
  },
};

const numberFormat = new Intl.NumberFormat("en-US");

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse bg-canvas text-left">
          <caption className="sr-only">Append-only log of automated agent actions.</caption>
          <thead>
            <tr className="h-11 border-b-2 border-line-strong bg-surface-1">
              <th scope="col" className="meta whitespace-nowrap px-4 font-medium">
                Time
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 font-medium">
                Agent
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 font-medium">
                Action
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 font-medium">
                Entity
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 text-right font-medium">
                Tokens <span className="text-[9px] text-ink-dim">IN/OUT</span>
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 text-right font-medium">
                Cost
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 text-right font-medium">
                Duration
              </th>
              <th scope="col" className="meta whitespace-nowrap px-4 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const badge = statusBadge[row.status];

              return (
                <tr key={row.id} className="row-hover h-12">
                  <td className="whitespace-nowrap px-4 py-0">
                    <div className="tabular font-mono text-[11px] leading-4 text-ink">{row.time}</div>
                    <div className="font-mono text-[9px] uppercase leading-3 tracking-[0.08em] text-ink-dim">
                      {row.date}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-0">
                    <div className="text-[13px] leading-4 text-ink">{row.agent}</div>
                    <span className="mt-0.5 inline-block rounded-sm border border-line bg-surface-2 px-1.5 py-px font-mono text-[9px] leading-3 text-ink-dim">
                      {row.model}
                    </span>
                  </td>
                  <td className="max-w-[300px] px-4 py-0">
                    <div className="truncate text-[12px] text-ink-muted">{row.action}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-0">
                    {row.entityHref ? (
                      <Link
                        href={row.entityHref}
                        className="font-mono text-[11px] text-ink-muted transition-colors hover:text-brand"
                      >
                        {row.entity}
                      </Link>
                    ) : (
                      <span className="font-mono text-[11px] text-ink-muted">{row.entity}</span>
                    )}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-0 text-right font-mono text-[11px]">
                    <span className="text-ink">{numberFormat.format(row.tokensIn)}</span>
                    <span className="mx-1 text-ink-dim">/</span>
                    <span className="text-ink-dim">{numberFormat.format(row.tokensOut)}</span>
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-0 text-right font-mono text-[11px] text-ink">
                    ${row.costUsd.toFixed(6)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-0 text-right font-mono text-[11px] text-ink-muted">
                    {numberFormat.format(row.durationMs)}
                    <span className="ml-1 text-ink-dim">ms</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-0">
                    <span
                      className={cn(
                        "inline-flex h-[22px] items-center gap-1.5 rounded border px-2 font-mono text-[10px] uppercase tracking-[0.06em]",
                        badge.className,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", badge.dot)} aria-hidden />
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[12px] text-ink-dim">
                  No events match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-surface-1 px-4 py-3">
        <span className="meta text-ink-muted">Retention</span>
        <p className="text-[11px] leading-4 text-ink-dim">
          Append-only log — records are immutable and hash-chained. Retained 90 days on Starter, 1
          year on Pro.
        </p>
      </footer>
    </div>
  );
}
