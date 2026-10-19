import { MessageSquare } from "lucide-react";

import type { ConversationMessage } from "@/lib/types";
import { cn, initialsOf } from "@/lib/utils";

const messageTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function avatarLabel(author: string) {
  const cleaned = author.replace(/\(.*?\)/g, "").trim();
  return initialsOf(cleaned) || "?";
}

export function ConversationPanel({
  conversation,
  channel,
}: {
  conversation: ConversationMessage[];
  channel: string;
}) {
  return (
    <section
      id="discord-sync-log"
      aria-labelledby="conversation-heading"
      className="panel scroll-mt-6 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h2 id="conversation-heading" className="text-headline-sm text-ink">
            Discord Sync Log
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-label-sm text-ink-dim">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-delivered" />
          {channel}
        </span>
      </div>

      <ol className="space-y-3 p-4">
        {conversation.map((message) => {
          const outbound = message.direction === "outbound";
          return (
            <li
              key={message.id}
              className={cn("flex items-start gap-2.5", outbound && "flex-row-reverse")}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-semibold",
                  outbound
                    ? "border-brand/40 bg-[rgba(0,162,255,0.12)] text-brand"
                    : "border-line-strong bg-surface-2 text-ink-muted",
                )}
              >
                {avatarLabel(message.author)}
              </span>
              <div className="min-w-0 max-w-[85%]">
                <div
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
                    outbound && "justify-end",
                  )}
                >
                  <span className="text-body-sm font-medium text-ink">{message.author}</span>
                  <time
                    dateTime={message.at}
                    className="font-mono text-[10px] tabular text-ink-dim"
                  >
                    {messageTimeFormat.format(new Date(message.at))}
                  </time>
                  {message.agentName ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-brand/80">
                      {message.agentName}
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 rounded border bg-surface-2 px-3 py-2 text-body-md leading-5 text-ink-muted",
                    outbound ? "border-brand/25" : "border-line",
                  )}
                >
                  {message.content}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
