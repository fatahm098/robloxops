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
