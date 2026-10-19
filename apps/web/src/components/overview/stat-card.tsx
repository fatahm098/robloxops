import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatTone = "brand" | "danger" | "success" | "neutral";

const toneClasses: Record<StatTone, string> = {
  brand: "border-[rgba(0,162,255,0.3)] bg-[rgba(0,162,255,0.12)] text-brand",
  danger: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] text-danger-soft",
  success: "border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.12)] text-status-delivered",
  neutral: "border-line-strong bg-surface-2 text-ink-muted",
};

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  badge?: string;
  badgeTone?: StatTone;
  footer: ReactNode;
}

export function StatCard({ label, value, unit, badge, badgeTone = "neutral", footer }: StatCardProps) {
  return (
    <section className="panel flex min-h-[172px] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="meta max-w-[124px] leading-[15px]">{label}</h2>
        {badge ? (
          <span
            className={cn(
              "inline-flex h-[22px] shrink-0 items-center gap-1 rounded border px-2 font-mono text-[10px] leading-none",
              toneClasses[badgeTone],
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-baseline gap-2 pt-7">
        <span className="tabular text-[42px] font-semibold leading-none tracking-[-0.03em] text-ink">
          {value}
        </span>
        {unit ? <span className="text-headline-md font-medium text-ink-muted">{unit}</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-muted">
        {footer}
      </div>
    </section>
  );
}
