import { statusMeta } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: ProjectStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const meta = statusMeta[status];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded border font-mono uppercase tracking-[0.06em]",
        meta.bg,
        meta.border,
        meta.text,
        size === "sm" ? "h-[22px] px-2 text-[10px]" : "h-7 px-2.5 text-label-sm",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}
