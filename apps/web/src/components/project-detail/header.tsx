import Link from "next/link";
import { Clock, Target, User, Wallet } from "lucide-react";

import { isDemoMode } from "@/lib/data";
import { projectTypeLabel, statusMeta } from "@/lib/status";
import type { PaymentStatus, ProjectDetail } from "@/lib/types";
import { cn, formatUsd, relativeTime } from "@/lib/utils";
import { ProjectActions } from "./project-actions";

const paymentTone: Record<PaymentStatus, string> = {
  paid: "text-status-delivered",
  partial: "text-status-briefing",
  pending: "text-status-briefing",
  refunded: "text-danger-bright",
};

export function ProjectHeader({ project }: { project: ProjectDetail }) {
  const createdAt = project.timeline[0]?.at ?? project.updatedAt;
  const finalDeliverable =
    project.deliverables.find((deliverable) => deliverable.isFinal) ??
    project.deliverables[project.deliverables.length - 1];
  const target =
    project.projectType === "game_asset"
      ? "Roblox Studio Runtime"
      : "Roblox Avatar Marketplace";
  const statusCopy =
    project.status === "qa_check"
      ? "QA CHECK IN PROGRESS"
      : statusMeta[project.status].label.toUpperCase();

  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-body-sm text-ink-dim">
            <li>
              <Link href="/projects" className="transition-colors hover:text-ink">
                Projects &amp; Orders
              </Link>
            </li>
            <li aria-hidden="true" className="text-line-muted">
              /
            </li>
            <li>
              <span className="font-mono text-label-md text-ink">{project.reference}</span>
            </li>
            <li aria-hidden="true" className="text-line-muted">
              /
            </li>
            <li>
              <span aria-current="page" className="text-ink-muted">
                {projectTypeLabel[project.projectType]}
              </span>
            </li>
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm border border-line-strong bg-surface-1 px-2 font-mono text-label-sm uppercase text-ink-muted">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-status-delivered animate-pulse-soft"
            />
            Discord Synced {project.discordTicket ?? "—"}
          </span>
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm border border-line-strong bg-surface-1 px-2 font-mono text-label-sm uppercase text-ink-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {statusCopy}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="meta">
            Asset Identifier // {project.reference} · {project.assetDetail}
          </p>
          <h1 className="mt-2 max-w-[600px] text-balance text-[28px] font-bold leading-9 tracking-[-0.02em] text-ink sm:text-headline-xl">
            {project.title}
          </h1>

          <dl className="mt-5 grid gap-x-8 gap-y-2.5 text-body-md sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden="true" />
              <dt className="shrink-0 text-ink-dim">Client:</dt>
              <dd className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-medium text-ink">
                  {project.customer.displayName}
                </span>
                <span className="shrink-0 font-mono text-label-sm text-ink-dim">
                  (ID: {project.customer.discordId})
                </span>
              </dd>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden="true" />
              <dt className="shrink-0 text-ink-dim">Budget:</dt>
              <dd className="flex items-baseline gap-2">
                <span className="tabular font-medium text-ink">
                  {formatUsd(project.priceUsd)}
                </span>
                <span
                  className={cn(
                    "font-mono text-label-sm uppercase tracking-[0.08em]",
                    paymentTone[project.paymentStatus],
                  )}
                >
                  {project.paymentStatus}
                </span>
              </dd>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden="true" />
              <dt className="shrink-0 text-ink-dim">Created:</dt>
              <dd className="text-ink">
                <time dateTime={createdAt} className="tabular">
                  {relativeTime(createdAt)}
                </time>
              </dd>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Target className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden="true" />
              <dt className="shrink-0 text-ink-dim">Target:</dt>
              <dd className="truncate text-ink">{target}</dd>
            </div>
          </dl>
        </div>

        <div className="xl:shrink-0">
          <ProjectActions
            project={project}
            finalDeliverableId={finalDeliverable?.id}
            disabled={isDemoMode}
          />
        </div>
      </div>
    </header>
  );
}
