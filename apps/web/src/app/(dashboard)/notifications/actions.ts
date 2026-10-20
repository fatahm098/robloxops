"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { createClient, getAuthSession } from "@/lib/supabase/server";

export interface NotificationActionResult {
  ok: boolean;
  message: string;
}

export type { Notification } from "@/lib/notifications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateShell() {
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

/**
 * Marks a single notification read. Scoped to the JWT tenant + user so a
 * client-passed id can never touch another user's row.
 */
export async function markNotificationReadAction(id: string): Promise<NotificationActionResult> {
  if (isDemoMode) return { ok: true, message: "Marked as read." };

  const notificationId = String(id ?? "").trim();
  if (!UUID_PATTERN.test(notificationId)) {
    return { ok: false, message: "Unknown notification." };
  }

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("tenant_id", session.tenantId)
      .eq("user_id", session.userId)
      .is("read_at", null);

    if (error) throw error;

    revalidateShell();
    return { ok: true, message: "Marked as read." };
  } catch (error) {
    console.error("[notifications] mark read failed", error);
    return { ok: false, message: "Could not update the notification. Try again." };
  }
}

/** Form adapter for progressive-enhancement `<form action>` usage. */
export async function markNotificationReadFormAction(formData: FormData): Promise<void> {
  await markNotificationReadAction(String(formData.get("id") ?? ""));
}

/** Marks every unread notification for the current tenant + user as read. */
export async function markAllReadAction(): Promise<NotificationActionResult> {
  if (isDemoMode) return { ok: true, message: "All notifications marked as read." };

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) {
      return { ok: false, message: "Session expired. Sign in again." };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", session.tenantId)
      .eq("user_id", session.userId)
      .is("read_at", null);

    if (error) throw error;

    revalidateShell();
    return { ok: true, message: "All notifications marked as read." };
  } catch (error) {
    console.error("[notifications] mark all read failed", error);
    return { ok: false, message: "Could not update notifications. Try again." };
  }
}

/** Form adapter for progressive-enhancement `<form action>` usage. */
export async function markAllReadFormAction(): Promise<void> {
  await markAllReadAction();
}
