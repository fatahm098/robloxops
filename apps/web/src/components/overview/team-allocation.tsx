import { RefreshCw } from "lucide-react";

import type { TeamLoad } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TeamAllocation({ loads }: { loads: TeamLoad[] }) {
  return (
    <section className="panel" aria-labelledby="team-allocation-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <h2 id="team-allocation-title" className="text-headline-sm text-ink">
          Team Allocation
        </h2>
        <span className="meta">{loads.length} Designers</span>
      </header>

      <ul className="space-y-4 px-4 py-4">
        {loads.map((member) => (
          <li key={member.id}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-[9px] text-ink-muted">
                {member.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-body-md font-medium text-ink">{member.name}</span>
                  <span className="tabular shrink-0 font-mono text-[10px] text-ink">
                    {member.load}%{" "}
                    <span className="text-ink-dim">({member.activeProjects} active)</span>
                  </span>
                </div>
                <p className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-ink-dim">
                  {member.specialty}
                </p>
              </div>
            </div>

            <div
              className="mt-2 h-1.5 overflow-hidden rounded-sm bg-surface-2"
              role="progressbar"
              aria-label={`${member.name} capacity`}
              aria-valuenow={member.load}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-sm bg-gradient-to-r",
                  member.load >= 85 ? "from-danger to-danger-bright" : "from-brand-deep to-brand",
                )}
                style={{ width: `${member.load}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="px-4 pb-4">
        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-line-strong text-body-md font-medium text-ink transition-colors hover:border-brand hover:bg-surface-2"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Rebalance Task Queue
        </button>
      </div>
    </section>
  );
}
