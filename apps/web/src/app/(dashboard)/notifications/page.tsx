import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  FileText,
  Home,
  MessageSquare,
  Repeat2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { getNotifications, getUnreadCount, type Notification } from "@/lib/notifications";
import { cn, relativeTime } from "@/lib/utils";

import {
  markAllReadFormAction,
  markNotificationReadFormAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Notifications — RobloxOps",
};

function iconForKind(kind: string): LucideIcon {
  const value = kind.toLowerCase();
  if (value.includes("assign")) return UserPlus;
  if (value.includes("approv") || value.includes("qa")) return CheckCheck;
  if (value.includes("revision")) return Repeat2;
  if (value.includes("report") || value.includes("deliver")) return FileText;
  if (value.includes("follow") || value.includes("message") || value.includes("discord")) {
    return MessageSquare;
  }
  if (value.includes("task") || value.includes("brief")) return ClipboardList;
  return Bell;
}

function NotificationRow({ notification }: { notification: Notification }) {
  const Icon = iconForKind(notification.kind);
  const unread = notification.readAt === null;

  return (
    <li
      className={cn(
        "flex gap-3 border-b border-line px-4 py-3 last:border-b-0",
        unread ? "bg-surface-1" : "bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded border",
          unread
            ? "border-brand/40 bg-brand/15 text-brand"
            : "border-line-strong bg-surface-2 text-ink-dim",
        )}
        aria-hidden="true"
      >
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-[13px] leading-snug",
              unread ? "font-medium text-ink" : "text-ink-muted",
            )}
          >
            {notification.title}
          </p>
          <span className="tabular shrink-0 font-mono text-[10px] text-ink-dim">
            {relativeTime(notification.createdAt)}
          </span>
        </div>

        {notification.body ? (
          <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{notification.body}</p>
        ) : null}

        <div className="mt-1.5 flex items-center gap-2">
          {notification.projectId ? (
            <Link
              href={`/projects/${notification.projectId}`}
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-brand transition-colors hover:text-brand-bright"
            >
              View project
            </Link>
          ) : null}

          {unread ? (
            <form action={markNotificationReadFormAction}>
              <input type="hidden" name="id" value={notification.id} />
              <button
                type="submit"
                className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim transition-colors hover:text-ink"
              >
                Mark read
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function NotificationsPage() {
  const [notifications, unread] = await Promise.all([getNotifications(), getUnreadCount()]);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="meta flex items-center gap-2">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href="/" className="transition-colors hover:text-ink">
          ROBLOX-OPS
        </Link>
        <span className="text-line-muted">/</span>
        <span className="text-ink-muted">NOTIFICATIONS</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline-xl leading-tight text-ink">Notifications</h1>
          <p className="text-body-md text-ink-muted">
            Designer assignments, approval requests and delivery updates for your account.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded border border-line bg-surface-1 px-3 py-1.5 text-center">
            <div className="tabular font-mono text-[15px] font-semibold leading-tight text-ink">
              {unread}
            </div>
            <div className="meta text-[9px] leading-tight">UNREAD</div>
          </div>

          <form action={markAllReadFormAction}>
            <button
              type="submit"
              disabled={unread === 0}
              className="inline-flex h-11 items-center gap-2 rounded border border-line-strong px-4 text-[13px] font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Mark all read
            </button>
          </form>
        </div>
      </header>

      {notifications.length === 0 ? (
        <div className="rounded border border-line bg-canvas px-6 py-16 text-center">
          <Bell className="mx-auto h-6 w-6 text-ink-dim" aria-hidden="true" />
          <p className="mt-2 text-headline-sm text-ink">You&apos;re all caught up</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
            Assignment and approval notifications appear here
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded border border-line bg-canvas">
          <ul>
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
