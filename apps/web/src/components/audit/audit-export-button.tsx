"use client";

import { Download } from "lucide-react";

import type { AuditTableRow } from "@/lib/types";

interface AuditExportButtonProps {
  rows: AuditTableRow[];
}

export function AuditExportButton({ rows }: AuditExportButtonProps) {
  function onExport() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={rows.length === 0}
      className="inline-flex h-11 items-center gap-1.5 rounded border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Download aria-hidden className="h-4 w-4" strokeWidth={2} />
      Export JSON
    </button>
  );
}
