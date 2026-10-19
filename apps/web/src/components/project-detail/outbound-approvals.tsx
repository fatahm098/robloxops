"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, ShieldQuestion, X } from "lucide-react";

import {
  approveOutbound,
  rejectOutbound,
} from "@/app/(dashboard)/projects/actions";
import type { OutboundMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  deliverable: "Deliverable",
  brief: "Brief",
  status: "Status update",
  first_message: "First message",
  followup: "Follow-up",
  manual: "Manual",
};

export function OutboundApprovals({
  messages,
  disabled = false,
}: {
  messages: OutboundMessage[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (messages.length === 0) return null;

  function decide(id: string, decision: "approve" | "reject") {
    setMessage(null);
    setPendingId(id);
    startTransition(async () => {
      const result =
        decision === "approve" ? await approveOutbound(id) : await rejectOutbound(id);
      setMessage(result.message);
      if (result.ok) router.refresh();
      setPendingId(null);
    });
  }

  return (
    <section aria-labelledby="outbound-approvals-heading" className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h2 id="outbound-approvals-heading" className="text-headline-sm text-ink">
            Awaiting Approval
          </h2>
        </div>
        <span className="meta shrink-0">{messages.length} queued</span>
      </div>

      <ul className="space-y-3 p-4">
        {messages.map((entry) => {
          const busy = pending && pendingId === entry.id;
          return (
            <li
              key={entry.id}
              className="rounded border border-line bg-surface-2/60 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex h-[22px] items-center rounded-sm border border-brand/40 bg-[rgba(0,162,255,0.12)] px-2 font-mono text-label-sm uppercase text-brand">
                  {KIND_LABELS[entry.kind] ?? entry.kind}
                </span>
                <time
                  dateTime={entry.createdAt}
                  className="font-mono text-[10px] tabular text-ink-dim"
                >
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "UTC",
                  })}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-body-md leading-5 text-ink-muted">
                {entry.body}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => decide(entry.id, "approve")}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-brand bg-brand px-3 text-body-sm font-semibold text-[#020617] transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => decide(entry.id, "reject")}
                  className={cn(
                    "inline-flex h-8 items-center justify-center gap-1.5 rounded border border-danger bg-[rgba(162,26,36,0.2)] px-3 text-body-sm font-semibold text-danger-soft transition-colors hover:bg-[rgba(162,26,36,0.35)] disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {message ? (
        <p className="border-t border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
