"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Box,
  CloudUpload,
  CreditCard,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  PanelLeft,
  Repeat2,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { StudioStorage } from "./studio-storage";

type BadgeTone = "count" | "accent" | "live";

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  badge?: string;
  badgeTone?: BadgeTone;
}

const productionCore: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutGrid },
  { label: "Projects & Orders", href: "/projects", icon: FolderKanban, badgeTone: "count" },
  { label: "Task Queue", href: "/tasks", icon: ListChecks, badgeTone: "accent" },
  { label: "Upload & QA", href: "/deliverables", icon: CloudUpload },
  { label: "Revisions", href: "/revisions", icon: Repeat2 },
  { label: "Client CRM", href: "/customers", icon: Users },
  { label: "AI Ops & Agents", href: "/agents", icon: Bot, badge: "LIVE", badgeTone: "live" },
  { label: "Discord Comm", href: "/settings", icon: MessageSquare },
];

const configuration: NavItem[] = [
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Studio Settings", href: "/settings", icon: Settings },
  { label: "Billing & Plan", href: "/billing", icon: CreditCard },
  { label: "Audit Log", href: "/audit", icon: ScrollText },
];

function withLiveBadges(items: NavItem[], projectCount?: number, taskCount?: number): NavItem[] {
  return items.map((item) => {
    if (item.href === "/projects" && projectCount !== undefined) {
      return { ...item, badge: String(projectCount) };
    }
    if (item.href === "/tasks" && taskCount !== undefined) {
      return { ...item, badge: String(taskCount) };
    }
    return item;
  });
}

const badgeClasses: Record<BadgeTone, string> = {
  count: "border border-line-strong bg-surface-2 text-ink-muted",
  accent: "bg-brand text-canvas",
  live: "border border-line-strong bg-surface-2 text-ink-muted",
};

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const href = item.href;

  const inner = (
    <>
      <Icon
        size={16}
        strokeWidth={1.8}
        aria-hidden="true"
        className={cn("shrink-0", active ? "text-brand" : "text-ink-dim")}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            "inline-flex h-[17px] shrink-0 items-center rounded-[3px] px-1.5 font-mono text-[9px] font-medium leading-none tracking-[0.06em]",
            badgeClasses[item.badgeTone ?? "count"],
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );

  const base =
    "relative flex h-9 items-center gap-2.5 rounded px-2.5 text-[13px] transition-colors";

  if (!href) {
    return (
      <li>
        <span
          title="Coming soon"
          className={cn(base, "cursor-default text-ink-muted/70")}
        >
          {inner}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          base,
          active
            ? "bg-surface-2 text-ink before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:rounded-l-[1px] before:bg-brand"
            : "text-ink-muted hover:bg-surface-2/60 hover:text-ink",
        )}
      >
        {inner}
      </Link>
    </li>
  );
}

interface SidebarProps {
  projectCount?: number;
  taskCount?: number;
}

export function Sidebar({ projectCount, taskCount }: SidebarProps) {
  const pathname = usePathname();
  const navItems = withLiveBadges(productionCore, projectCount, taskCount);

  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-surface-1">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-brand text-canvas">
          <Box size={17} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 leading-none">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
              RobloxOps
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">OS</span>
          </div>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
            Studio Pipeline
          </p>
        </div>
        <PanelLeft size={15} className="shrink-0 text-ink-dim" aria-hidden="true" />
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          Production Core
        </p>
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(pathname, item.href)} />
          ))}
        </ul>

        <p className="px-2 pb-2 pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          Configuration
        </p>
        <ul className="space-y-0.5">
          {configuration.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(pathname, item.href)} />
          ))}
        </ul>
      </nav>

      <StudioStorage />
    </aside>
  );
}
