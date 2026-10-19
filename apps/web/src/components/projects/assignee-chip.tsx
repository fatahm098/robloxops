import type { TeamMember } from "@/lib/types";
import { cn, initialsOf } from "@/lib/utils";

interface AssigneeChipProps {
  member?: TeamMember;
  className?: string;
}

export function AssigneeChip({ member, className }: AssigneeChipProps) {
  if (!member) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center rounded border border-dashed border-line-strong px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim",
          className,
        )}
      >
        Assign lead
      </span>
    );
  }

  const initials = member.initials || initialsOf(member.name);

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 font-mono text-[10px] font-semibold text-brand">
        {initials}
      </span>
      <span className="truncate text-[13px] text-ink-muted">{member.name}</span>
    </div>
  );
}
