import { Radio } from "lucide-react";

import type { StudioEvent, StudioEventKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const dotTone: Record<StudioEventKind, string> = {
  agent: "bg-brand shadow-[0_0_8px_rgba(0,162,255,0.7)]",
  human: "bg-status-intake",
  billing: "bg-status-delivered",
  client: "bg-status-briefing",
};

export function StudioStream({ events }: { events: StudioEvent[] }) {
  return (
    <section className="panel" aria-labelledby="studio-stream-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-brand" aria-hidden="true" />
          <h2 id="studio-stream-title" className="text-headline-sm text-ink">
            Studio Stream
          </h2>
        </div>
        <span className="font-mono text-[10px] tracking-[0.06em] text-ink-dim">Realtime</span>
      </header>

      <ol className="px-4 py-4">
        {events.map((event, index) => (
          <li key={event.id} className="relative pb-5 pl-5 last:pb-0">
            {index < events.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[3px] top-3 h-full w-px bg-line-strong"
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn("absolute left-0 top-[5px] h-[7px] w-[7px] rounded-full", dotTone[event.kind])}
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-sm leading-5 text-ink-muted">
                <span className="font-medium text-ink">{event.actor}</span> {event.text}
              </p>
              <span className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-dim">{event.at}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
