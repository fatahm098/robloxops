"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getBrowserClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 500;

/**
 * Subscribes to `postgres_changes` on the given tables and triggers a debounced
 * `router.refresh()` so server-rendered pages pick up new rows. No-op in demo
 * mode (no browser client) and unsubscribes on unmount.
 */
export function useRealtimeRefresh(tables: string[]): void {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const client = getBrowserClient();
    const tableList = key.split(",").filter((table) => table.length > 0);
    if (!client || tableList.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = client.channel("robloxops-realtime-refresh");
    for (const table of tableList) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [router, key]);
}

interface RealtimeRefreshProps {
  tables: string[];
}

/**
 * Mounts the realtime refresh subscription. Renders nothing; used once in the
 * dashboard shell so every page stays fresh.
 */
export function RealtimeRefresh({ tables }: RealtimeRefreshProps): null {
  useRealtimeRefresh(tables);
  return null;
}
