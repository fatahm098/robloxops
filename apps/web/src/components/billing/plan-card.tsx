"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import type { BillingPlan } from "@/lib/types";

export function PlanCard({
  plan,
  isCurrent,
  demoMode,
}: {
  plan: BillingPlan;
  isCurrent: boolean;
  demoMode: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    if (demoMode || isCurrent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={
        isCurrent
          ? "panel flex flex-col border-brand p-4"
          : "panel flex flex-col p-4"
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="text-headline-sm text-ink">{plan.name}</h3>
        {isCurrent ? (
          <span className="inline-flex h-[20px] items-center rounded border border-brand/40 bg-brand/10 px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-brand">
            Current
          </span>
        ) : null}
      </div>

      <p className="mt-1 font-mono text-[15px] text-ink">
        ${plan.priceUsd}
        <span className="text-[11px] text-ink-dim">/mo</span>
      </p>

      <ul className="mt-3 flex-1 space-y-1.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[12px] text-ink-muted">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-delivered" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={choose}
        disabled={loading || demoMode || isCurrent}
        className={
          isCurrent
            ? "mt-4 inline-flex h-10 cursor-default items-center justify-center rounded border border-line-strong px-4 text-[12px] text-ink-muted"
            : "mt-4 inline-flex h-10 items-center justify-center gap-2 rounded bg-brand px-4 text-[12px] font-semibold text-canvas transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {isCurrent ? "Active plan" : "Switch to this plan"}
      </button>

      {demoMode && !isCurrent ? (
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          Disabled in demo mode
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-danger-soft">{error}</p> : null}
    </div>
  );
}
