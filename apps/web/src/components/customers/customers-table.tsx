import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";

import type { CustomerSummary } from "@/lib/types";
import { cn, formatUsd, initialsOf, relativeTime } from "@/lib/utils";

const STATE_STYLES: Record<CustomerSummary["state"], string> = {
  active: "bg-[rgba(16,185,129,0.15)] text-status-delivered border-[rgba(52,211,153,0.3)]",
  idle: "bg-[rgba(100,116,139,0.2)] text-status-cancelled border-[rgba(148,163,184,0.3)]",
  new: "bg-[rgba(59,130,246,0.15)] text-status-intake border-[rgba(96,165,250,0.3)]",
};

interface CustomersTableProps {
  customers: CustomerSummary[];
  total: number;
}

export function CustomersTable({ customers, total }: CustomersTableProps) {
  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded border border-line bg-canvas px-6 py-20 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-1">
          <SearchX className="h-5 w-5 text-ink-dim" aria-hidden="true" />
        </span>
        <p className="text-headline-sm text-ink">No clients match this search</p>
        <Link
          href="/customers"
          className="inline-flex h-9 items-center rounded border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-brand hover:text-brand"
        >
          Clear search
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-line bg-canvas">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
          <caption className="sr-only">Client CRM</caption>
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="h-11 border-b-2 border-line-strong bg-surface-1">
              <th scope="col" className="meta px-4 font-medium">Client</th>
              <th scope="col" className="meta px-3 font-medium">Discord ID</th>
              <th scope="col" className="meta px-3 font-medium">Orders</th>
              <th scope="col" className="meta px-3 font-medium">Lifetime Value</th>
              <th scope="col" className="meta px-3 font-medium">Last Order</th>
              <th scope="col" className="meta px-3 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.map((customer) => (
              <tr key={customer.id} className="group relative row-hover h-16">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-[10px] font-semibold text-brand"
                      aria-hidden="true"
                    >
                      {initialsOf(customer.displayName)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/projects?q=${encodeURIComponent(customer.discordUsername)}`}
                        className="block truncate text-[13px] font-medium text-ink after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                      >
                        {customer.displayName}
                      </Link>
                      <div className="truncate font-mono text-[10px] text-ink-dim">
                        {customer.tier ?? "Client"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-[11px] text-ink-muted">{customer.discordId}</td>
                <td className="tabular px-3 py-3 text-[13px] text-ink">{customer.orderCount ?? 0}</td>
                <td className="tabular px-3 py-3 font-mono text-[12px] text-brand">
                  {formatUsd(customer.totalSpentUsd)}
                </td>
                <td className="px-3 py-3 text-[12px] text-ink-muted">{relativeTime(customer.lastOrderAt)}</td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex h-[22px] items-center gap-1.5 rounded border px-2 font-mono text-[10px] uppercase tracking-[0.06em]",
                      STATE_STYLES[customer.state],
                    )}
                  >
                    {customer.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-surface-1 px-4 py-3 font-mono text-[11px] text-ink-dim">
        <span className="tabular">
          Showing {customers.length} of {total} clients
        </span>
        <span className="inline-flex items-center gap-1">
          Open project list
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
