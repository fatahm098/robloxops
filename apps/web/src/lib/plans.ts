import type { BillingPlan, PlanId } from "./types";

export const PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    projectsPerMonth: 10,
    aiCreditsUsd: 500,
    discordServers: 1,
    features: [
      "10 commissions / month",
      "500 AI credits",
      "1 Discord server",
      "Automated QA basics",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    priceUsd: 49,
    projectsPerMonth: 40,
    aiCreditsUsd: 2500,
    discordServers: 3,
    features: [
      "40 commissions / month",
      "2,500 AI credits",
      "3 Discord servers",
      "Revision workflow + analytics",
      "Priority agent throughput",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 99,
    projectsPerMonth: 150,
    aiCreditsUsd: 10000,
    discordServers: 10,
    features: [
      "150 commissions / month",
      "10,000 AI credits",
      "10 Discord servers",
      "Custom brief templates",
      "Dedicated throughput + SLA",
    ],
  },
];

export function getPlan(id: PlanId): BillingPlan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

/** Stripe price ids are injected per environment so the same code spans stages. */
export function priceIdFor(id: PlanId): string | undefined {
  switch (id) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER;
    case "growth":
      return process.env.STRIPE_PRICE_GROWTH;
    case "pro":
      return process.env.STRIPE_PRICE_PRO;
    default:
      return undefined;
  }
}

export function planForPrice(priceId: string | undefined): PlanId | undefined {
  if (!priceId) return undefined;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return undefined;
}
