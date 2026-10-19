import Link from "next/link";
import {
  ArrowRight,
  Box,
  ExternalLink,
  Shirt,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";

import { statusMeta } from "@/lib/status";
import type { ProjectStatus, ProjectSummary, ProjectType } from "@/lib/types";
import { cn, initialsOf } from "@/lib/utils";

const typeIcon: Record<ProjectType, LucideIcon> = {
  clothing: Shirt,
  accessory: Sparkles,
  avatar_item: User,
  game_asset: Box,
  other: Box,
};

const filterDefs: { status: ProjectStatus | "all"; label: string }[] = [
  { status: "all", label: "All" },
  { status: "qa_check", label: "QA Ready" },
  { status: "in_design", label: "In Design" },
  { status: "revision", label: "Revision" },
];

type StatusCounts = Record<ProjectStatus | "all", number>;

interface UrgentDeliverablesProps {
  projects: ProjectSummary[];
  totalActive: number;
  counts: StatusCounts;
}

export function UrgentDeliverables({ projects, totalActive, counts }: UrgentDeliverablesProps) {
  const criticalCount = counts.qa_check + counts.revision;

  return (
    <section className="panel overflow-hidden" aria-labelledby="urgent-deliverables-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <h2
            id="urgent-deliverables-title"
            className="max-w-[148px] text-headline-md leading-tight text-ink"
          >
            Urgent Project Deliverables
          </h2>
          <span className="inline-flex h-[22px] items-center rounded border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] px-2 font-mono text-[10px] leading-none text-danger-soft">
            {criticalCount} Critical
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter deliverables">
          {filterDefs.map((filter) => (
            <Link
              key={filter.status}
              href={filter.status === "all" ? "/projects" : `/projects?status=${filter.status}`}
              className={cn(
                "inline-flex h-[30px] items-center rounded border px-2.5 font-mono text-[10px] tracking-[0.02em] transition-colors",
                filter.status === "all"
                  ? "border-line-strong bg-surface-2 text-ink hover:bg-surface-3"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {filter.label} ({counts[filter.status]})
            </Link>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed border-collapse">
          <caption className="sr-only">Urgent project deliverables by client and assignee</caption>
          <colgroup>
            <col className="w-[44%]" />
            <col className="w-[21%]" />
            <col className="w-[21%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line-strong bg-surface-1">
              <th scope="col" className="meta px-4 py-3 text-left font-medium">
                ID &amp; Asset Name
              </th>
              <th scope="col" className="meta px-4 py-3 text-left font-medium">
                Client / Discord
              </th>
              <th scope="col" className="meta px-4 py-3 text-left font-medium">
                Assignee
              </th>
              <th scope="col" className="meta px-4 py-3 text-left font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const Icon = typeIcon[project.projectType];
              const status = statusMeta[project.status];

              return (
                <tr
                  key={project.id}
                  className="relative border-b border-line transition-colors last:border-b-0 hover:bg-surface-1"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded border border-line-strong bg-surface-2 text-ink-muted">
                        <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] tracking-[0.04em] text-ink-dim">
                          {project.reference}
                        </p>
                        <Link
                          href={`/projects/${project.id}`}
                          className="block truncate text-body-md font-medium text-ink after:absolute after:inset-0 after:z-10 after:content-[''] hover:text-brand"
                        >
                          {project.title}
                        </Link>
                        <p className="truncate font-mono text-[10px] text-ink-muted">
                          {project.assetDetail} · {project.specLine}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-body-sm text-ink">
                      <span className="truncate">{project.customer.displayName}</span>
                      <ExternalLink size={11} className="shrink-0 text-ink-dim" aria-hidden="true" />
                    </span>
                    <p className="truncate font-mono text-[10px] text-ink-dim">
                      {project.discordTicket}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    {project.assignee ? (
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-[9px] text-ink-muted">
                          {project.assignee.initials || initialsOf(project.assignee.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-body-sm text-ink">{project.assignee.name}</p>
                          <p className="truncate font-mono text-[9px] uppercase tracking-[0.04em] text-ink-dim">
                            {project.assignee.specialty?.split("/")[0] ?? "Designer"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-dim">UNASSIGNED</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex h-[22px] items-center rounded border px-2 font-mono text-[10px] uppercase leading-none",
                        status.text,
                        status.bg,
                        status.border,
                      )}
                    >
                      {project.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        <p className="font-mono text-[10px] text-ink-dim">
          Showing {projects.length} of {totalActive} active production orders
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted transition-colors hover:text-brand"
        >
          View full pipeline kanban board
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}
