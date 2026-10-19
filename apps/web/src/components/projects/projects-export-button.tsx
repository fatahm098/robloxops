"use client";

import { Download } from "lucide-react";

import type { ProjectSummary } from "@/lib/types";

import { downloadProjectCsv } from "./project-csv";

interface ProjectsExportButtonProps {
  projects: ProjectSummary[];
}

export function ProjectsExportButton({ projects }: ProjectsExportButtonProps) {
  return (
    <button
      type="button"
      onClick={() => downloadProjectCsv(projects)}
      disabled={projects.length === 0}
      className="inline-flex h-11 items-center gap-2 rounded border border-line-strong bg-surface-2 px-4 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Export CSV
    </button>
  );
}
