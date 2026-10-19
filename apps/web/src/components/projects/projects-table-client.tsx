"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Gem,
  Package,
  Shirt,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { projectTypeLabel } from "@/lib/status";
import type { ProjectSummary, ProjectType } from "@/lib/types";
import { cn, initialsOf } from "@/lib/utils";

import { AssigneeChip } from "./assignee-chip";
import { downloadProjectCsv } from "./project-csv";
import { StatusBadge } from "./status-badge";

const TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  clothing: Shirt,
  accessory: Gem,
  avatar_item: UserRound,
  game_asset: Boxes,
  other: Package,
};

const AVATAR_HUES = [199, 265, 330, 152, 24, 210, 280, 45];

const PER_PAGE_OPTIONS = [10, 25, 50];

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

export interface ProjectQueryFilters {
  status?: string;
  q?: string;
  assignee?: string;
  month?: string;
}

interface ProjectsTableClientProps {
  projects: ProjectSummary[];
  total: number;
  page: number;
  per: number;
  pageCount: number;
  filters: ProjectQueryFilters;
}

function buildHref(filters: ProjectQueryFilters, page: number, per: number) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.month) params.set("month", filters.month);
  if (per !== 10) params.set("per", String(per));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

function pageItems(current: number, count: number): (number | "ellipsis")[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);

  const items: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);

  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < count - 1) items.push("ellipsis");
  items.push(count);

  return items;
}

export function ProjectsTableClient({
  projects,
  total,
  page,
  per,
  pageCount,
  filters,
}: ProjectsTableClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelected(new Set());
  }, [projects]);

  const allShownSelected = projects.length > 0 && projects.every((project) => selected.has(project.id));
  const someShownSelected = projects.some((project) => selected.has(project.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someShownSelected && !allShownSelected;
    }
  }, [someShownSelected, allShownSelected]);

  function toggleAll() {
    if (allShownSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(projects.map((project) => project.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onExport() {
    const rows = selected.size > 0 ? projects.filter((project) => selected.has(project.id)) : projects;
    downloadProjectCsv(rows);
  }

  const start = total === 0 ? 0 : (page - 1) * per + 1;
  const end = Math.min(page * per, total);
  const paginationItems = pageItems(page, pageCount);

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
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allShownSelected}
                  onChange={toggleAll}
                  aria-label="Select all orders on this page"
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
              const isSelected = selected.has(project.id);

              return (
                <tr key={project.id} className="group relative row-hover h-24">
                  <td className="relative z-10 py-3 pl-4 pr-2 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(project.id)}
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
            Showing {start}–{end} of {total} orders
          </span>
          <span className="text-line-muted">·</span>
          <span>Rows per page:</span>
          <span className="relative">
            <select
              value={per}
              onChange={(event) => router.push(buildHref(filters, 1, Number(event.target.value)))}
              aria-label="Rows per page"
              className="h-8 cursor-pointer appearance-none rounded border border-line bg-canvas pl-2 pr-6 font-mono text-[11px] text-ink-muted focus:border-brand focus:outline-none"
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronRight
              className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-ink-dim"
              aria-hidden="true"
            />
          </span>
          <button
            type="button"
            onClick={onExport}
            disabled={projects.length === 0}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded border border-line-strong bg-surface-2 px-2.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>

        <nav aria-label="Pagination" className="flex items-center gap-1">
          {page > 1 ? (
            <Link
              href={buildHref(filters, page - 1, per)}
              className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Prev
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-dim opacity-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Prev
            </span>
          )}

          {paginationItems.map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-1 font-mono text-[11px] text-ink-dim">
                …
              </span>
            ) : item === page ? (
              <span
                key={item}
                aria-current="page"
                className="tabular h-8 w-8 rounded border border-brand bg-brand text-center font-mono text-[11px] font-semibold leading-8 text-canvas"
              >
                {item}
              </span>
            ) : (
              <Link
                key={item}
                href={buildHref(filters, item, per)}
                className="tabular h-8 w-8 rounded border border-line text-center font-mono text-[11px] leading-8 text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {item}
              </Link>
            ),
          )}

          {page < pageCount ? (
            <Link
              href={buildHref(filters, page + 1, per)}
              className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="flex h-8 items-center gap-1 rounded border border-line px-2 font-mono text-[11px] text-ink-dim opacity-50"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </nav>
      </div>
    </div>
  );
}
