import Link from "next/link";
import { CircleHelp, Cloud, Cpu, Hash, Settings } from "lucide-react";

export function StudioStorage() {
  return (
    <div className="shrink-0 border-t border-line">
      <div className="px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="meta flex items-center gap-1.5">
            <Cloud size={11} aria-hidden="true" />
            Cloud Storage
          </span>
          <span className="tabular font-mono text-label-sm text-ink">42%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-surface-2">
          <div className="h-full w-[42%] rounded-sm bg-gradient-to-r from-brand-deep to-brand" />
        </div>
        <p className="tabular mt-1.5 font-mono text-[10px] text-ink-muted">84.2 GB / 200 GB</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="meta flex items-center gap-1.5">
            <Cpu size={11} aria-hidden="true" />
            AI Operations
          </span>
          <span className="tabular font-mono text-[10px] text-ink-muted">12.4K / 25K</span>
        </div>

        <Link
          href="/tasks"
          className="mt-3 flex h-8 items-center gap-2 rounded border border-line bg-canvas px-2.5 transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          <Hash size={12} className="shrink-0 text-brand" aria-hidden="true" />
          <span className="truncate font-mono text-[10px] text-ink-muted">#orders-active</span>
          <span className="tabular ml-auto shrink-0 font-mono text-[10px] text-ink">12 pending</span>
        </Link>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <div className="flex items-center gap-3 text-ink-dim">
          <button
            type="button"
            aria-label="Help and documentation"
            className="grid h-7 w-7 place-items-center rounded transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <CircleHelp size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Studio settings"
            className="grid h-7 w-7 place-items-center rounded transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Settings size={14} aria-hidden="true" />
          </button>
        </div>
        <span className="font-mono text-[9px] tracking-[0.08em] text-ink-dim">v2.4.1</span>
      </div>
    </div>
  );
}
