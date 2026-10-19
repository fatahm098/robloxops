import { FileText, MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";

import { BriefPanel } from "@/components/project-detail/brief-panel";
import { ConversationPanel } from "@/components/project-detail/conversation-panel";
import { DeliverablesPanel } from "@/components/project-detail/deliverables-panel";
import { ProjectHeader } from "@/components/project-detail/header";
import { TimelinePanel } from "@/components/project-detail/timeline-panel";
import { getProjectDetail } from "@/lib/data";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectDetail(id);

  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <ProjectHeader project={project} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          <nav
            aria-label="Project brief views"
            className="flex items-stretch gap-1 rounded border border-line bg-surface-1 p-1"
          >
            <a
              href="#brief"
              aria-current="true"
              className="inline-flex h-11 items-center gap-2 rounded-sm bg-surface-2 px-3 text-body-md font-semibold text-ink shadow-[inset_0_-2px_0_#00A2FF]"
            >
              <FileText className="h-4 w-4 text-brand" aria-hidden="true" />
              AI-Structured Brief
            </a>
            <a
              href="#discord-sync-log"
              className="inline-flex h-11 items-center gap-2 rounded-sm px-3 text-body-md font-medium text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Discord Sync Log
            </a>
            <span className="meta ml-auto hidden items-center gap-1.5 px-3 md:flex">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-status-delivered animate-pulse-soft"
              />
              Pipeline Agent: v3.2
            </span>
          </nav>

          <BriefPanel brief={project.brief} />

          <ConversationPanel
            conversation={project.conversation}
            channel={project.discordTicket ?? "#client-comm"}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <DeliverablesPanel deliverables={project.deliverables} />
          <TimelinePanel timeline={project.timeline} status={project.status} />
        </div>
      </div>
    </div>
  );
}
