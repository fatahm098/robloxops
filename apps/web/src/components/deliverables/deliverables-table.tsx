import Link from "next/link";
import { FileArchive } from "lucide-react";

import { qaMeta } from "@/lib/status";
import type { DeliverableRow } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface DeliverablesTableProps {
  rows: DeliverableRow[];
}

export function DeliverablesTable({ rows }: DeliverablesTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-line bg-canvas px-6 py-16 text-center">
        <FileArchive className="mx-auto h-6 w-6 text-ink-dim" aria-hidden="true" />
        <p className="mt-2 text-headline-sm text-ink">No deliverables yet</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          Uploads appear here after the first designer submission
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-line bg-canvas">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[780px] table-fixed border-collapse text-left">
          <caption className="sr-only">Deliverables and QA status</caption>
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr className="h-11 border-b-2 border-line-strong bg-surface-1">
              <th scope="col" className="meta px-4 font-medium">File</th>
              <th scope="col" className="meta px-3 font-medium">Project</th>
              <th scope="col" className="meta px-3 font-medium">Type</th>
              <th scope="col" className="meta px-3 font-medium">Ver</th>
              <th scope="col" className="meta px-3 font-medium">Size</th>
              <th scope="col" className="meta px-3 font-medium">Uploaded By</th>
              <th scope="col" className="meta px-3 font-medium">Uploaded</th>
              <th scope="col" className="meta px-3 font-medium">QA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "row-hover h-14 border-l-2",
                  row.qaStatus === "failed" ? "border-l-danger-bright" : "border-l-transparent",
                )}
              >
                <td className="px-4 py-3">
                  <div className="truncate font-mono text-[12px] text-ink">{row.name}</div>
                  <div className="truncate font-mono text-[10px] text-ink-dim">
                    {row.projectTitle}
                    {row.isFinal ? " · FINAL" : ""}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/projects/${row.projectId}`}
                    className="font-mono text-[11px] text-brand hover:text-brand-bright"
                  >
                    {row.reference}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex h-[22px] items-center rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px] uppercase text-ink-muted">
                    {row.fileType}
                  </span>
                </td>
                <td className="tabular px-3 py-3 font-mono text-[11px] text-ink-muted">v{row.version}</td>
                <td className="tabular px-3 py-3 font-mono text-[11px] text-ink-muted">{row.sizeLabel}</td>
                <td className="truncate px-3 py-3 text-[12px] text-ink-muted">{row.uploadedBy}</td>
                <td className="px-3 py-3 text-[12px] text-ink-muted">{relativeTime(row.uploadedAt)}</td>
                <td className={cn("px-3 py-3 font-mono text-[10px] uppercase tracking-[0.06em]", qaMeta[row.qaStatus].text)}>
                  {qaMeta[row.qaStatus].label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line bg-surface-1 px-4 py-3 font-mono text-[11px] text-ink-dim">
        {rows.length} files · {rows.filter((row) => row.qaStatus === "pending").length} awaiting QA
      </div>
    </div>
  );
}
