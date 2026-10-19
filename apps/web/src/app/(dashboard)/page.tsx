import Link from "next/link";
import { Link2, Plus, Upload } from "lucide-react";

import { getOverview, getStatusCounts, getTenant, isDemoMode } from "@/lib/data";
import { formatUsd } from "@/lib/utils";
import { AiActivityBar } from "@/components/overview/ai-activity-bar";
import { DiscordRelay } from "@/components/overview/discord-relay";
import { QaPreview } from "@/components/overview/qa-preview";
import { StatCard } from "@/components/overview/stat-card";
import { StudioStream } from "@/components/overview/studio-stream";
import { TeamAllocation } from "@/components/overview/team-allocation";
import { UrgentDeliverables } from "@/components/overview/urgent-deliverables";

export default async function OverviewPage() {
  const [{ stats, events, teamLoads, urgent, qaReady, viewerName }, tenant, statusCounts] =
    await Promise.all([getOverview(), getTenant(), getStatusCounts()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-headline-xl text-ink">Studio Operations Hub</h1>
            <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.12)] px-2 font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-status-delivered">
              <span className="h-1 w-1 animate-pulse-soft rounded-full bg-status-delivered" aria-hidden="true" />
              Realtime
            </span>
          </div>
          <p className="mt-2 text-body-md text-ink-muted">
            Welcome back, <span className="text-ink">{viewerName}</span>. · {tenant.name} studio
            overview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/api/discord/authorize"
            className="inline-flex h-11 items-center justify-center gap-2 rounded border border-line-strong px-4 text-body-md font-medium text-ink transition-colors hover:border-brand hover:bg-surface-2"
          >
            <Link2 size={15} className="text-ink-muted" aria-hidden="true" />
            Connect Discord Server
          </Link>
          <Link
            href="/deliverables#upload-panel"
            className="inline-flex h-11 items-center justify-center gap-2 rounded border border-line-strong px-4 text-body-md font-medium text-ink transition-colors hover:border-brand hover:bg-surface-2"
          >
            <Upload size={15} className="text-ink-muted" aria-hidden="true" />
            Upload Deliverable
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-4 text-body-md font-semibold text-canvas transition-colors hover:bg-brand-bright"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            New Project Order
          </Link>
        </div>
      </div>

      <AiActivityBar />

      <section
        aria-label="Studio metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Active Projects"
          value={String(stats.activeProjects)}
          unit="Active"
          badge={`↑ +${stats.activeDelta} wk`}
          badgeTone="brand"
          footer={
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-status-qa" aria-hidden="true" />
                {stats.qaCheck} in QA Check
              </span>
              <span className="text-ink-dim" aria-hidden="true">
                ·
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-status-design" aria-hidden="true" />
                {stats.inDesign} in Design
              </span>
            </>
          }
        />

        <StatCard
          label="Pending Tasks"
          value={String(stats.queueTasks)}
          unit="Queue Tasks"
          badge={`${stats.dueToday} Due Today`}
          badgeTone="danger"
          footer={
            <>
              High priority pipeline bottlenecks:{" "}
              <span className="tabular font-mono text-ink">{stats.highPriorityOpen}</span>
            </>
          }
        />

        <StatCard
          label="Discord Orders"
          value={String(stats.newIntakes)}
          unit="New Intakes"
          footer={
            <>
              <span>
                <span className="tabular font-mono text-ink">{stats.scopedByAi}</span> Scoped by AI
              </span>
              <span className="text-ink-dim" aria-hidden="true">
                ·
              </span>
              <span>
                <span className="tabular font-mono text-ink">{stats.briefReview}</span> Brief Review
              </span>
            </>
          }
        />

        <StatCard
          label="Revenue This Month"
          value={formatUsd(stats.revenueUsd)}
          unit="USD"
          badge={`↑ +${stats.revenueDelta}%`}
          badgeTone="neutral"
          footer={
            <span className="font-mono text-[10px] text-ink-muted">
              R$ {stats.revenueRobux.toLocaleString("en-US")} Robux equiv
            </span>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <UrgentDeliverables
            projects={urgent}
            totalActive={stats.activeProjects}
            counts={statusCounts}
          />
          <QaPreview project={qaReady} disabled={isDemoMode} />
        </div>

        <div className="flex flex-col gap-4">
          <StudioStream events={events} />
          <TeamAllocation loads={teamLoads} />
          <DiscordRelay guild={tenant.discordGuild} />
        </div>
      </div>
    </div>
  );
}
