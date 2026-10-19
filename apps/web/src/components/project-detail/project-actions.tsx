"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, RefreshCw } from "lucide-react";

import {
  createDeliverableDownloadUrl,
  fetchProjectReport,
  updateProjectStatus,
} from "@/app/(dashboard)/projects/actions";
import type { ProjectReport } from "@/lib/insights";
import type { ProjectDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const actionBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded border px-4 text-body-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

interface ProjectActionsProps {
  project: ProjectDetail;
  finalDeliverableId?: string;
  disabled?: boolean;
  report?: ProjectReport | null;
}

export function ProjectActions({
  project,
  finalDeliverableId,
  disabled = false,
  report,
}: ProjectActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"revision" | "delivered" | "download" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(
    report?.contentMd ?? null,
  );

  // The persisted report exists once the project has been delivered. When it is
  // not passed in as a prop, load it lazily so the download button can appear.
  useEffect(() => {
    if (report?.contentMd) {
      setReportMarkdown(report.contentMd);
      return;
    }
    if (disabled || project.status !== "delivered") return;

    let cancelled = false;
    fetchProjectReport(project.id)
      .then((result) => {
        if (!cancelled && result.ok && result.markdown) setReportMarkdown(result.markdown);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [report, disabled, project.id, project.status]);

  function downloadReport() {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.reference}-report.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function run(kind: "revision" | "delivered", status: string) {
    setBusy(kind);
    setMessage(null);
    const result = await updateProjectStatus(project.id, status);
    if (result.ok) router.refresh();
    else setMessage(result.message);
    setBusy(null);
  }

  async function download() {
    if (!finalDeliverableId) return;
    setBusy("download");
    setMessage(null);
    const result = await createDeliverableDownloadUrl(finalDeliverableId);
    if (result.ok && result.url) window.open(result.url, "_blank", "noopener");
    else setMessage(result.message);
    setBusy(null);
  }

  const delivered = project.status === "delivered" || project.status === "cancelled";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
        <button
          type="button"
          disabled={disabled || busy !== null}
          onClick={() => run("revision", "revision")}
          className={cn(
            actionBase,
            "border-danger bg-[rgba(162,26,36,0.2)] text-danger-soft hover:bg-[rgba(162,26,36,0.35)]",
          )}
        >
          {busy === "revision" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Request Revision
        </button>

        <button
          type="button"
          disabled={disabled || busy !== null || !finalDeliverableId}
          title={finalDeliverableId ? undefined : "No deliverable uploaded yet"}
          onClick={download}
          className={cn(
            actionBase,
            "border-line-strong bg-transparent text-ink hover:border-brand hover:bg-surface-2",
          )}
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Download .rbxm
        </button>

        <button
          type="button"
          disabled={disabled || busy !== null || delivered}
          onClick={() => run("delivered", "delivered")}
          className={cn(
            actionBase,
            "border-brand bg-brand text-[#020617] hover:bg-brand-bright hover:shadow-focus",
          )}
        >
          {busy === "delivered" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          Mark Delivered
        </button>

        {reportMarkdown ? (
          <button
            type="button"
            disabled={disabled || busy !== null}
            onClick={downloadReport}
            className={cn(
              actionBase,
              "border-line-strong bg-transparent text-ink hover:border-brand hover:bg-surface-2",
            )}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Download report
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-danger-soft">{message}</p>
      ) : null}
    </div>
  );
}
