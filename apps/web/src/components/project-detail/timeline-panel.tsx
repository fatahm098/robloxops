import { Activity } from "lucide-react";

import type { ProjectStatus, TimelineEvent, TimelineKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const stageByStatus: Record<ProjectStatus, number> = {
  intake: 1,
  briefing: 2,
  brief_review: 2,
  in_design: 3,
  revision: 3,
  qa_check: 4,
  customer_review: 4,
  approved: 5,
  delivered: 5,
  cancelled: 1,
  on_hold: 1,
};

const dotTone: Record<TimelineKind, string> = {
  agent: "bg-brand",
  human: "bg-ink-muted",
  system: "bg-line-muted",
  client: "bg-status-review",
};

const eventDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const totalStages = 5;

export function TimelinePanel({
  timeline,
  status,
}: {
  timeline: TimelineEvent[];
  status: ProjectStatus;
}) {
  const stage = stageByStatus[status];
  const currentIndex = timeline.length - 1;

  return (
    <section aria-labelledby="timeline-heading" className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h2 id="timeline-heading" className="text-headline-sm text-ink">
            Project Execution Lifecycle
          </h2>
        </div>
        <span className="meta shrink-0">
          Stage {stage} of {totalStages}
        </span>
      </div>

      {timeline.length > 0 ? (
        <ol className="relative space-y-4 p-4 before:absolute before:bottom-6 before:left-[21px] before:top-6 before:w-px before:bg-line">
          {timeline.map((event, index) => {
            const isCurrent = index === currentIndex;
            return (
              <li
                key={event.id}
                aria-current={isCurrent ? "step" : undefined}
                className="relative pl-6"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-[3px] h-2.5 w-2.5 rounded-full",
                    dotTone[event.kind],
                    isCurrent && "shadow-focus ring-2 ring-brand/50 ring-offset-2 ring-offset-surface-1",
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <time
                    dateTime={event.at}
                    className="font-mono text-label-sm tabular text-ink-muted"
                  >
                    {eventDateFormat.format(new Date(event.at))}
                  </time>
                  <span className="font-mono text-label-sm text-ink-dim">· {event.actor}</span>
                </div>
                <p className="mt-1 text-body-md leading-5 text-ink">{event.title}</p>
                {event.description ? (
                  <p className="mt-1 text-body-sm leading-5 text-ink-dim">{event.description}</p>
                ) : null}
                {isCurrent ? (
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-brand">
                    Current Status
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="p-4 text-body-md text-ink-dim">No lifecycle events recorded yet.</p>
      )}
    </section>
  );
}
