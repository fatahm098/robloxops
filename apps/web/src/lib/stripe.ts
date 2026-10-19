import Stripe from "stripe";

import { readTenantSecret } from "@/lib/secrets";

let cached: Stripe | null = null;

/**
 * Lazily-constructed Stripe client from the platform env key. Throws a clear
 * error when the secret key is missing so the failure surfaces at call time,
 * not at import time — this keeps the app buildable and runnable in demo mode
 * (no Stripe env).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

const tenantClients = new Map<string, Stripe>();

/**
 * Per-tenant Stripe client: uses the tenant's vaulted `STRIPE_SECRET_KEY` and
 * falls back to the platform env key. Callers must pass a tenant id taken from
 * the verified session, never from request input.
 *
 * The webhook signing secret stays platform-global (`STRIPE_WEBHOOK_SECRET`):
 * all tenants point their Stripe webhooks at the same endpoint, and the event
 * metadata carries `tenant_id`.
 */
export async function getStripeForTenant(tenantId: string): Promise<Stripe> {
  let tenantKey: string | null = null;

  try {
    tenantKey = await readTenantSecret(tenantId, "STRIPE_SECRET_KEY");
  } catch (error) {
    console.error("[stripe] tenant secret lookup failed", error);
  }

  const key = tenantKey ?? process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured for this tenant.");
  }

  const cacheKey = tenantKey ? `tenant:${tenantId}:${key.slice(-8)}` : "env";
  const existing = tenantClients.get(cacheKey);
  if (existing) return existing;

  const client = new Stripe(key);
  tenantClients.set(cacheKey, client);
  return client;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const STRIPE_READY = Boolean(process.env.STRIPE_SECRET_KEY);
