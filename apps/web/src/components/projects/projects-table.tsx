import Link from "next/link";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gem,
  Package,
  SearchX,
  Shirt,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { projectTypeLabel } from "@/lib/status";
import type { ProjectSummary, ProjectType } from "@/lib/types";
import { cn, initialsOf } from "@/lib/utils";

import { AssigneeChip } from "./assignee-chip";
import { StatusBadge } from "./status-badge";

const TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  clothing: Shirt,
  accessory: Gem,
  avatar_item: UserRound,
  game_asset: Boxes,
  other: Package,
};

const AVATAR_HUES = [199, 265, 330, 152, 24, 210, 280, 45];

function hashHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return AVATAR_HUES[hash % AVATAR_HUES.length] ?? 199;
}

function ordinal(count?: number) {
  if (!count || count <= 0) return "No orders";
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 13) return `${count}th order`;
  if (units === 1) return `${count}st order`;
  if (units === 2) return `${count}nd order`;
  if (units === 3) return `${count}rd order`;
  return `${count}th order`;
}

interface ProjectsTableProps {
  projects: ProjectSummary[];
  total: number;
}

export function ProjectsTable({ projects, total }: ProjectsTableProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded border border-line bg-canvas px-6 py-20 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-1">
          <SearchX className="h-5 w-5 text-ink-dim" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-headline-sm text-ink">No orders match this filter</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
            Adjust the search term or pipeline stage
          </p>
        </div>
        <Link
          href="/projects"
          className="mt-1 inline-flex h-9 items-center rounded border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-line bg-canvas">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
          <caption className="sr-only">Projects and commissions pipeline</caption>
          <colgroup>
            <col className="w-11" />
            <col className="w-[7%]" />
            <col className="w-[18%]" />
            <col className="w-[21%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
          </colgroup>

          <thead>
            <tr className="h-11 border-b-2 border-line-strong bg-surface-1">
              <th scope="col" className="pl-4 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all orders"
                  className="h-4 w-4 cursor-pointer rounded-sm border border-line-strong bg-canvas accent-brand align-middle"
                />
              </th>
              <th scope="col" className="meta whitespace-nowrap px-3 font-medium">
                Ref Code
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Customer / Client
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Project Asset Type
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Assigned Lead
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Discord Ticket
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Production Deadline
              </th>
              <th scope="col" className="meta px-3 font-medium">
                QA Studio Score
              </th>
              <th scope="col" className="meta px-3 font-medium">
                Pipeline Stage
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {projects.map((project) => {
              const TypeIcon = TYPE_ICONS[project.projectType];
              const hue = hashHue(project.customer.id);
              const isToday = project.deadlineLabel?.startsWith("Today") ?? false;
              const qaMax = project.qaScoreMax ?? 100;
              const qaPassed = project.qaScore !== undefined && project.qaScore >= 80;
              const [refPrefix, ...refRest] = project.reference.split("-");
              const refSuffix = refRest.join("-");

              return (
                <tr key={project.id} className="group relative row-hover h-24">
                  <td className="relative z-10 py-3 pl-4 pr-2 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select ${project.reference}`}
                      className="h-4 w-4 cursor-pointer rounded-sm border border-line-strong bg-canvas accent-brand align-middle"
                    />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-mono text-[13px] font-semibold leading-tight text-brand after:absolute after:inset-0 after:content-[''] hover:text-brand-bright"
                    >
                      <span className="block">{refPrefix}-</span>
                      <span className="block">{refSuffix}</span>
                    </Link>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold"
                        style={{
                          backgroundColor: `hsl(${hue} 45% 17%)`,
                          borderColor: `hsl(${hue} 55% 32%)`,
                          color: `hsl(${hue} 80% 78%)`,
                        }}
                        aria-hidden="true"
                      >
                        {initialsOf(project.customer.displayName)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">
                          {project.customer.displayName}
                        </div>
                        <div className="truncate font-mono text-[10px] text-ink-dim">
                          {project.customer.tier ?? "Client"}
                        </div>
                        <div className="truncate font-mono text-[10px] text-ink-dim">
                          {ordinal(project.customer.orderCount)}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-start gap-2">
                      <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
                          {projectTypeLabel[project.projectType]}
                        </div>
                        <div className="truncate text-[13px] font-medium leading-snug text-ink">
                          {project.assetDetail}
                        </div>
                        <div className="truncate font-mono text-[10px] text-ink-muted">
                          {project.specLine}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <AssigneeChip member={project.assignee} />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    {project.discordTicket ? (
                      <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-1 px-1.5 py-1 font-mono text-[10px] text-brand">
                        {project.discordTicket}
                      </span>
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    {project.deadlineLabel && project.deadlineLabel !== "—" ? (
                      <span
                        className={cn(
                          "tabular inline-flex items-center gap-1.5 text-[12px]",
                          isToday ? "font-medium text-danger-bright" : "text-ink-muted",
                        )}
                      >
                        <Clock
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isToday ? "text-danger-bright" : "text-ink-dim",
                          )}
                          aria-hidden="true"
                        />
                        {project.deadlineLabel}
                      </span>
                    ) : (
                      <span className="font-mono text-[12px] text-ink-dim">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    {project.qaScore !== undefined ? (
                      <div>
                        <div className="tabular font-mono text-[13px] font-semibold text-brand">
                          {project.qaScore}
                          <span className="ml-1 font-normal text-ink-dim">/ {qaMax}</span>
                        </div>
                        <div
                          className={cn(
                            "font-mono text-[10px] uppercase tracking-[0.08em]",
                            qaPassed ? "text-status-delivered" : "text-status-briefing",
                          )}
                        >
                          {qaPassed ? "Pass" : "Review"}
                        </div>
                      </div>
                    ) : (
                      <span className="tabular font-mono text-[13px] text-ink-dim">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <StatusBadge status={project.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-surface-1 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-dim">
          <span className="tabular">
            Showing 1–{projects.length} of {total} orders
          </span>
          <span className="text-line-muted">·</span>
          <span>Rows per page:</span>
          <span className="relative">
            <select
              defaultValue="10"
              aria-label="Rows per page"
              className="h-8 cursor-pointer appearance-none rounded border border-line bg-canvas pl-2 pr-6 font-mono text-[11px] text-ink-muted focus:border-brand focus:outline-none"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
            <ChevronRight
              className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-ink-dim"
              aria-hidden="true"
            />
          </span>
        </div>

        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button
            type="button"
            disabled
            className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-dim opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Prev
          </button>
          {[1, 2, 3].map((page) => (
            <button
              key={page}
              type="button"
              aria-current={page === 1 ? "page" : undefined}
              className={cn(
                "tabular h-8 w-8 rounded border font-mono text-[11px]",
                page === 1
                  ? "border-brand bg-brand font-semibold text-canvas"
                  : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {page}
            </button>
          ))}
          <span className="px-1 font-mono text-[11px] text-ink-dim">…</span>
          <button
            type="button"
            className="tabular h-8 w-8 rounded border border-line font-mono text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            8
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
}
