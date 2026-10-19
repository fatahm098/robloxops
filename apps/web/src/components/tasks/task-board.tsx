import { taskStatusMeta } from "@/lib/status";
import type { Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

import { TaskRow } from "./task-row";

type BoardStatus = Extract<TaskStatus, "pending" | "in_progress" | "blocked">;

const columns: { status: BoardStatus; accent: string }[] = [
  { status: "pending", accent: "bg-status-briefing" },
  { status: "in_progress", accent: "bg-status-design" },
  { status: "blocked", accent: "bg-danger-bright" },
];

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((column) => {
        const meta = taskStatusMeta[column.status];
        const items = tasks.filter((task) => task.status === column.status);

        return (
          <section
            key={column.status}
            aria-labelledby={`board-${column.status}`}
            className="panel flex min-h-[280px] flex-col"
          >
            <header className="flex h-11 items-center justify-between gap-2 border-b border-line px-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", column.accent)} aria-hidden />
                <h2
                  id={`board-${column.status}`}
                  className="font-mono text-label-sm uppercase tracking-[0.08em] text-ink-muted"
                >
                  {meta.label}
                </h2>
              </div>
              <span className="tabular inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm border border-line bg-surface-2 px-1 font-mono text-[11px] text-ink-muted">
                {items.length.toString().padStart(2, "0")}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2 p-2.5">
              {items.length > 0 ? (
                items.map((task) => <TaskRow key={task.id} task={task} />)
              ) : (
                <p className="px-1 py-6 text-center text-[11px] text-ink-dim">No tasks in this stage.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
