"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MessageSquare, PauseCircle, PlayCircle, Send } from "lucide-react";

import {
  sendConversationReply,
  setHumanTakeover,
} from "@/app/(dashboard)/projects/actions";
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
  projectId,
  conversation,
  channel,
  humanTakeover,
  disabled = false,
}: {
  projectId: string;
  conversation: ConversationMessage[];
  channel: string;
  humanTakeover: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [replyPending, startReply] = useTransition();
  const [takeoverPending, startTakeover] = useTransition();

  function submitReply() {
    const content = reply.trim();
    if (content.length === 0) {
      setMessage("Write a message first.");
      return;
    }
    setMessage(null);
    startReply(async () => {
      const result = await sendConversationReply(projectId, content);
      setMessage(result.message);
      if (result.ok) {
        setReply("");
        router.refresh();
      }
    });
  }

  function toggleTakeover() {
    setMessage(null);
    startTakeover(async () => {
      const result = await setHumanTakeover(projectId, !humanTakeover);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={disabled || takeoverPending}
            onClick={toggleTakeover}
            title={humanTakeover ? "Let the AI reply again" : "Pause the AI and reply manually"}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 font-mono text-label-sm uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              humanTakeover
                ? "border-status-briefing/50 bg-[rgba(251,191,36,0.12)] text-status-briefing"
                : "border-line-strong bg-surface-1 text-ink-muted hover:border-brand hover:text-brand",
            )}
          >
            {takeoverPending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : humanTakeover ? (
              <PlayCircle className="h-3 w-3" aria-hidden="true" />
            ) : (
              <PauseCircle className="h-3 w-3" aria-hidden="true" />
            )}
            {humanTakeover ? "Release takeover" : "Human takeover"}
          </button>
          <span className="inline-flex items-center gap-1.5 font-mono text-label-sm text-ink-dim">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-delivered" />
            {channel}
          </span>
        </div>
      </div>

      {humanTakeover ? (
        <div className="border-b border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] px-4 py-2">
          <p className="font-mono text-label-sm uppercase tracking-[0.06em] text-status-briefing">
            AI paused for this thread — you&apos;re replying manually
          </p>
        </div>
      ) : null}

      <ol className="space-y-3 p-4">
        {conversation.map((entry) => {
          const outbound = entry.direction === "outbound";
          return (
            <li
              key={entry.id}
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
                {avatarLabel(entry.author)}
              </span>
              <div className="min-w-0 max-w-[85%]">
                <div
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
                    outbound && "justify-end",
                  )}
                >
                  <span className="text-body-sm font-medium text-ink">{entry.author}</span>
                  <time
                    dateTime={entry.at}
                    className="font-mono text-[10px] tabular text-ink-dim"
                  >
                    {messageTimeFormat.format(new Date(entry.at))}
                  </time>
                  {entry.agentName ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-brand/80">
                      {entry.agentName}
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 rounded border bg-surface-2 px-3 py-2 text-body-md leading-5 text-ink-muted",
                    outbound ? "border-brand/25" : "border-line",
                  )}
                >
                  {entry.content}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-line p-4">
        <label htmlFor="conversation-reply" className="meta mb-2 block">
          Reply as your studio
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="conversation-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!disabled && !replyPending) submitReply();
              }
            }}
            rows={2}
            maxLength={4000}
            disabled={disabled || replyPending}
            placeholder={
              disabled
                ? "Demo mode — connect the worker to reply."
                : "Type a message to the customer…"
            }
            className="min-h-[44px] w-full resize-y rounded border border-line-strong bg-surface-1 px-3 py-2 text-body-md text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled={disabled || replyPending || reply.trim().length === 0}
            onClick={submitReply}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded border border-brand bg-brand px-4 text-body-md font-semibold text-[#020617] transition-colors hover:bg-brand-bright hover:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
          >
            {replyPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Send
          </button>
        </div>
        {message ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
