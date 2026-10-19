"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

import type { AuthState } from "@/app/(auth)/actions";

interface Field {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}

interface Props {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  fields: Field[];
  submitLabel: string;
  isDemoMode: boolean;
  next?: string;
}

export function AuthForm({ mode, action, fields, submitLabel, isDemoMode, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {fields.map((field) => (
        <label key={field.name} className="block">
          <span className="meta text-[10px]">{field.label}</span>
          <input
            name={field.name}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            defaultValue={field.name === "slug" ? "apex-ugc" : undefined}
            required
            className="mt-1.5 h-11 w-full rounded border border-line bg-surface-1 px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand"
          />
        </label>
      ))}

      {state.error ? (
        <div className="flex items-start gap-2 rounded border border-[rgba(162,26,36,0.4)] bg-[rgba(162,26,36,0.12)] px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-bright" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-danger-soft">{state.error}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-4 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {submitLabel}
      </button>

      {isDemoMode ? (
        <div className="flex items-start gap-2 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-briefing" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Demo mode: credentials are not configured, so sign-in is disabled. Use{" "}
            <Link href="/" className="text-brand hover:underline">
              Continue in demo mode
            </Link>
            .
          </p>
        </div>
      ) : null}

      {mode === "login" ? (
        <Link
          href="/signup"
          className="text-center text-[12px] text-ink-muted transition-colors hover:text-brand"
        >
          New studio? Create a workspace
        </Link>
      ) : (
        <Link
          href="/login"
          className="text-center text-[12px] text-ink-muted transition-colors hover:text-brand"
        >
          Already have a workspace? Sign in
        </Link>
      )}
    </form>
  );
}
