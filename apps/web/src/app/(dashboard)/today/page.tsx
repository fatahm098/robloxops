import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CloudUpload, FolderKanban, Repeat2 } from "lucide-react";

import { getTenant, listProjects } from "@/lib/data";
import { statusMeta } from "@/lib/status";
import { cn, relativeTime } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Hari Ini — RobloxOps" };

const ACTIONS: Record<ProjectStatus, { label: string; cta: string }> = {
  intake: { label: "Pesanan baru — perlu dicek", cta: "Lihat" },
  briefing: { label: "Brief baru — baca dulu", cta: "Baca brief" },
  brief_review: { label: "Brief menunggu persetujuan", cta: "Review" },
  in_design: { label: "Sedang dikerjakan", cta: "Lanjut" },
  qa_check: { label: "Perlu cek kualitas file", cta: "Cek file" },
  customer_review: { label: "Menunggu review klien", cta: "Lihat" },
  revision: { label: "Ada revisi dari klien", cta: "Kerjakan" },
  approved: { label: "Disetujui — siap dikirim", cta: "Kirim" },
  delivered: { label: "Sudah terkirim", cta: "Lihat" },
  cancelled: { label: "Dibatalkan", cta: "Lihat" },
  on_hold: { label: "Ditahan sementara", cta: "Lihat" },
};

const PRIORITY: ProjectStatus[] = [
  "revision",
  "customer_review",
  "qa_check",
  "briefing",
  "brief_review",
  "in_design",
  "intake",
  "approved",
  "on_hold",
  "delivered",
  "cancelled",
];

function priorityOf(status: ProjectStatus) {
  const index = PRIORITY.indexOf(status);
  return index === -1 ? PRIORITY.length : index;
}

export default async function TodayPage() {
  const [tenant, projects] = await Promise.all([getTenant(), listProjects()]);

  const active = projects.filter((p) => p.status !== "delivered" && p.status !== "cancelled");
  const sorted = [...active].sort(
    (a, b) => priorityOf(a.status) - priorityOf(b.status) || b.updatedAt.localeCompare(a.updatedAt),
  );
  const revisions = projects.filter((p) => p.status === "revision").length;
  const toUpload = projects.filter((p) => p.status === "qa_check" || p.status === "approved").length;

  const dateLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 py-2">
      <header>
        <p className="meta text-[10px]">HARI INI</p>
        <h1 className="mt-1 text-headline-xl leading-tight text-ink">Halo, selamat datang</h1>
        <p className="mt-1 text-body-md text-ink-muted">
          {dateLabel} · {tenant.name}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/deliverables"
          className="panel flex items-center gap-3 p-4 transition-colors hover:border-brand"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand/15 text-brand">
            <CloudUpload size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">Upload hasil desain</span>
            <span className="block text-[11px] text-ink-muted">Kirim file ke klien</span>
          </span>
        </Link>

        <Link
          href="/revisions"
          className="panel flex items-center gap-3 p-4 transition-colors hover:border-brand"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[rgba(244,63,94,0.15)] text-status-review">
            <Repeat2 size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">Revisi klien</span>
            <span className="block text-[11px] text-ink-muted">
              {revisions > 0 ? `${revisions} menunggu` : "Tidak ada"}
            </span>
          </span>
        </Link>

        <Link
          href="/projects"
          className="panel flex items-center gap-3 p-4 transition-colors hover:border-brand"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-surface-2 text-ink-muted">
            <FolderKanban size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">Semua proyek</span>
            <span className="block text-[11px] text-ink-muted">{projects.length} total</span>
          </span>
        </Link>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div className="panel p-3">
          <p className="meta text-[9px]">Proyek aktif</p>
          <p className="mt-1 text-headline-lg text-ink">{active.length}</p>
        </div>
        <div className="panel p-3">
          <p className="meta text-[9px]">Perlu upload</p>
          <p className="mt-1 text-headline-lg text-ink">{toUpload}</p>
        </div>
        <div className="panel p-3">
          <p className="meta text-[9px]">Revisi</p>
          <p className="mt-1 text-headline-lg text-ink">{revisions}</p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-headline-sm text-ink">Yang perlu kamu kerjakan</h2>
          <Link href="/projects" className="text-[12px] text-brand hover:underline">
            Semua proyek
          </Link>
        </div>

        {sorted.length === 0 ? (
          <div className="panel p-6 text-center text-[13px] text-ink-muted">
            Tidak ada tugas aktif. Waktunya istirahat.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((project) => {
              const action = ACTIONS[project.status];
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="panel flex items-center gap-3 p-3.5 transition-colors hover:border-brand"
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", statusMeta[project.status].dot)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{project.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                        {action.label} · {project.customer.displayName}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[11px] text-ink-dim sm:inline">
                      {relativeTime(project.updatedAt)}
                    </span>
                    <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-line-strong px-2.5 text-[11px] text-ink-muted">
                      {action.cta}
                      <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
