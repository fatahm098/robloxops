import Link from "next/link";
import {
  Box,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

import { isDemoMode } from "@/lib/data";
import type { Deliverable } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { DeliverableActions } from "./deliverable-actions";

const fileTypeLabel: Record<string, string> = {
  RBX: "Roblox Model File",
  RBXM: "Roblox Model File",
  PNG: "Image",
  JPG: "Image",
  FBX: "Mesh Source",
  OBJ: "Mesh Source",
  BLEND: "Blender Scene",
};

const previewGradients = [
  "from-[#0a2a3d] via-[#0a1a2b] to-[#070d1f]",
  "from-[#2a1030] via-[#171426] to-[#070d1f]",
  "from-[#132a22] via-[#0d1c22] to-[#070d1f]",
  "from-[#2b1d10] via-[#1a1712] to-[#070d1f]",
];

function EngineCertifiedBadge() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-sm border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] px-2 font-mono text-label-sm uppercase text-status-delivered">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Engine Certified
    </span>
  );
}

export function DeliverablesPanel({
  projectId,
  deliverables,
}: {
  projectId: string;
  deliverables: Deliverable[];
}) {
  const primary = deliverables.find((deliverable) => deliverable.isFinal) ?? deliverables[0];
  const previews = primary
    ? deliverables.filter((deliverable) => deliverable.id !== primary.id)
    : [];
  const checks = primary?.qaChecks ?? [];
  const passed = checks.filter((check) => check.passed).length;
  const passRate = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;

  return (
    <section aria-labelledby="deliverables-heading" className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h2 id="deliverables-heading" className="text-headline-sm text-ink">
            Production Deliverables
          </h2>
        </div>
        <span className="meta shrink-0">{deliverables.length} Files Total</span>
      </div>

      {primary ? (
        <>
          <div className="flex flex-wrap items-start gap-3 border-b border-line p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-brand/40 bg-[rgba(0,162,255,0.12)] font-mono text-[10px] font-semibold uppercase text-brand">
              {primary.fileType}
            </div>
            <div className="min-w-0 flex-1 basis-[180px]">
              <p className="truncate font-mono text-label-md text-ink">{primary.name}</p>
              <p className="mt-1 text-body-sm text-ink-dim">
                {fileTypeLabel[primary.fileType] ?? "Asset File"} · {primary.sizeLabel} · Uploaded{" "}
                <time dateTime={primary.uploadedAt} className="tabular">
                  {relativeTime(primary.uploadedAt)}
                </time>{" "}
                by {primary.uploadedBy}
              </p>
            </div>
            <EngineCertifiedBadge />
          </div>

          {checks.length > 0 ? (
            <div className="border-b border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="meta">Automated Roblox Engine Validation</p>
                <p className="font-mono text-label-sm uppercase text-status-delivered">
                  {passRate}% Spec Passed
                </p>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {checks.map((check) => (
                  <li
                    key={check.label}
                    className={cn(
                      "rounded border bg-surface-2/60 p-3",
                      check.passed
                        ? "border-line"
                        : "border-[rgba(239,68,68,0.35)] bg-[rgba(162,26,36,0.12)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-body-sm leading-4 text-ink-muted">{check.label}</span>
                      {check.passed ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-status-delivered"
                        />
                      ) : (
                        <XCircle
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-danger-bright"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 font-mono text-label-md text-ink">{check.value}</p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-[10px] uppercase tracking-[0.08em]",
                        check.passed ? "text-status-delivered/80" : "text-danger-soft",
                      )}
                    >
                      {check.passed ? "Passed" : "Failed"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="p-4">
            <DeliverableActions projectId={projectId} disabled={isDemoMode} />
          </div>
        </>
      ) : (
        <div className="p-6 text-center">
          <p className="text-body-md text-ink-dim">No deliverables uploaded yet.</p>
          <Link
            href="/deliverables#upload-panel"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded bg-brand px-3 text-[12px] font-semibold text-canvas transition-colors hover:bg-brand-bright"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload Deliverable Now
          </Link>
        </div>
      )}

      {previews.length > 0 ? (
        <div className="border-t border-line p-4">
          <p className="meta mb-3">Preview Files</p>
          <ul className="grid grid-cols-2 gap-2">
            {previews.map((deliverable, index) => (
              <li key={deliverable.id}>
                <div className="relative aspect-[4/3] overflow-hidden rounded border border-line">
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 bg-gradient-to-br ${
                      previewGradients[index % previewGradients.length]
                    }`}
                  />
                  <div aria-hidden="true" className="absolute inset-0 grid-noise opacity-60" />
                  {deliverable.fileType === "PNG" || deliverable.fileType === "JPG" ? (
                    <ImageIcon
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-ink-dim/40"
                    />
                  ) : (
                    <Box
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-ink-dim/40"
                    />
                  )}
                  <span className="absolute right-2 top-2 font-mono text-[10px] text-ink-muted">
                    {deliverable.sizeLabel}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-[#020617] via-[#020617]/85 to-transparent px-2 pb-2 pt-6">
                    <p
                      className="min-w-0 flex-1 truncate font-mono text-[10px] leading-4 text-ink-muted"
                      title={deliverable.name}
                    >
                      {deliverable.name}
                    </p>
                    <button
                      type="button"
                      aria-label={`Download ${deliverable.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-line bg-canvas/70 text-ink-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
