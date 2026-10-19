import type { Metadata } from "next";
import Link from "next/link";
import { Download, Home, Search } from "lucide-react";

import { CustomerStats } from "@/components/customers/customer-stats";
import { CustomersTable } from "@/components/customers/customers-table";
import { listCustomers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Client CRM — RobloxOps",
};

interface CustomersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const raw = params.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;

  const [customers, all] = await Promise.all([listCustomers(q), listCustomers()]);
  const active = all.filter((customer) => customer.state === "active").length;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">CLIENT CRM</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Client CRM</h1>
          <p className="text-body-md text-ink-muted">
            Every customer the intake agent has qualified, with lifetime value and order history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
              {all.length}
            </div>
            <div className="meta text-[9px] leading-tight">CLIENTS · {active} ACTIVE</div>
          </div>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded border border-line-strong bg-surface-2 px-4 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-surface-3"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </header>

      <CustomerStats customers={all} />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[240px]">
          <span className="sr-only">Search clients</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search handle, display name or tier…"
            className="h-11 w-full rounded border border-line-strong bg-surface-1 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-dim focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded border border-line-strong px-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          Search
        </button>
        {q ? (
          <Link
            href="/customers"
            className="inline-flex h-11 items-center px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim hover:text-ink"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <CustomersTable customers={customers} total={all.length} />
    </div>
  );
}
