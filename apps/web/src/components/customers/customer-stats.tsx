import { Users, Repeat2, Wallet, Activity } from "lucide-react";

import type { CustomerSummary } from "@/lib/types";
import { formatUsd } from "@/lib/utils";

interface CustomerStatsProps {
  customers: CustomerSummary[];
}

export function CustomerStats({ customers }: CustomerStatsProps) {
  const active = customers.filter((customer) => customer.state === "active").length;
  const repeat = customers.filter((customer) => (customer.orderCount ?? 0) > 1).length;
  const revenue = customers.reduce((sum, customer) => sum + customer.totalSpentUsd, 0);
  const repeatRate = customers.length ? Math.round((repeat / customers.length) * 100) : 0;

  const cards = [
    { label: "Total clients", value: String(customers.length), note: "all time", icon: Users },
    { label: "Active this month", value: String(active), note: "with open projects", icon: Activity },
    { label: "Repeat rate", value: `${repeatRate}%`, note: `${repeat} returning`, icon: Repeat2 },
    { label: "Lifetime revenue", value: formatUsd(revenue), note: "paid commissions", icon: Wallet },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="panel px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <span className="meta">{card.label}</span>
            <card.icon className="h-4 w-4 text-ink-dim" aria-hidden="true" />
          </div>
          <div className="tabular mt-2 text-[26px] font-semibold leading-none text-ink">
            {card.value}
          </div>
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            {card.note}
          </div>
        </div>
      ))}
    </div>
  );
}
