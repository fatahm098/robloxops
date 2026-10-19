"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

export function ManageBillingButton({ demoMode }: { demoMode: boolean }) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    if (demoMode) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPortal}
      disabled={loading || demoMode}
      className="inline-flex h-11 items-center gap-2 rounded border border-line-strong px-4 text-[13px] text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <CreditCard className="h-4 w-4" aria-hidden="true" />
      )}
      Manage payment method
    </button>
  );
}
