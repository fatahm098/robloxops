"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { sendAssistantMessage } from "@/app/(dashboard)/assistant/actions";
import type { AssistantMessage, AssistantToolTrace } from "@/lib/assistant";
import { useViewMode } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

import { QuickPrompts } from "./quick-prompts";

/** Tools that change data. Designer mode only surfaces these, never reads. */
const WRITE_TOOLS = new Set([
  "create_project",
  "update_project_status",
  "create_task",
  "log_revision",
  "draft_customer_message",
]);

function newId(): string {
  // crypto.randomUUID needs a secure context; LAN IPs over http:// do not have
  // one, so fall back to a plain random id instead of throwing on click.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newMessage(
  role: "user" | "assistant",
  content: string,
  toolCalls: AssistantToolTrace[] = [],
): AssistantMessage {
  return {
    id: newId(),
    role,
    content,
    toolCalls,
    createdAt: new Date().toISOString(),
  };
}

export function AssistantPanel({
  initialMessages,
  initialThreadId,
}: {
  initialMessages: AssistantMessage[];
  initialThreadId: string | null;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [pending, startTransition] = useTransition();
  const { mode } = useViewMode();
  const isDesigner = mode === "designer";
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;

    setError(null);
    setDraft("");
    setMessages((prev) => [...prev, newMessage("user", content)]);

    startTransition(async () => {
      try {
        const result = await sendAssistantMessage({ message: content, threadId });
        if (!result.ok) {
          setError(result.message ?? "Asisten tidak bisa memproses pesan itu.");
          return;
        }
        if (result.threadId) setThreadId(result.threadId);
        setMessages((prev) => [
          ...prev,
          newMessage("assistant", result.reply ?? "", result.toolCalls ?? []),
        ]);
      } catch (error) {
        console.error("[assistant] send failed", error);
        setError("Asisten gagal dihubungi. Coba lagi.");
      }
    });
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 py-2">
      <header>
        <p className="meta text-[10px]">ASISTEN</p>
        <h1 className="mt-1 text-headline-xl leading-tight text-ink">
          {isDesigner ? "Tanya apa saja soal studio" : "Studio Assistant"}
        </h1>
        <p className="mt-1 text-body-md text-ink-muted">
          {isDesigner
            ? "Bisa baca proyek, menambah proyek, dan mencatat revisi untukmu."
            : "Read and write access to projects, tasks and revisions. Customer messages are queued for approval."}
        </p>
      </header>

      <section className="panel flex min-h-[420px] flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/15 text-brand">
                <Bot size={20} aria-hidden="true" />
              </span>
              <p className="text-[13px] font-medium text-ink">Halo, mau dibantu apa?</p>
              <p className="max-w-[380px] text-[12px] text-ink-muted">
                Contoh: &ldquo;tambah proyek kaos merah untuk Budi&rdquo; atau &ldquo;ringkas proyek aktif&rdquo;.
              </p>
              <QuickPrompts disabled={pending} onPick={send} />
            </div>
          ) : (
            messages.map((entry) => {
              const isUser = entry.role === "user";
              const writeActions = entry.toolCalls.filter(
                (call) => call.ok && WRITE_TOOLS.has(call.name),
              );
              return (
                <div
                  key={entry.id}
                  className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full border",
                      isUser
                        ? "border-line-strong bg-surface-2 text-ink-muted"
                        : "border-brand/40 bg-[rgba(0,162,255,0.12)] text-brand",
                    )}
                  >
                    {isUser ? <User size={13} /> : <Bot size={14} />}
                  </span>

                  <div className="min-w-0 max-w-[85%]">
                    <p
                      className={cn(
                        "whitespace-pre-wrap rounded border bg-surface-2 px-3 py-2 text-body-md leading-5 text-ink-muted",
                        isUser ? "border-line" : "border-brand/25 text-ink",
                      )}
                    >
                      {entry.content}
                    </p>

                    {writeActions.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {writeActions.map((call, index) => (
                          <li
                            key={`${entry.id}-action-${index}`}
                            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered"
                          >
                            <span aria-hidden="true">✓</span>
                            {call.summary || call.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {!isDesigner && entry.toolCalls.length > 0 ? (
                      <details className="mt-2 rounded border border-line bg-surface-1 px-2.5 py-1.5">
                        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
                          {entry.toolCalls.length} tool call(s)
                        </summary>
                        <ul className="mt-1.5 space-y-1">
                          {entry.toolCalls.map((call, index) => (
                            <li
                              key={`${entry.id}-tool-${index}`}
                              className="font-mono text-[10px] text-ink-dim"
                            >
                              <span className={call.ok ? "text-status-delivered" : "text-status-review"}>
                                {call.ok ? "ok" : "err"}
                              </span>{" "}
                              {call.name} — {call.summary}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {pending ? (
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Asisten sedang menulis
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        <div className="border-t border-line p-4">
          {error ? (
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-status-review">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              rows={2}
              maxLength={2000}
              disabled={pending}
              placeholder="Tulis pesan untuk asisten… (Ctrl+Enter untuk kirim)"
              aria-label="Pesan untuk asisten"
              className="min-h-[44px] w-full resize-y rounded border border-line-strong bg-surface-1 px-3 py-2 text-body-md text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              disabled={pending || draft.trim().length === 0}
              onClick={() => send(draft)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded border border-brand bg-brand px-4 text-body-md font-semibold text-[#020617] transition-colors hover:bg-brand-bright hover:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Kirim
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
