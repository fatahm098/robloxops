"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { updateApprovalSettings, type SettingsState } from "@/app/(dashboard)/settings/actions";
import { cn } from "@/lib/utils";

type ApprovalMode = "auto" | "preview" | "human";

interface ApprovalFormProps {
  demoMode: boolean;
  fallbackMode: ApprovalMode;
  defaults: Record<string, ApprovalMode>;
}

interface ApprovalKindField {
  key: string;
  label: string;
  hint: string;
}

const APPROVAL_KINDS: ApprovalKindField[] = [
  {
    key: "first_message",
    label: "First message",
    hint: "The opening reply when a new commission lands.",
  },
  {
    key: "brief",
    label: "Brief",
    hint: "Brief summaries and clarifying questions sent to the customer.",
  },
  {
    key: "deliverable",
    label: "Deliverable",
    hint: "Delivery notices once a file is ready for review.",
  },
  {
    key: "status",
    label: "Status update",
    hint: "Progress and status-change announcements.",
  },
  {
    key: "followup",
    label: "Follow-up",
    hint: "Nudges for quiet customers and open revisions.",
  },
];

const MODE_OPTIONS: Array<{ value: ApprovalMode; label: string }> = [
  { value: "auto", label: "Auto — send immediately" },
  { value: "preview", label: "Preview — queue in Approvals" },
  { value: "human", label: "Human — queue for a person to send" },
];

export function ApprovalForm({ demoMode, fallbackMode, defaults }: ApprovalFormProps) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SettingsState | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demoMode) return;

    const formData = new FormData(event.currentTarget);
    setPending(true);
    setState(null);

    try {
      const result = await updateApprovalSettings(formData);
      setState(result);
    } catch {
      setState({ ok: false, message: "Could not save approval settings. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-headline-sm text-ink">Message approvals</h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            Choose which outbound messages the agents may send on their own.
          </p>
        </div>
        {demoMode ? <span className="meta text-[9px]">DEMO MODE</span> : null}
      </div>

      <p className="mt-3 rounded border border-line bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
          Modes:
        </span>{" "}
        <span className="text-ink">Auto</span> sends immediately.{" "}
        <span className="text-ink">Preview</span> and <span className="text-ink">Human</span> both
        queue the message in the Approvals list for a person to send.
      </p>

      {demoMode ? (
        <p className="mt-3 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] px-3 py-2 text-[12px] text-ink-muted">
          Demo mode: approval controls are disabled — connect Supabase to persist changes.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {APPROVAL_KINDS.map((field) => (
          <label key={field.key} className="block rounded border border-line bg-canvas p-3">
            <span className="meta">{field.label}</span>
            <select
              name={field.key}
              defaultValue={defaults[field.key] ?? fallbackMode}
              disabled={demoMode || pending}
              className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2 text-[13px] text-ink focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">
              {field.hint}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
        Global fallback: {fallbackMode} · used when a kind has no override
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p
          role="status"
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.06em]",
            state?.message
              ? state.ok
                ? "text-status-delivered"
                : "text-danger-bright"
              : "text-ink-dim",
          )}
        >
          {state?.message || "Changes apply to new outbound messages only"}
        </p>
        <button
          type="submit"
          disabled={demoMode || pending}
          className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save approvals
        </button>
      </div>
    </form>
  );
}
