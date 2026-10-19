import type { Metadata } from "next";
import Link from "next/link";
import { Home, Upload } from "lucide-react";

import { DeliverablesTable } from "@/components/deliverables/deliverables-table";
import { UploadPanel } from "@/components/deliverables/upload-panel";
import { isDemoMode, listDeliverables, listProjects } from "@/lib/data";

export const metadata: Metadata = {
  title: "Upload & QA — RobloxOps",
};

const CLOSED_STATUSES = new Set(["delivered", "cancelled"]);

export default async function DeliverablesPage() {
  const [rows, projects] = await Promise.all([listDeliverables(), listProjects()]);
  const pending = rows.filter((row) => row.qaStatus === "pending").length;
  const failed = rows.filter((row) => row.qaStatus === "failed").length;
  const openProjects = projects
    .filter((project) => !CLOSED_STATUSES.has(project.status))
    .map((project) => ({ id: project.id, reference: project.reference, title: project.title }));

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">UPLOAD &amp; QA</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Upload &amp; QA</h1>
          <p className="text-body-md text-ink-muted">
            Deliverables, engine validation and the files waiting for customer review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
              {rows.length}
            </div>
            <div className="meta text-[9px] leading-tight">FILES · {pending} AWAITING QA</div>
          </div>
          <a
            href="#upload-panel"
            className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas shadow-focus transition-colors hover:bg-brand-bright"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload Deliverable
          </a>
        </div>
      </header>

      {failed > 0 ? (
        <div className="flex items-center gap-2 rounded border border-danger bg-[rgba(162,26,36,0.12)] px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-danger-bright" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-danger-soft">
            {failed} deliverable{failed > 1 ? "s" : ""} failed engine validation — customer notification blocked
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <DeliverablesTable rows={rows} />
        <UploadPanel projects={openProjects} disabled={isDemoMode} />
      </div>
    </div>
  );
}
