import { projectTypeLabel, statusMeta } from "@/lib/status";
import type { ProjectSummary } from "@/lib/types";

function csvCell(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildProjectCsv(rows: ProjectSummary[]) {
  const header = [
    "Reference",
    "Customer",
    "Project Type",
    "Assigned Lead",
    "Discord Ticket",
    "Deadline",
    "QA Score",
    "Pipeline Stage",
  ];

  const lines = rows.map((project) => [
    csvCell(project.reference),
    csvCell(project.customer.displayName),
    csvCell(projectTypeLabel[project.projectType]),
    csvCell(project.assignee?.name ?? ""),
    csvCell(project.discordTicket ?? ""),
    csvCell(project.deadline ?? project.deadlineLabel ?? ""),
    csvCell(project.qaScore !== undefined ? `${project.qaScore}/${project.qaScoreMax ?? 100}` : ""),
    csvCell(statusMeta[project.status].label),
  ]);

  return [header.map(csvCell).join(","), ...lines.map((line) => line.join(","))].join("\r\n");
}

export function downloadProjectCsv(rows: ProjectSummary[], filename?: string) {
  if (rows.length === 0) return;

  const blob = new Blob([`\uFEFF${buildProjectCsv(rows)}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `projects-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
