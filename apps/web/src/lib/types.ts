import type { OutboundMessage } from "./outbound";

export type { OutboundMessage };

export type ProjectStatus =
  | "intake"
  | "briefing"
  | "brief_review"
  | "in_design"
  | "qa_check"
  | "customer_review"
  | "revision"
  | "approved"
  | "delivered"
  | "cancelled"
  | "on_hold";

export type ProjectType = "clothing" | "accessory" | "avatar_item" | "game_asset" | "other";

export type PaymentStatus = "pending" | "partial" | "paid" | "refunded";

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";

export type QaStatus = "pending" | "passed" | "failed" | "skipped";

export interface Customer {
  id: string;
  displayName: string;
  discordUsername: string;
  discordId: string;
  tier?: string;
  orderCount?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: "owner" | "manager" | "designer" | "agent";
  specialty?: string;
}

export interface ProjectSummary {
  id: string;
  reference: string;
  title: string;
  status: ProjectStatus;
  projectType: ProjectType;
  assetDetail: string;
  specLine: string;
  customer: Customer;
  assignee?: TeamMember;
  deadline?: string;
  deadlineLabel?: string;
  paymentStatus: PaymentStatus;
  priceUsd?: number;
  priceRobux?: number;
  qaScore?: number;
  qaScoreMax?: number;
  discordTicket?: string;
  updatedAt: string;
}

export interface BriefSpec {
  label: string;
  value: string;
  note?: string;
}

export interface Brief {
  summary: string;
  completeness: number;
  approvedByDesigner: boolean;
  specs: BriefSpec[];
  palette: { label: string; hex: string }[];
  references: { id: string; label: string; url?: string }[];
  directives: string;
}

export interface Deliverable {
  id: string;
  name: string;
  fileType: string;
  version: number;
  sizeLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  qaStatus: QaStatus;
  qaChecks?: { label: string; value: string; passed: boolean }[];
  isFinal: boolean;
  previewUrl?: string;
}

export type TimelineKind = "agent" | "human" | "system" | "client";

export interface TimelineEvent {
  id: string;
  at: string;
  actor: string;
  title: string;
  description?: string;
  kind: TimelineKind;
}

export interface ConversationMessage {
  id: string;
  at: string;
  author: string;
  direction: "inbound" | "outbound";
  content: string;
  agentName?: string;
}

export interface ProjectDetail extends ProjectSummary {
  brief: Brief;
  deliverables: Deliverable[];
  timeline: TimelineEvent[];
  conversation: ConversationMessage[];
}

/**
 * Project detail plus outbound approval / human-takeover state. Additive
 * extension of `ProjectDetail`; `getProjectDetail` returns this shape.
 */
export interface ProjectDetailWithOutbound extends ProjectDetail {
  humanTakeover: boolean;
  outboundPending: OutboundMessage[];
}

export interface OverviewStats {
  activeProjects: number;
  activeDelta: number;
  queueTasks: number;
  dueToday: number;
  newIntakes: number;
  scopedByAi: number;
  briefReview: number;
  revenueUsd: number;
  revenueRobux: number;
  revenueDelta: number;
  qaCheck: number;
  inDesign: number;
  highPriorityOpen: number;
}

export type StudioEventKind = "agent" | "human" | "billing" | "client";

export interface StudioEvent {
  id: string;
  at: string;
  actor: string;
  text: string;
  kind: StudioEventKind;
}

export interface TeamLoad {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  load: number;
  activeProjects: number;
}

export interface Task {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  status: TaskStatus;
  priority: number;
  assignee?: TeamMember;
  dueLabel?: string;
}

export interface ProjectFilters {
  status?: ProjectStatus | "all";
  search?: string;
}

/* ------------------------------------------------------------------ */
/* CRM, deliverables, revisions, billing, analytics, agents           */
/* ------------------------------------------------------------------ */

export type CustomerState = "active" | "idle" | "new";

export interface CustomerSummary extends Customer {
  activeProjects: number;
  totalSpentUsd: number;
  lastOrderAt: string;
  state: CustomerState;
}

export interface DeliverableRow {
  id: string;
  projectId: string;
  reference: string;
  projectTitle: string;
  name: string;
  fileType: string;
  sizeLabel: string;
  version: number;
  qaStatus: QaStatus;
  uploadedBy: string;
  uploadedAt: string;
  isFinal: boolean;
}

export type RevisionStatus = "open" | "in_progress" | "resolved" | "rejected";

export interface RevisionRequest {
  id: string;
  projectId: string;
  reference: string;
  projectTitle: string;
  requestedBy: string;
  reason: string;
  status: RevisionStatus;
  createdAt: string;
  resolvedAt?: string;
}

export type PlanId = "starter" | "growth" | "pro";

export interface BillingPlan {
  id: PlanId;
  name: string;
  priceUsd: number;
  projectsPerMonth: number;
  aiCreditsUsd: number;
  discordServers: number;
  features: string[];
}

export interface UsagePoint {
  label: string;
  projects: number;
  revenueUsd: number;
}

export type AgentState = "active" | "paused" | "error";

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  model: string;
  actions24h: number;
  costUsd: number;
  lastRunAt: string;
  description: string;
}

export type AuditStatus = "success" | "failure" | "escalated";

export interface AuditTableRow {
  id: string;
  time: string;
  date: string;
  agent: string;
  model: string;
  action: string;
  entity: string;
  entityHref?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  status: AuditStatus;
}
