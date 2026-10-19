import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

import { isDemoMode, listProjects } from "@/lib/data";
import { getBillingSummary } from "@/lib/insights";
import { PLANS, getPlan } from "@/lib/plans";
import { ManageBillingButton } from "@/components/billing/billing-actions";
import { PlanCard } from "@/components/billing/plan-card";
import { UsageMeter } from "@/components/billing/usage-meter";

export const metadata: Metadata = { title: "Billing & Plan — RobloxOps" };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export default async function BillingPage() {
  const [summary, projects] = await Promise.all([getBillingSummary(), listProjects()]);
  const plan = getPlan(summary.planId);
  const usedProjects = projects.length;
  const usedCredits = summary.aiCreditsUsed;
  const creditsLimit = summary.aiCreditsLimit ?? plan.aiCreditsUsd;
  const renewalLabel = formatDate(summary.currentPeriodEnd);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">BILLING &amp; PLAN</span>
      </nav>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Billing &amp; Plan</h1>
          <p className="text-body-md text-ink-muted">
            Manage your subscription, usage and payment method.
          </p>
        </div>
        <ManageBillingButton demoMode={isDemoMode} />
      </header>

      {isDemoMode ? (
        <div className="flex items-start gap-2 rounded border border-[rgba(251,191,36,0.3)] bg-[rgba(245,158,11,0.1)] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-briefing" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Demo mode: checkout and the billing portal are disabled without Stripe env vars.
            Add <code className="font-mono">STRIPE_SECRET_KEY</code> + price ids to enable.
          </p>
        </div>
      ) : null}

      <section className="panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="meta text-[10px]">Current plan</p>
          <p className="mt-1 text-headline-lg text-ink">{plan.name}</p>
          <p className="mt-0.5 font-mono text-[13px] text-ink-muted">
            ${plan.priceUsd}/mo ·{" "}
            {renewalLabel ? `renews ${renewalLabel}` : "renewal not scheduled"}
          </p>
        </div>
        <span className="inline-flex h-7 items-center rounded border border-[rgba(52,211,153,0.3)] bg-[rgba(16,185,129,0.15)] px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered">
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-status-delivered" />
          {summary.demo ? "Simulated" : "Active"}
        </span>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <UsageMeter label="Commissions" used={usedProjects} value={plan.projectsPerMonth} />
        <UsageMeter label="AI credits" used={usedCredits} value={creditsLimit} />
        <UsageMeter label="Discord servers" used={1} value={plan.discordServers} />
      </section>

      <section>
        <h2 className="meta mb-2">Plans</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {PLANS.map((option) => (
            <PlanCard
              key={option.id}
              plan={option}
              isCurrent={option.id === summary.planId}
              demoMode={isDemoMode}
            />
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-headline-sm text-ink">Invoices</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-ink-dim">
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.06em]">Date</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.06em]">Description</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.06em]">Amount</th>
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.06em]">Status</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              {summary.invoices.length === 0 ? (
                <tr className="border-b border-line/60">
                  <td colSpan={4} className="py-4 text-center text-ink-dim">
                    No invoices yet
                  </td>
                </tr>
              ) : (
                summary.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-line/60">
                    <td className="py-2 pr-4 font-mono text-ink">
                      {formatDate(invoice.date) ?? "—"}
                    </td>
                    <td className="py-2 pr-4">{invoice.description}</td>
                    <td className="py-2 pr-4 font-mono tabular">
                      {formatUsd(invoice.amountUsd)}
                    </td>
                    <td className="py-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-status-delivered">
                        {invoice.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
