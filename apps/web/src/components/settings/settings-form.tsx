"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { updateSettings, type SettingsState } from "@/app/(dashboard)/settings/actions";
import { cn } from "@/lib/utils";

interface SettingsFormProps {
  defaults: {
    tone: string;
    timezone: string;
    approvalMode: string;
    maxRevisions: number;
    aiPaused: boolean;
  };
  demoMode: boolean;
}

const initialState: SettingsState = { ok: false, message: "" };

export function SettingsForm({ defaults, demoMode }: SettingsFormProps) {
  const [state, action, pending] = useActionState(updateSettings, initialState);

  return (
    <form action={action} className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-sm text-ink">Agent behaviour</h2>
        {demoMode ? <span className="meta text-[9px]">DEMO MODE</span> : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="meta">Reply tone</span>
          <select
            name="tone"
            defaultValue={defaults.tone}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2 text-[13px] text-ink focus:border-brand focus:outline-none"
          >
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="playful">Playful</option>
          </select>
        </label>

        <label className="block">
          <span className="meta">Business hours (timezone)</span>
          <select
            name="timezone"
            defaultValue={defaults.timezone}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2 text-[13px] text-ink focus:border-brand focus:outline-none"
          >
            <option value="UTC">UTC</option>
            <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Europe/London">Europe/London</option>
          </select>
        </label>

        <label className="block">
          <span className="meta">Approval mode</span>
          <select
            name="approval_mode"
            defaultValue={defaults.approvalMode}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-2 text-[13px] text-ink focus:border-brand focus:outline-none"
          >
            <option value="auto">Auto-send agent messages</option>
            <option value="preview">Preview before sending</option>
            <option value="human">Human-only outreach</option>
          </select>
        </label>

        <label className="block">
          <span className="meta">Max revisions per order</span>
          <input
            type="number"
            name="max_revisions"
            min={0}
            max={10}
            defaultValue={defaults.maxRevisions}
            className="tabular mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2.5 rounded border border-line bg-canvas px-3 py-2.5">
        <input
          type="checkbox"
          name="ai_paused"
          defaultChecked={defaults.aiPaused}
          className="mt-0.5 h-4 w-4 rounded-sm border border-line-strong bg-canvas accent-brand"
        />
        <span>
          <span className="block text-[12px] text-ink">Pause all AI agents</span>
          <span className="block font-mono text-[10px] text-ink-dim">
            Messages still arrive and queue; nothing is answered automatically.
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p
          role="status"
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.06em]",
            state.message ? (state.ok ? "text-status-delivered" : "text-danger-bright") : "text-ink-dim",
          )}
        >
          {state.message || "Changes apply to new conversations only"}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </button>
      </div>
    </form>
  );
}
