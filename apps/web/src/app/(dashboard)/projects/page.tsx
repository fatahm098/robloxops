import type { Metadata } from "next";
import Link from "next/link";
import { Download, Home, Plus } from "lucide-react";

import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectsTable } from "@/components/projects/projects-table";
import { getStatusCounts, listProjects } from "@/lib/data";
import type { ProjectStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Projects & Commissions — RobloxOps",
};

const STATUS_FILTERS = [
  "all",
  "intake",
  "briefing",
  "in_design",
  "qa_check",
  "customer_review",
  "delivered",
  "cancelled",
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(value: string | undefined): StatusFilter {
  return value && (STATUS_FILTERS as readonly string[]).includes(value) ? (value as StatusFilter) : "all";
}

interface ProjectsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const status = parseStatus(firstParam(params.status));
  const q = firstParam(params.q)?.trim() || undefined;

  const [projects, counts] = await Promise.all([
    listProjects({ status, search: q }),
    getStatusCounts(),
  ]);

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

          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded border border-line-strong bg-surface-2 px-4 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-surface-3"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>

          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas shadow-focus transition-colors hover:bg-brand-bright"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Manual Project Order
          </button>
        </div>
      </header>

      <ProjectFilters counts={counts} activeStatus={activeStatus} q={q} />

      <ProjectsTable projects={projects} total={counts.all} />
    </div>
  );
}
