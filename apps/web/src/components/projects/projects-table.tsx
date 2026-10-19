import Link from "next/link";
import { SearchX } from "lucide-react";

import type { ProjectSummary } from "@/lib/types";

import { ProjectsTableClient, type ProjectQueryFilters } from "./projects-table-client";

interface ProjectsTableProps {
  projects: ProjectSummary[];
  total: number;
  page: number;
  per: number;
  pageCount: number;
  filters: ProjectQueryFilters;
}

export function ProjectsTable({ projects, total, page, per, pageCount, filters }: ProjectsTableProps) {
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
    <ProjectsTableClient
      projects={projects}
      total={total}
      page={page}
      per={per}
      pageCount={pageCount}
      filters={filters}
    />
  );
}
