import type { ProjectStatus, ProjectType, QaStatus, TaskStatus } from "./types";

export interface StatusMeta {
  label: string;
  short: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export const statusMeta: Record<ProjectStatus, StatusMeta> = {
  intake: {
    label: "Intake",
    short: "Intake",
    text: "text-status-intake",
    bg: "bg-[rgba(59,130,246,0.15)]",
    border: "border-[rgba(96,165,250,0.3)]",
    dot: "bg-status-intake",
  },
  briefing: {
    label: "Briefing",
    short: "Brief",
    text: "text-status-briefing",
    bg: "bg-[rgba(245,158,11,0.15)]",
    border: "border-[rgba(251,191,36,0.3)]",
    dot: "bg-status-briefing",
  },
  brief_review: {
    label: "Brief Review",
    short: "Brief Review",
    text: "text-status-briefing",
    bg: "bg-[rgba(245,158,11,0.15)]",
    border: "border-[rgba(251,191,36,0.3)]",
    dot: "bg-status-briefing",
  },
  in_design: {
    label: "In Design",
    short: "In Design",
    text: "text-status-design",
    bg: "bg-[rgba(168,85,247,0.15)]",
    border: "border-[rgba(192,132,252,0.3)]",
    dot: "bg-status-design",
  },
  qa_check: {
    label: "QA Check",
    short: "QA Check",
    text: "text-status-qa",
    bg: "bg-[rgba(99,102,241,0.15)]",
    border: "border-[rgba(129,140,248,0.3)]",
    dot: "bg-status-qa",
  },
  customer_review: {
    label: "Customer Review",
    short: "Cust. Review",
    text: "text-status-review",
    bg: "bg-[rgba(244,63,94,0.15)]",
    border: "border-[rgba(251,113,133,0.3)]",
    dot: "bg-status-review",
  },
  revision: {
    label: "Revision",
    short: "Revision",
    text: "text-status-review",
    bg: "bg-[rgba(244,63,94,0.15)]",
    border: "border-[rgba(251,113,133,0.3)]",
    dot: "bg-status-review",
  },
  approved: {
    label: "Approved",
    short: "Approved",
    text: "text-status-delivered",
    bg: "bg-[rgba(16,185,129,0.15)]",
    border: "border-[rgba(52,211,153,0.3)]",
    dot: "bg-status-delivered",
  },
  delivered: {
    label: "Delivered",
    short: "Delivered",
    text: "text-status-delivered",
    bg: "bg-[rgba(16,185,129,0.15)]",
    border: "border-[rgba(52,211,153,0.3)]",
    dot: "bg-status-delivered",
  },
  cancelled: {
    label: "Cancelled",
    short: "Cancelled",
    text: "text-status-cancelled",
    bg: "bg-[rgba(100,116,139,0.2)]",
    border: "border-[rgba(148,163,184,0.3)]",
    dot: "bg-status-cancelled",
  },
  on_hold: {
    label: "On Hold",
    short: "On Hold",
    text: "text-ink-muted",
    bg: "bg-[rgba(100,116,139,0.2)]",
    border: "border-[rgba(148,163,184,0.3)]",
    dot: "bg-ink-muted",
  },
};

export const projectTypeLabel: Record<ProjectType, string> = {
  clothing: "Clothing",
  accessory: "Accessory",
  avatar_item: "Avatar Item",
  game_asset: "Game Asset",
  other: "Other",
};

export const qaMeta: Record<QaStatus, { label: string; text: string }> = {
  pending: { label: "Pending", text: "text-status-briefing" },
  passed: { label: "Passed", text: "text-status-delivered" },
  failed: { label: "Failed", text: "text-danger-bright" },
  skipped: { label: "Skipped", text: "text-ink-dim" },
};

export const taskStatusMeta: Record<TaskStatus, { label: string; text: string; bg: string }> = {
  pending: { label: "Pending", text: "text-status-briefing", bg: "bg-[rgba(245,158,11,0.12)]" },
  in_progress: { label: "In Progress", text: "text-status-design", bg: "bg-[rgba(168,85,247,0.12)]" },
  done: { label: "Done", text: "text-status-delivered", bg: "bg-[rgba(16,185,129,0.12)]" },
  blocked: { label: "Blocked", text: "text-danger-bright", bg: "bg-[rgba(239,68,68,0.12)]" },
};
