"use client";

import { Palette, SlidersHorizontal } from "lucide-react";

import { useViewMode } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

export function ModeSwitcher() {
  const { mode, setMode } = useViewMode();

  return (
    <div
      role="group"
      aria-label="Pilih mode tampilan"
      className="inline-flex items-center rounded-lg border border-line-strong bg-surface-2/90 p-0.5 shadow-sm"
    >
      <button
        type="button"
        onClick={() => setMode("designer")}
        aria-pressed={mode === "designer"}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
          mode === "designer"
            ? "bg-brand font-semibold text-canvas shadow-sm"
            : "text-ink-muted hover:bg-surface-3/50 hover:text-ink",
        )}
        title="Mode Desainer: tampilan sederhana untuk fokus mendesain dan upload karya"
      >
        <Palette size={13} className={mode === "designer" ? "text-canvas" : "text-brand"} />
        <span>Mode Desainer</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("developer")}
        aria-pressed={mode === "developer"}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
          mode === "developer"
            ? "bg-brand font-semibold text-canvas shadow-sm"
            : "text-ink-muted hover:bg-surface-3/50 hover:text-ink",
        )}
        title="Mode Developer: tampilan lengkap dengan analitik, audit log, CRM, agen, dan billing"
      >
        <SlidersHorizontal size={13} className={mode === "developer" ? "text-canvas" : "text-ink-dim"} />
        <span>Mode Developer</span>
      </button>
    </div>
  );
}
