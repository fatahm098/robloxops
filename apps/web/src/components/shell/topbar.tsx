import { Bell, ChevronDown, Hash, Search, ShieldCheck } from "lucide-react";

import type { TenantContext } from "@/lib/data";

export function Topbar({ tenant }: { tenant: TenantContext }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface-1/95 px-5 backdrop-blur">
      <button
        type="button"
        className="flex h-9 shrink-0 items-center gap-2 rounded px-1.5 transition-colors hover:bg-surface-2"
        aria-label={`Switch tenant — currently ${tenant.name}`}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand/15 font-mono text-[10px] font-semibold text-brand">
          A
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-body-md font-medium text-ink">
          {tenant.name}
          <ChevronDown size={13} className="text-ink-dim" aria-hidden="true" />
        </span>
        <ShieldCheck size={13} className="text-status-delivered" aria-label="Verified tenant" />
      </button>

      <div className="relative ml-2 hidden w-full max-w-[360px] md:block">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search projects, clients, orders…"
          aria-label="Search projects, clients and orders"
          className="h-9 w-full rounded border border-line-strong bg-canvas pl-9 pr-14 text-body-sm text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
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

        <button
          type="button"
          aria-label="Notifications, 3 unread"
          className="relative grid h-9 w-9 place-items-center rounded border border-transparent text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink"
        >
          <Bell size={16} aria-hidden="true" />
          <span className="absolute right-1 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-danger-bright px-1 font-mono text-[9px] font-semibold leading-none text-white">
            3
          </span>
        </button>

        <div className="ml-1 flex items-center gap-2.5 border-l border-line pl-3">
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-gradient-to-br from-surface-3 to-surface-2 font-mono text-[10px] font-medium text-ink">
            KV
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-surface-1 bg-status-delivered"
              aria-hidden="true"
            />
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-body-sm font-medium text-ink">Kaelen Voss</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dim">
              Studio Lead
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
