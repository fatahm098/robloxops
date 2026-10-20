"use client";

import { Hash } from "lucide-react";

import type { TenantContext } from "@/lib/data";
import { useViewMode } from "@/lib/view-mode";

/** Ops-only status pills. Hidden in designer mode to reduce noise. */
export function TopbarStatus({ tenant }: { tenant: TenantContext }) {
  const { mode } = useViewMode();
  if (mode === "designer") return null;

  return (
    <>
      <span className="hidden items-center gap-2 rounded border border-line bg-surface-1 px-2.5 py-1.5 font-mono text-[10px] text-ink-muted lg:inline-flex">
        <span
          className="h-1.5 w-1.5 rounded-full bg-status-delivered shadow-[0_0_6px_rgba(52,211,153,0.8)]"
          aria-hidden="true"
        />
        {tenant.agentsActive} Agents Active
        <span className="text-ink-dim" aria-hidden="true">
          ·
        </span>
        <span className={tenant.errorCount === 0 ? "text-status-delivered" : "text-danger-soft"}>
          {tenant.errorCount} Errors
        </span>
      </span>

      <span className="hidden items-center gap-1.5 rounded border border-line bg-surface-1 px-2.5 py-1.5 font-mono text-[10px] text-ink-muted sm:inline-flex">
        <Hash size={11} className="text-brand" aria-hidden="true" />
        Discord: <span className="text-brand">{tenant.discordGuild}</span>
      </span>
    </>
  );
}
