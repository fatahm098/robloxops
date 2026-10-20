import { isDemoMode, readContext, withFallback } from "./data";

/**
 * In-app notification shape surfaced by the data seam. `readAt` is null while
 * unread; `projectId` is null for tenant-wide notifications.
 */
export interface Notification {
  id: string;
  projectId: string | null;
  kind: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

const NOTIFICATION_SELECT = "id,project_id,kind,title,body,read_at,created_at";

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Current tenant + user's notifications, newest first. Demo mode renders an
 * empty list; query errors fall back to empty in development.
 */
export async function getNotifications(limit = 30): Promise<Notification[]> {
  if (isDemoMode) return [];

  return withFallback<Notification[]>(
    "getNotifications",
    async () => {
      const { supabase, tenantId, userId } = await readContext();
      const { data, error } = await supabase
        .from("notifications")
        .select(NOTIFICATION_SELECT)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as unknown as NotificationRow[]).map(mapNotification);
    },
    () => [],
  );
}

/** Unread count for the current tenant + user. Demo mode returns 0. */
export async function getUnreadCount(): Promise<number> {
  if (isDemoMode) return 0;

  return withFallback<number>(
    "getUnreadCount",
    async () => {
      const { supabase, tenantId, userId } = await readContext();
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("read_at", null);

      if (error) throw error;

      return count ?? 0;
    },
    () => 0,
  );
}
