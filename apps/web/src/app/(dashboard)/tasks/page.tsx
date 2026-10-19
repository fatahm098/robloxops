import type { Metadata } from "next";
import Link from "next/link";

import { CreateTaskDialog, type ProjectOption } from "@/components/tasks/create-task-dialog";
import { TaskBoard } from "@/components/tasks/task-board";
import { isDemoMode, listProjects, listTasks } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Task Queue — RobloxOps",
  description: "Designer work items prepared by the AI intake pipeline.",
};

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([listTasks(), listProjects()]);

  const projectOptions: ProjectOption[] = projects
    .filter((project) => project.status !== "delivered" && project.status !== "cancelled")
    .map((project) => ({ id: project.id, reference: project.reference, title: project.title }));

  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const pending = tasks.filter((task) => task.status === "pending").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;

  const summary = [
    { label: "In Progress", value: inProgress, dot: "bg-status-design", hint: "Active sprint work" },
    { label: "Pending", value: pending, dot: "bg-status-briefing", hint: "Queued for assignment" },
    { label: "Blocked", value: blocked, dot: "bg-danger-bright", hint: "Awaiting unblock" },
    { label: "Done This Week", value: 11, dot: "bg-status-delivered", hint: "Rolling 7-day window" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
            <Link href="/" className="transition-colors hover:text-ink-muted">
              Roblox-Ops
            </Link>
            <span aria-hidden className="text-line-muted">
              /
            </span>
            <span className="text-ink-muted">Task Queue</span>
          </nav>
          <h1 className="mt-2 text-headline-xl text-ink">Task Queue</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            Designer work items prepared by the AI intake pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="font-mono text-label-sm uppercase tracking-[0.08em] text-ink-muted">
            <span className="tabular text-ink">7</span> Open
            <span aria-hidden className="mx-2 text-line-muted">
              ·
            </span>
            <span className="tabular text-status-review">2 Due Today</span>
          </span>
          <CreateTaskDialog projects={projectOptions} disabled={isDemoMode} />
        </div>
      </header>

      <section aria-label="Queue summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label} className="panel px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="meta">{item.label}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", item.dot)} aria-hidden />
            </div>
            <p className="tabular mt-1.5 text-[24px] font-semibold leading-8 text-ink">
              {item.value.toString().padStart(2, "0")}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-dim">{item.hint}</p>
          </div>
        ))}
      </section>

      <TaskBoard tasks={tasks} disabled={isDemoMode} />
    </div>
  );
}
