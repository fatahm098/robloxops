import type {
  Brief,
  BriefSpec,
  ConversationMessage,
  Customer,
  Deliverable,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  ProjectType,
  PaymentStatus,
  QaStatus,
  Task,
  TaskStatus,
  TeamMember,
  TimelineEvent,
} from "../types";

/** Column lists shared by the data layer and the tRPC routers. */
export const PROJECT_SELECT = [
  "id",
  "tenant_id",
  "reference_code",
  "title",
  "status",
  "project_type",
  "deadline",
  "price_usd",
  "price_robux",
  "payment_status",
  "updated_at",
  "created_at",
  "discord_thread_id",
  "customers(id,display_name,discord_username,discord_user_id,total_projects)",
  "users(id,display_name,email,role)",
  "briefs(raw_conversation_summary,structured_data,completeness_score,approved_by_designer)",
  "deliverables(id,version,file_path,file_type,file_size_bytes,is_final,qa_status,qa_report,created_at)",
].join(",");

export const CONVERSATION_SELECT =
  "id,created_at,author_discord_id,direction,content,sent_by_agent,agent_id,customers(display_name,discord_username)";

export const AUDIT_SELECT =
  "id,created_at,agent_name,action,entity_type,entity_id,input_summary,output_summary,model_used,tokens_in,tokens_out,cost_usd,duration_ms,status,error_message";

export const TASK_SELECT =
  "id,project_id,title,status,priority,due_at,assigned_to,projects(reference_code),users(id,display_name,email,role)";

export const PROJECT_STATUSES = [
  "intake",
  "briefing",
  "brief_review",
  "in_design",
  "qa_check",
  "customer_review",
  "revision",
  "approved",
  "delivered",
  "cancelled",
  "on_hold",
] as const;

export const TASK_STATUSES = ["pending", "in_progress", "done", "blocked"] as const;

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  clothing: "Clothing",
  accessory: "Accessory",
  avatar_item: "Avatar Item",
  game_asset: "Game Asset",
  other: "Other",
};

const UNKNOWN_CUSTOMER: Customer = {
  id: "unknown",
  displayName: "Unknown customer",
  discordUsername: "unknown",
  discordId: "",
};

export interface CustomerRow {
  id: string;
  display_name: string | null;
  discord_username: string | null;
  discord_user_id: string;
  total_projects: number | null;
}

export interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
}

export interface BriefRow {
  raw_conversation_summary: string | null;
  structured_data: unknown;
  completeness_score: number | null;
  approved_by_designer: boolean | null;
}

export interface DeliverableRow {
  id: string;
  version: number | null;
  file_path: string;
  file_type: string | null;
  file_size_bytes: number | string | null;
  is_final: boolean | null;
  qa_status: string | null;
  qa_report: unknown;
  created_at: string | null;
}

export interface ProjectRow {
  id: string;
  tenant_id: string;
  reference_code: string;
  title: string | null;
  status: string;
  project_type: string | null;
  deadline: string | null;
  price_usd: number | string | null;
  price_robux: number | string | null;
  payment_status: string | null;
  updated_at: string | null;
  created_at: string | null;
  discord_thread_id: string | null;
  customers?: CustomerRow | CustomerRow[] | null;
  users?: UserRow | UserRow[] | null;
  briefs?: BriefRow[] | null;
  deliverables?: DeliverableRow[] | null;
}

export interface ConversationRow {
  id: string;
  created_at: string;
  author_discord_id: string | null;
  direction: string;
  content: string;
  sent_by_agent: boolean | null;
  agent_id: string | null;
  customers?: CustomerRow | CustomerRow[] | null;
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  agent_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  input_summary: string | null;
  output_summary: string | null;
  model_used: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | string | null;
  duration_ms: number | null;
  status: string | null;
  error_message: string | null;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  priority: number | null;
  due_at: string | null;
  assigned_to: string | null;
  projects?: { reference_code: string | null } | { reference_code: string | null }[] | null;
  users?: UserRow | UserRow[] | null;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  discord_guild_id: string | null;
  settings: unknown;
}

export interface TenantView {
  name: string;
  slug: string;
  plan: "starter" | "growth" | "pro";
  discordGuild: string;
  agentsActive: number;
  errorCount: number;
}

export interface TenantSettingsView {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "growth" | "pro";
  discordGuildId: string | null;
  settings: Record<string, unknown>;
  aiPaused: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  agentName: string;
  action: string;
  entityType?: string;
  entityId?: string;
  inputSummary?: string;
  outputSummary?: string;
  modelUsed?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  status?: "success" | "failure" | "escalated";
  errorMessage?: string;
}

/** Narrow unknown JSON to a plain object. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function toProjectStatus(value: string | null | undefined): ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value)
    ? (value as ProjectStatus)
    : "intake";
}

export function toTaskStatus(value: string | null | undefined): TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as TaskStatus)
    : "pending";
}

function toProjectType(value: string | null | undefined): ProjectType {
  switch (value) {
    case "clothing":
    case "accessory":
    case "avatar_item":
    case "game_asset":
      return value;
    default:
      return "other";
  }
}

function toPaymentStatus(value: string | null | undefined): PaymentStatus {
  switch (value) {
    case "partial":
    case "paid":
    case "refunded":
      return value;
    default:
      return "pending";
  }
}

function toQaStatus(value: string | null | undefined): QaStatus {
  switch (value) {
    case "passed":
    case "failed":
    case "skipped":
      return value;
    default:
      return "pending";
  }
}

function toPlan(value: string | null | undefined): "starter" | "growth" | "pro" {
  switch (value) {
    case "growth":
    case "pro":
      return value;
    default:
      return "starter";
  }
}

function toRole(value: string | null | undefined): TeamMember["role"] {
  switch (value) {
    case "owner":
    case "manager":
    case "agent":
      return value;
    default:
      return "designer";
  }
}

export function initialsOf(name: string): string {
  const initials = name
    .replace(/[@_.]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "??";
}

function formatDeadlineLabel(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBytes(value: number | null): string | undefined {
  if (value === null || value <= 0) return undefined;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function humanizeAction(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Activity";
}

export function mapCustomer(row: CustomerRow): Customer {
  const displayName =
    asString(row.display_name) ??
    (asString(row.discord_username) ? `@${row.discord_username}` : undefined) ??
    "Unknown customer";

  return {
    id: row.id,
    displayName,
    discordUsername: row.discord_username ?? "",
    discordId: row.discord_user_id,
    orderCount: asNumber(row.total_projects) ?? undefined,
  };
}

export function mapTeamMember(row: UserRow): TeamMember {
  const name = asString(row.display_name) ?? asString(row.email) ?? "Team member";
  return {
    id: row.id,
    name,
    initials: initialsOf(name),
    role: toRole(row.role),
  };
}

export function mapBrief(row: BriefRow | null): Brief {
  if (!row) {
    return {
      summary: "No brief captured yet.",
      completeness: 0,
      approvedByDesigner: false,
      specs: [],
      palette: [],
      references: [],
      directives: "",
    };
  }

  const structured = asRecord(row.structured_data);
  const specs: BriefSpec[] = [];

  for (const entry of asArray(structured.specs)) {
    const spec = asRecord(entry);
    const label = asString(spec.label);
    const value = asString(spec.value);
    if (label && value) specs.push({ label, value, note: asString(spec.note) });
  }

  const knownFields: Array<[string, string]> = [
    ["style", "Style"],
    ["colors", "Colors"],
    ["character", "Character"],
    ["resolution", "Resolution"],
    ["special_requests", "Special Requests"],
  ];

  for (const [key, label] of knownFields) {
    const raw = structured[key];
    const value = Array.isArray(raw)
      ? raw.map(asString).filter((item): item is string => Boolean(item)).join(", ")
      : asString(raw);
    if (value) specs.push({ label, value });
  }

  const palette: Brief["palette"] = [];
  for (const entry of asArray(structured.palette)) {
    const swatch = asRecord(entry);
    const hex = asString(swatch.hex);
    if (hex) palette.push({ label: asString(swatch.label) ?? hex, hex });
  }
  if (palette.length === 0) {
    for (const color of asArray(structured.colors)) {
      const hex = asString(color);
      if (hex?.startsWith("#")) palette.push({ label: hex, hex });
    }
  }

  const references: Brief["references"] = [];
  asArray(structured.references).forEach((entry, index) => {
    const ref = asRecord(entry);
    const label = asString(ref.label) ?? asString(entry);
    if (!label) return;
    references.push({
      id: asString(ref.id) ?? `ref_${index + 1}`,
      label,
      url: asString(ref.url),
    });
  });

  return {
    summary: asString(row.raw_conversation_summary) ?? "Brief extracted from the Discord intake thread.",
    completeness: asNumber(row.completeness_score) ?? 0,
    approvedByDesigner: row.approved_by_designer === true,
    specs,
    palette,
    references,
    directives: asString(structured.directives) ?? asString(structured.special_requests) ?? "",
  };
}

export function mapDeliverable(row: DeliverableRow): Deliverable {
  const report = asRecord(row.qa_report);
  const checks: NonNullable<Deliverable["qaChecks"]> = [];

  for (const entry of asArray(report.checks)) {
    const check = asRecord(entry);
    const label = asString(check.label);
    const value = asString(check.value);
    if (label && value) {
      checks.push({ label, value, passed: check.passed === true });
    }
  }

  const name = row.file_path.split("/").pop() ?? row.file_path;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";

  return {
    id: row.id,
    name,
    fileType: (asString(row.file_type) ?? asString(extension) ?? "file").toUpperCase(),
    version: asNumber(row.version) ?? 1,
    sizeLabel: formatBytes(asNumber(row.file_size_bytes)) ?? "—",
    uploadedBy: "Studio team",
    uploadedAt: row.created_at ?? new Date().toISOString(),
    qaStatus: toQaStatus(row.qa_status),
    qaChecks: checks.length > 0 ? checks : undefined,
    isFinal: row.is_final === true,
  };
}

export function mapProjectSummary(row: ProjectRow): ProjectSummary {
  const customerRow = first(row.customers);
  const assigneeRow = first(row.users);
  const briefRow = first(row.briefs);
  const structured = asRecord(briefRow?.structured_data);
  const projectType = toProjectType(row.project_type);

  const deliverables = [...(row.deliverables ?? [])].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  const latestQaScore = asNumber(asRecord(deliverables[0]?.qa_report).score);

  return {
    id: row.id,
    reference: row.reference_code,
    title: row.title ?? row.reference_code,
    status: toProjectStatus(row.status),
    projectType,
    assetDetail: asString(structured.asset_detail) ?? PROJECT_TYPE_LABELS[projectType],
    specLine: asString(structured.spec_line) ?? row.title ?? "",
    customer: customerRow ? mapCustomer(customerRow) : UNKNOWN_CUSTOMER,
    assignee: assigneeRow ? mapTeamMember(assigneeRow) : undefined,
    deadline: row.deadline ?? undefined,
    deadlineLabel: formatDeadlineLabel(row.deadline),
    paymentStatus: toPaymentStatus(row.payment_status),
    priceUsd: asNumber(row.price_usd) ?? undefined,
    priceRobux: asNumber(row.price_robux) ?? undefined,
    qaScore: latestQaScore ?? undefined,
    qaScoreMax: latestQaScore === null ? undefined : 100,
    discordTicket: row.discord_thread_id ?? undefined,
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export function mapConversation(row: ConversationRow): ConversationMessage {
  const customerRow = first(row.customers);
  const sentByAgent = row.sent_by_agent === true;

  const author = sentByAgent
    ? asString(row.agent_id) ?? "AI Agent"
    : customerRow
      ? mapCustomer(customerRow).displayName
      : asString(row.author_discord_id)
        ? `@${row.author_discord_id}`
        : "Customer";

  return {
    id: row.id,
    at: row.created_at,
    author,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    content: row.content,
    agentName: sentByAgent ? asString(row.agent_id) ?? "agent" : undefined,
  };
}

export function mapAuditEntry(row: AuditLogRow): AuditEntry {
  const status =
    row.status === "success" || row.status === "failure" || row.status === "escalated"
      ? row.status
      : undefined;

  return {
    id: row.id,
    at: row.created_at,
    agentName: row.agent_name,
    action: row.action,
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
    inputSummary: row.input_summary ?? undefined,
    outputSummary: row.output_summary ?? undefined,
    modelUsed: row.model_used ?? undefined,
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    costUsd: asNumber(row.cost_usd) ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    status,
    errorMessage: row.error_message ?? undefined,
  };
}

export function mapProjectDetail(
  row: ProjectRow,
  conversations: ConversationRow[],
  auditRows: AuditLogRow[],
): ProjectDetail {
  const summary = mapProjectSummary(row);

  const timeline: TimelineEvent[] = auditRows
    .map((entry) => ({
      id: entry.id,
      at: entry.created_at,
      actor: entry.agent_name,
      title: humanizeAction(entry.action),
      description: entry.output_summary ?? entry.input_summary ?? undefined,
      kind: entry.agent_name.startsWith("human:") ? ("human" as const) : ("agent" as const),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

  if (timeline.length === 0) {
    timeline.push({
      id: `${row.id}_created`,
      at: row.created_at ?? summary.updatedAt,
      actor: "Discord bot",
      title: "Commission created",
      description: `Order ${row.reference_code} captured from Discord.`,
      kind: "system",
    });
  }

  return {
    ...summary,
    brief: mapBrief(first(row.briefs)),
    deliverables: (row.deliverables ?? [])
      .map(mapDeliverable)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)),
    timeline,
    conversation: conversations.map(mapConversation),
  };
}

export function mapTask(row: TaskRow): Task {
  const assigneeRow = first(row.users);
  const projectRow = first(row.projects);

  return {
    id: row.id,
    projectId: row.project_id,
    reference: projectRow?.reference_code ?? "",
    title: row.title,
    status: toTaskStatus(row.status),
    priority: asNumber(row.priority) ?? 0,
    assignee: assigneeRow ? mapTeamMember(assigneeRow) : undefined,
    dueLabel: formatDeadlineLabel(row.due_at),
  };
}

export function mapTenant(row: TenantRow): TenantView {
  const settings = asRecord(row.settings);
  return {
    name: row.name,
    slug: row.slug,
    plan: toPlan(row.plan_id),
    discordGuild: row.discord_guild_id ?? "Not connected",
    agentsActive: asNumber(settings.agents_active) ?? 0,
    errorCount: asNumber(settings.error_count) ?? 0,
  };
}

export function mapTenantSettings(row: TenantRow): TenantSettingsView {
  const settings = asRecord(row.settings);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: toPlan(row.plan_id),
    discordGuildId: row.discord_guild_id,
    settings,
    aiPaused: settings.ai_paused === true,
  };
}
