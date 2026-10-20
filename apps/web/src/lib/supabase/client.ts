"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseBrowserClient = SupabaseClient;

/**
 * Browser Supabase client. Safe to call from Client Components.
 * Throws when the public env vars are absent so misconfiguration fails loudly
 * instead of silently producing an unauthenticated client.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(url, anonKey);
}

let browserClient: SupabaseBrowserClient | null = null;

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Returns a singleton browser client, or `null` in demo mode (no Supabase env).
 * Realtime callers use the null to skip subscriptions instead of crashing.
 */
export function getBrowserClient(): SupabaseBrowserClient | null {
  if (!isBrowserSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
