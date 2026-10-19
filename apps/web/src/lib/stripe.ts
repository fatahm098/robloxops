import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazily-constructed Stripe client. Throws a clear error when the secret key is
 * missing so the failure surfaces at call time, not at import time — this keeps
 * the app buildable and runnable in demo mode (no Stripe env).
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

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const STRIPE_READY = Boolean(process.env.STRIPE_SECRET_KEY);
