import Link from "next/link";

import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

import { TaskStatusMenu } from "./task-status-menu";

const priorityMeta: Record<number, { dot: string; label: string }> = {
  2: { dot: "bg-danger-bright", label: "High priority" },
  1: { dot: "bg-status-briefing", label: "Normal priority" },
  0: { dot: "bg-ink-dim", label: "Low priority" },
};

export function TaskRow({ task, disabled = false }: { task: Task; disabled?: boolean }) {
  const dueToday = task.dueLabel?.toLowerCase().startsWith("today") ?? false;
  const priority = priorityMeta[task.priority] ?? priorityMeta[0];

  return (
    <div className="group rounded border border-line-strong bg-surface-2 p-3 transition-colors hover:border-brand/50 hover:bg-surface-3/60">
      <Link href={`/projects/${task.projectId}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-label-sm text-ink-muted">{task.reference}</span>
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priority.dot)}
            title={priority.label}
            aria-label={priority.label}
          />
        </div>

        <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-5 text-ink group-hover:text-white">
          {task.title}
        </p>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        {task.assignee ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 font-mono text-[9px] font-semibold text-brand">
              {task.assignee.initials}
            </span>
            <span className="truncate text-[11px] text-ink-muted">{task.assignee.name}</span>
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            Unassigned
          </span>
        )}

        <span
          className={cn(
            "tabular shrink-0 font-mono text-[10px]",
            dueToday ? "text-status-review" : "text-ink-dim",
          )}
        >
          {task.dueLabel ?? "No due date"}
        </span>
      </div>

      <div className="mt-2 flex justify-end">
        <TaskStatusMenu taskId={task.id} status={task.status} disabled={disabled} />
      </div>
    </div>
  );
}
