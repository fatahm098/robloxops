import type { Metadata } from "next";
import Link from "next/link";
import { Home } from "lucide-react";

import { CreateProjectDialog, type CustomerOption } from "@/components/projects/create-project-dialog";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectsExportButton } from "@/components/projects/projects-export-button";
import { ProjectsTable } from "@/components/projects/projects-table";
import { getStatusCounts, isDemoMode, listCustomers, listProjects } from "@/lib/data";
import type { ProjectStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Projects & Commissions — RobloxOps",
};

const STATUS_FILTERS = [
  "all",
  "intake",
  "briefing",
  "brief_review",
  "in_design",
  "qa_check",
  "customer_review",
  "revision",
  "approved",
  "delivered",
  "on_hold",
  "cancelled",
] as const;

const PER_PAGE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PER = 10;

type StatusFilter = (typeof STATUS_FILTERS)[number];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(value: string | undefined): StatusFilter {
  return value && (STATUS_FILTERS as readonly string[]).includes(value) ? (value as StatusFilter) : "all";
}

function parsePer(value: string | undefined) {
  const parsed = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PER;
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : undefined;
}

function deadlineMonth(deadline: string | undefined) {
  if (!deadline) return undefined;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface ProjectsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const status = parseStatus(firstParam(params.status));
  const q = firstParam(params.q)?.trim() || undefined;
  const assignee = firstParam(params.assignee)?.trim() || undefined;
  const month = parseMonth(firstParam(params.month));
  const per = parsePer(firstParam(params.per));
  const requestedPage = parsePage(firstParam(params.page));

  const [projects, allProjects, counts, customers] = await Promise.all([
    listProjects({ status, search: q }),
    listProjects(),
    getStatusCounts(),
    listCustomers(),
  ]);

  const filtered = projects.filter((project) => {
    if (assignee && project.assignee?.name !== assignee) return false;
    if (month && deadlineMonth(project.deadline) !== month) return false;
    return true;
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(requestedPage, pageCount);
  const pagedProjects = filtered.slice((page - 1) * per, page * per);

  const assignees = Array.from(
    new Set(
      allProjects
        .map((project) => project.assignee?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const customerOptions: CustomerOption[] = customers.map((customer) => ({
    id: customer.id,
    displayName: customer.displayName,
    discordUsername: customer.discordUsername,
  }));

  const activeStatus: ProjectStatus | "all" = status;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">PROJECTS &amp; COMMISSIONS</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <h1 className="max-w-[11ch] text-headline-xl leading-[1.15] text-ink">
          Projects &amp; Commissions
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
              <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
                {counts.all}
              </div>
              <div className="meta text-[9px] leading-tight">TOTAL TRACKED</div>
            </div>
            <div className="flex max-w-[130px] items-start gap-1.5 font-mono text-[10px] uppercase leading-tight tracking-[0.06em] text-ink-dim">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand animate-pulse-soft" />
              Syncing Discord Gateway v10
            </div>
          </div>

          <ProjectsExportButton projects={filtered} />

          <CreateProjectDialog customers={customerOptions} disabled={isDemoMode} />
        </div>
      </header>

      <ProjectFilters
        counts={counts}
        activeStatus={activeStatus}
        q={q}
        assignee={assignee}
        month={month}
        per={per}
        assignees={assignees}
      />

      <ProjectsTable
        projects={pagedProjects}
        total={total}
        page={page}
        per={per}
        pageCount={pageCount}
        filters={{ status, q, assignee, month }}
      />
    </div>
  );
}
