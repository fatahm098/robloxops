import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { ProjectSummary } from "@/lib/types";

export function QaPreview({ project }: { project: ProjectSummary }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="qa-preview-title">
      <div className="grid sm:grid-cols-[minmax(0,38%)_minmax(0,62%)]">
        <div
          role="img"
          aria-label={`3D preview placeholder for ${project.title}`}
          className="grid-noise relative min-h-[248px] overflow-hidden border-b border-line bg-[#0B0F19] sm:border-b-0 sm:border-r"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_55%_45%,rgba(0,162,255,0.22),transparent_62%)]" />
          <div className="absolute left-1/2 top-1/2 h-[3px] w-[74%] -translate-x-1/2 -translate-y-1/2 rotate-[-27deg] bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_26px_rgba(0,162,255,0.65)]" />
          <div className="absolute left-1/2 top-1/2 h-[1px] w-[62%] -translate-x-1/2 -translate-y-1/2 rotate-[-27deg] bg-gradient-to-r from-transparent via-ink-muted/50 to-transparent" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-brand bg-canvas shadow-[0_0_14px_rgba(0,162,255,0.8)]" />

          <span className="absolute left-3 top-3 inline-flex h-[22px] items-center rounded border border-line-strong bg-canvas/85 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            WebGL Preview
          </span>
          <span className="absolute bottom-3 left-3 inline-flex h-[22px] items-center rounded border border-line-strong bg-canvas/85 px-2 font-mono text-[10px] text-ink">
            {project.reference.toLowerCase()}.rbxm
          </span>
          <span className="absolute bottom-3 right-3 font-mono text-[9px] tracking-[0.08em] text-ink-dim">
            QA {project.qaScore ?? "—"}/{project.qaScoreMax ?? 100}
          </span>
        </div>

        <div className="flex flex-col p-5">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.08em]">
            <span className="text-ink-dim">Automated QA Mesh Analysis</span>
            <span className="text-status-delivered">Passed 6/6</span>
          </div>

          <h2 id="qa-preview-title" className="mt-2 text-headline-md text-ink">
            {project.title} — QA Ready
          </h2>

          <p className="mt-2 max-w-[52ch] text-body-sm leading-relaxed text-ink-muted">
            Mesh validated against Roblox UGC limits: Vertices{" "}
            <span className="font-mono text-ink">2,140</span> (&lt;4,000 max), Texture map{" "}
            <span className="font-mono text-ink">1024×1024</span> PNG with alpha, Attachment point{" "}
            <span className="font-mono text-ink">RightHandGrip</span> verified.
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-4 text-body-md font-semibold text-canvas transition-colors hover:bg-brand-bright"
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              Approve &amp; Export Package
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded border border-danger/50 bg-danger/10 px-4 text-body-md font-medium text-danger-soft transition-colors hover:border-danger-bright hover:bg-danger/20"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              Flag Revision
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
