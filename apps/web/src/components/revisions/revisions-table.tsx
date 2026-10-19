import Link from "next/link";
import { Repeat2 } from "lucide-react";

import type { RevisionRequest, RevisionStatus } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

const STATUS_META: Record<RevisionStatus, { label: string; className: string }> = {
  open: {
    label: "Open",
    className: "bg-[rgba(244,63,94,0.15)] text-status-review border-[rgba(251,113,133,0.3)]",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-[rgba(168,85,247,0.15)] text-status-design border-[rgba(192,132,252,0.3)]",
  },
  resolved: {
    label: "Resolved",
    className: "bg-[rgba(16,185,129,0.15)] text-status-delivered border-[rgba(52,211,153,0.3)]",
  },
  rejected: {
    label: "Rejected",
    className: "bg-[rgba(100,116,139,0.2)] text-status-cancelled border-[rgba(148,163,184,0.3)]",
  },
};

interface RevisionsTableProps {
  revisions: RevisionRequest[];
}

export function RevisionsTable({ revisions }: RevisionsTableProps) {
  if (revisions.length === 0) {
    return (
      <div className="rounded border border-line bg-canvas px-6 py-16 text-center">
        <Repeat2 className="mx-auto h-6 w-6 text-ink-dim" aria-hidden="true" />
        <p className="mt-2 text-headline-sm text-ink">No revisions logged</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          Customer revision requests appear here after they are submitted
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-line bg-canvas">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
          <caption className="sr-only">Revision requests</caption>
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[30%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="h-11 border-b-2 border-line-strong bg-surface-1">
              <th scope="col" className="meta px-4 font-medium">Reference</th>
              <th scope="col" className="meta px-3 font-medium">Project</th>
              <th scope="col" className="meta px-3 font-medium">Requested By</th>
              <th scope="col" className="meta px-3 font-medium">Reason</th>
              <th scope="col" className="meta px-3 font-medium">Status</th>
              <th scope="col" className="meta px-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {revisions.map((revision) => (
              <tr key={revision.id} className="row-hover h-14">
                <td className="px-4 py-3">
                  <Link
                    href={`/projects/${revision.projectId}`}
                    className="font-mono text-[11px] text-brand hover:text-brand-bright"
                  >
                    {revision.reference}
                  </Link>
                </td>
                <td className="truncate px-3 py-3 text-[13px] text-ink">
                  {revision.projectTitle}
                </td>
                <td className="truncate px-3 py-3 text-[12px] text-ink-muted">
                  {revision.requestedBy}
                </td>
                <td className="px-3 py-3 text-[12px] text-ink-muted">
                  <span className="line-clamp-2">{revision.reason}</span>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex h-[22px] items-center rounded border px-2 font-mono text-[10px] uppercase tracking-[0.06em]",
                      STATUS_META[revision.status].className,
                    )}
                  >
                    {STATUS_META[revision.status].label}
                  </span>
                </td>
                <td className="px-3 py-3 text-[12px] text-ink-muted">
                  {relativeTime(revision.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line bg-surface-1 px-4 py-3 font-mono text-[11px] text-ink-dim">
        {revisions.length} revision{revisions.length === 1 ? "" : "s"} ·{" "}
        {revisions.filter((revision) => revision.status === "open").length} open
      </div>
    </div>
  );
}
