"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Receipt } from "lucide-react";

import {
  createProjectInvoice,
  markProjectInvoicePaid,
} from "@/app/(dashboard)/projects/actions";
import type { Invoice, InvoiceStatus } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const statusTone: Record<InvoiceStatus, string> = {
  paid: "border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] text-status-delivered",
  sent: "border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] text-status-briefing",
  draft: "border-line-strong bg-surface-2 text-ink-muted",
  void: "border-danger/40 bg-[rgba(162,26,36,0.15)] text-danger-soft",
};

function formatUsd(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatRobux(value: number | null): string {
  if (value === null) return "-";
  return `${value.toLocaleString("en-US")} R$`;
}

function formatRate(value: number | null): string {
  if (value === null) return "-";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} R$/USD`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface InvoicePanelProps {
  projectId: string;
  invoices: Invoice[];
  defaultRate: number;
  defaultAmountRobux?: number;
  demoMode?: boolean;
}

export function InvoicePanel({
  projectId,
  invoices,
  defaultRate,
  defaultAmountRobux,
  demoMode = false,
}: InvoicePanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"create" | "paid" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);

  const latest = invoices[0];
  const showForm = !latest || latest.status === "void";
  const canMarkPaid = Boolean(latest) && latest.status !== "paid" && latest.status !== "void";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy("create");
    setMessage(null);

    const result = await createProjectInvoice(projectId, formData);
    setMessageOk(result.ok);
    setMessage(result.message);
    setBusy(null);

    if (result.ok) router.refresh();
  }

  async function markPaid() {
    if (!latest) return;
    setBusy("paid");
    setMessage(null);

    const result = await markProjectInvoicePaid(latest.id, projectId);
    setMessageOk(result.ok);
    setMessage(result.message);
    setBusy(null);

    if (result.ok) router.refresh();
  }

  return (
    <section aria-labelledby="invoice-heading" className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h2 id="invoice-heading" className="text-headline-sm text-ink">
            Invoice
          </h2>
        </div>
        {latest ? (
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-sm border px-2 font-mono text-label-sm uppercase",
              statusTone[latest.status],
            )}
          >
            {latest.status}
          </span>
        ) : (
          <span className="meta shrink-0">Not generated</span>
        )}
      </div>

      {latest ? (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-label-md text-ink">{latest.number}</p>
            <p className="tabular text-headline-sm text-ink">{formatUsd(latest.amountUsd)}</p>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <dt className="meta text-[9px]">Robux</dt>
              <dd className="mt-1 tabular text-ink">{formatRobux(latest.amountRobux)}</dd>
            </div>
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <dt className="meta text-[9px]">Rate</dt>
              <dd className="mt-1 tabular text-ink">{formatRate(latest.rateRobuxPerUsd)}</dd>
            </div>
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <dt className="meta text-[9px]">Issued</dt>
              <dd className="mt-1 tabular text-ink">{formatDate(latest.issuedAt)}</dd>
            </div>
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <dt className="meta text-[9px]">Paid</dt>
              <dd className="mt-1 tabular text-ink">{formatDate(latest.paidAt)}</dd>
            </div>
          </dl>

          {canMarkPaid ? (
            <button
              type="button"
              disabled={demoMode || busy !== null}
              onClick={markPaid}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-brand bg-brand px-4 text-body-md font-semibold text-[#020617] transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "paid" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              Mark Paid
            </button>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className={cn("p-4", latest ? "border-t border-line" : "")}
        >
          <p className="meta mb-3">Generate Invoice</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="meta text-[9px]">Rate (R$ per USD)</span>
              <input
                type="number"
                name="rate_robux_per_usd"
                min="0.01"
                step="0.01"
                defaultValue={defaultRate}
                required
                className="mt-1.5 h-10 w-full rounded border border-line bg-canvas px-3 font-mono text-[12px] text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="meta text-[9px]">Amount Robux (optional)</span>
              <input
                type="number"
                name="amount_robux"
                min="1"
                step="1"
                defaultValue={defaultAmountRobux}
                placeholder="Project default"
                className="mt-1.5 h-10 w-full rounded border border-line bg-canvas px-3 font-mono text-[12px] text-ink outline-none focus:border-brand"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={demoMode || busy !== null}
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded border border-line-strong bg-transparent px-4 text-body-md font-semibold text-ink transition-colors hover:border-brand hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "create" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Receipt className="h-4 w-4" aria-hidden="true" />
            )}
            Generate Invoice
          </button>
        </form>
      ) : null}

      {message ? (
        <p
          className={cn(
            "border-t border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em]",
            messageOk ? "text-status-delivered" : "text-danger-soft",
          )}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
