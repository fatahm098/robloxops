"use client";

import { useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";

import {
  clearIntegrationSecret,
  saveIntegrationSecret,
  saveLlmModels,
  saveSocialHandle,
  type SettingsState,
} from "@/app/(dashboard)/settings/actions";
import type { SecretKey, SecretStatus } from "@/lib/secrets";
import { cn } from "@/lib/utils";

interface IntegrationsFormProps {
  statuses: Record<string, SecretStatus>;
  models: {
    modelFast: string;
    modelMid: string;
    modelVision: string;
  };
  demoMode: boolean;
  socialHandle?: string | null;
}

interface SecretField {
  keyName: SecretKey;
  label: string;
  hint: string;
  placeholder: string;
}

const SECRET_FIELDS: SecretField[] = [
  {
    keyName: "LLM_API_KEY",
    label: "LLM API key",
    hint: "Used by the worker for intake, briefs and QA.",
    placeholder: "sk-…",
  },
  {
    keyName: "LLM_BASE_URL",
    label: "LLM base URL",
    hint: "Optional OpenAI-compatible endpoint, e.g. https://api.openai.com/v1.",
    placeholder: "https://api.openai.com/v1",
  },
  {
    keyName: "STRIPE_SECRET_KEY",
    label: "Stripe secret key",
    hint: "Enables per-tenant checkout and the billing portal.",
    placeholder: "sk_live_…",
  },
  {
    keyName: "STRIPE_WEBHOOK_SECRET",
    label: "Stripe webhook secret",
    hint: "Platform webhook signing secret shared by all tenants.",
    placeholder: "whsec_…",
  },
  {
    keyName: "RESEND_API_KEY",
    label: "Resend API key",
    hint: "Transactional email for customer and designer notifications.",
    placeholder: "re_…",
  },
  {
    keyName: "X_API_KEY",
    label: "X API key",
    hint: "Consumer key of your X app (OAuth 1.0a user context).",
    placeholder: "consumer key",
  },
  {
    keyName: "X_API_SECRET",
    label: "X API secret",
    hint: "Consumer secret. Needs tweet.write + media.write scopes.",
    placeholder: "consumer secret",
  },
  {
    keyName: "X_ACCESS_TOKEN",
    label: "X access token",
    hint: "Access token of the account that will post the portfolio.",
    placeholder: "access token",
  },
  {
    keyName: "X_ACCESS_SECRET",
    label: "X access secret",
    hint: "Access token secret. Stored in Vault, never shown again.",
    placeholder: "access token secret",
  },
];

function formatUpdated(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: SecretStatus | undefined): string {
  if (!status) return "Not set";
  const updated = formatUpdated(status.updatedAt);
  return updated ? `Updated ${updated}` : "Saved";
}

export function IntegrationsForm({ statuses, models, demoMode, socialHandle }: IntegrationsFormProps) {
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-headline-sm text-ink">Integrations / API Keys</h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            Keys are stored server-side and only the last four characters are shown here.
          </p>
        </div>
        {demoMode ? <span className="meta text-[9px]">DEMO MODE</span> : null}
      </div>

      {demoMode ? (
        <p className="mt-3 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] px-3 py-2 text-[12px] text-ink-muted">
          Integrations are disabled in demo mode — connect Supabase to store per-tenant keys.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {SECRET_FIELDS.map((field) => (
          <SecretRow
            key={field.keyName}
            field={field}
            status={statuses[field.keyName]}
            demoMode={demoMode}
          />
        ))}
      </div>

      <LlmModelsForm models={models} demoMode={demoMode} />
      <SocialHandleForm handle={socialHandle ?? ""} demoMode={demoMode} />
    </section>
  );
}

function SocialHandleForm({ handle, demoMode }: { handle: string; demoMode: boolean }) {
  const [value, setValue] = useState(handle);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SettingsState | null>(null);

  async function onSave() {
    setPending(true);
    setState(null);
    try {
      const result = await saveSocialHandle(value);
      setState(result);
    } catch {
      setState({ ok: false, message: "Gagal menyimpan akun X." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-line bg-canvas p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="meta">Akun X untuk portofolio</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">
          social_accounts
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Handle yang tampil di antrean portofolio. Token di atas yang dipakai saat publish.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="@studiokamu"
          autoComplete="off"
          spellCheck={false}
          disabled={demoMode || pending}
          className="h-9 w-full max-w-[260px] rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={demoMode || pending}
          className="inline-flex h-9 items-center gap-1.5 rounded bg-brand px-3 text-[12px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Simpan
        </button>
      </div>
      {state?.message ? (
        <p
          role="status"
          className={cn(
            "mt-1 font-mono text-[10px] uppercase tracking-[0.06em]",
            state.ok ? "text-status-delivered" : "text-danger-bright",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

interface SecretRowProps {
  field: SecretField;
  status: SecretStatus | undefined;
  demoMode: boolean;
}

function SecretRow({ field, status, demoMode }: SecretRowProps) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<"save" | "clear" | null>(null);
  const [state, setState] = useState<SettingsState | null>(null);

  const updated = formatUpdated(status?.updatedAt ?? null);
  const placeholder = status
    ? `•••• ${status.last4 ?? "****"}${updated ? ` · updated ${updated}` : ""}`
    : field.placeholder;

  async function onSave() {
    if (!value.trim()) {
      setState({ ok: false, message: "Enter a value first." });
      return;
    }
    setPending("save");
    setState(null);
    try {
      const result = await saveIntegrationSecret({ keyName: field.keyName, value });
      setState(result);
      if (result.ok) setValue("");
    } catch {
      setState({ ok: false, message: "Could not save the key. Try again." });
    } finally {
      setPending(null);
    }
  }

  async function onClear() {
    setPending("clear");
    setState(null);
    try {
      const result = await clearIntegrationSecret({ keyName: field.keyName });
      setState(result);
      if (result.ok) setValue("");
    } catch {
      setState({ ok: false, message: "Could not clear the key. Try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded border border-line bg-canvas p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="meta">{field.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">
          {field.keyName}
        </span>
      </div>

      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={demoMode || pending !== null}
        className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60"
      />

      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">
        {statusLabel(status)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={demoMode || pending !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded bg-brand px-3 text-[12px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "save" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={demoMode || pending !== null || !status}
          className="inline-flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[12px] text-ink-muted transition-colors hover:border-danger hover:text-danger-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "clear" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-dim">{field.hint}</p>

      {state?.message ? (
        <p
          role="status"
          className={cn(
            "mt-1 font-mono text-[10px] uppercase tracking-[0.06em]",
            state.ok ? "text-status-delivered" : "text-danger-bright",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

interface LlmModelsFormProps {
  models: {
    modelFast: string;
    modelMid: string;
    modelVision: string;
  };
  demoMode: boolean;
}

function LlmModelsForm({ models, demoMode }: LlmModelsFormProps) {
  const [modelFast, setModelFast] = useState(models.modelFast);
  const [modelMid, setModelMid] = useState(models.modelMid);
  const [modelVision, setModelVision] = useState(models.modelVision);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SettingsState | null>(null);

  async function onSave() {
    setPending(true);
    setState(null);
    try {
      const result = await saveLlmModels({ modelFast, modelMid, modelVision });
      setState(result);
    } catch {
      setState({ ok: false, message: "Could not save models. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-line bg-canvas p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="meta">LLM models</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-dim">
          NON-SECRET · tenants.settings
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="meta text-[9px]">Fast model</span>
          <input
            value={modelFast}
            onChange={(event) => setModelFast(event.target.value)}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
            disabled={demoMode || pending}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="meta text-[9px]">Mid model</span>
          <input
            value={modelMid}
            onChange={(event) => setModelMid(event.target.value)}
            placeholder="gpt-4o"
            autoComplete="off"
            spellCheck={false}
            disabled={demoMode || pending}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="meta text-[9px]">Vision model</span>
          <input
            value={modelVision}
            onChange={(event) => setModelVision(event.target.value)}
            placeholder="gpt-4o"
            autoComplete="off"
            spellCheck={false}
            disabled={demoMode || pending}
            className="mt-1.5 h-11 w-full rounded border border-line-strong bg-surface-1 px-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
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
          {state?.message || "Leave a field empty to clear that model override"}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={demoMode || pending}
          className="inline-flex h-9 items-center gap-1.5 rounded bg-brand px-3 text-[12px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save models
        </button>
      </div>
    </div>
  );
}
