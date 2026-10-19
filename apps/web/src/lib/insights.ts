import { isDemoMode, readContext, withFallback } from "./data";
import { getPlan } from "./plans";
import {
  AUDIT_SELECT,
  asNumber,
  asRecord,
  asString,
  first,
  mapAuditEntry,
  mapCustomer,
  type AuditEntry,
  type AuditLogRow,
  type CustomerRow,
} from "./supabase/mappers";
import type { SupabaseServerClient } from "./supabase/server";
import type {
  AgentStatus,
  AuditTableRow,
  PlanId,
  ProjectStatus,
  RevisionRequest,
  RevisionStatus,
  UsagePoint,
} from "./types";

/**
 * Reporting surfaces (analytics, agent roster, audit log, revisions).
 *
 * Every function reads live Supabase data when credentials are configured and
 * falls back to the demo dataset otherwise, mirroring `src/lib/data.ts`.
 */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const THROUGHPUT_STAGES: { status: ProjectStatus; label: string }[] = [
  { status: "intake", label: "Intake" },
  { status: "briefing", label: "Briefing" },
  { status: "brief_review", label: "Brief Review" },
  { status: "in_design", label: "In Design" },
  { status: "qa_check", label: "QA Check" },
  { status: "customer_review", label: "Customer Review" },
  { status: "revision", label: "Revision" },
  { status: "approved", label: "Approved" },
  { status: "delivered", label: "Delivered" },
  { status: "on_hold", label: "On Hold" },
  { status: "cancelled", label: "Cancelled" },
];

function priceOf(value: number | string | null): number {
  return asNumber(value) ?? 0;
}

export const usageSeries: UsagePoint[] = [
  { label: "May", projects: 22, revenueUsd: 9200 },
  { label: "Jun", projects: 26, revenueUsd: 10800 },
  { label: "Jul", projects: 24, revenueUsd: 10150 },
  { label: "Aug", projects: 31, revenueUsd: 12400 },
  { label: "Sep", projects: 35, revenueUsd: 13600 },
  { label: "Oct", projects: 18, revenueUsd: 14850 },
];

export interface AnalyticsSummary {
  usage: UsagePoint[];
  revenueUsd: number;
  revenueDelta: number;
  projectsDelivered: number;
  avgTurnaroundDays: number;
  revisionRate: number;
  aiActions: number;
  humanEscalations: number;
  agentCostUsd: number;
  topClients: { name: string; projects: number; revenueUsd: number }[];
  throughput: { status: string; count: number }[];
}

const demoAnalytics: AnalyticsSummary = {
  usage: usageSeries,
  revenueUsd: 14850,
  revenueDelta: 22.4,
  projectsDelivered: 42,
  avgTurnaroundDays: 3.8,
  revisionRate: 14,
  aiActions: 1284,
  humanEscalations: 11,
  agentCostUsd: 6.42,
  topClients: [
    { name: "@StudioHyper", projects: 11, revenueUsd: 4620 },
    { name: "@KevRoblox", projects: 4, revenueUsd: 980 },
    { name: "@AeroGames", projects: 6, revenueUsd: 1840 },
    { name: "@ChloeUGC", projects: 5, revenueUsd: 1120 },
  ],
  throughput: [
    { status: "Intake", count: 1 },
    { status: "Briefing", count: 1 },
    { status: "In Design", count: 2 },
    { status: "QA Check", count: 1 },
    { status: "Customer Review", count: 1 },
    { status: "Revision", count: 1 },
    { status: "Delivered", count: 1 },
  ],
};

interface ProjectAggregateRow {
  customer_id: string;
  status: string | null;
  payment_status: string | null;
  price_usd: number | string | null;
  revision_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  if (isDemoMode) return demoAnalytics;

  return withFallback<AnalyticsSummary>(
    "getAnalytics",
    async () => {
      const { supabase, tenantId } = await readContext();
      const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = new Date(thirtyDaysAgoMs).toISOString();

      const [projectResult, auditResult, customerResult] = await Promise.all([
        supabase
          .from("projects")
          .select("customer_id,status,payment_status,price_usd,revision_count,created_at,updated_at")
          .eq("tenant_id", tenantId),
        supabase
          .from("agent_audit_log")
          .select("cost_usd,created_at,status")
          .eq("tenant_id", tenantId)
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("customers")
          .select("id,display_name,discord_username,discord_user_id,total_projects")
          .eq("tenant_id", tenantId),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (auditResult.error) throw auditResult.error;
      if (customerResult.error) throw customerResult.error;

      const projectRows = (projectResult.data ?? []) as unknown as ProjectAggregateRow[];
      const auditRows = (auditResult.data ?? []) as unknown as Array<{
        cost_usd: number | string | null;
        created_at: string;
        status: string | null;
      }>;
      const customerRows = (customerResult.data ?? []) as unknown as CustomerRow[];

      const delivered = projectRows.filter((project) => project.status === "delivered");
      const deliveredLast30 = delivered.filter((project) => {
        const at = project.updated_at ?? project.created_at;
        if (!at) return false;
        const ms = new Date(at).getTime();
        return Number.isFinite(ms) && ms >= thirtyDaysAgoMs;
      });

      const revenueUsd = projectRows.reduce(
        (total, project) =>
          project.payment_status === "paid" ? total + priceOf(project.price_usd) : total,
        0,
      );

      const turnaroundSamples = delivered
        .map((project) => {
          if (!project.created_at || !project.updated_at) return null;
          const ms =
            new Date(project.updated_at).getTime() - new Date(project.created_at).getTime();
          return Number.isFinite(ms) && ms >= 0 ? ms / 86_400_000 : null;
        })
        .filter((value): value is number => value !== null);

      const avgTurnaroundDays = turnaroundSamples.length
        ? Math.round(
            (turnaroundSamples.reduce((sum, value) => sum + value, 0) /
              turnaroundSamples.length) *
              10,
          ) / 10
        : 0;

      const revisionRate = delivered.length
        ? Math.round(
            (delivered.filter((project) => (project.revision_count ?? 0) > 0).length /
              delivered.length) *
              100,
          )
        : 0;

      const aiActions = auditRows.length;
      const humanEscalations = auditRows.filter((row) => row.status === "escalated").length;
      const agentCostUsd = auditRows.reduce(
        (total, row) => total + (asNumber(row.cost_usd) ?? 0),
        0,
      );

      // Six-month chart: bucket projects by creation month, summing paid revenue.
      const now = new Date();
      const buckets = Array.from({ length: 6 }, (_, offset) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
        return {
          label: MONTH_LABELS[date.getMonth()],
          year: date.getFullYear(),
          month: date.getMonth(),
          projects: 0,
          revenueUsd: 0,
        };
      });
      const bucketIndex = new Map(
        buckets.map((bucket, index) => [`${bucket.year}-${bucket.month}`, index]),
      );

      for (const project of projectRows) {
        if (!project.created_at) continue;
        const created = new Date(project.created_at);
        if (Number.isNaN(created.getTime())) continue;
        const index = bucketIndex.get(`${created.getFullYear()}-${created.getMonth()}`);
        if (index === undefined) continue;
        buckets[index].projects += 1;
        if (project.payment_status === "paid") {
          buckets[index].revenueUsd += priceOf(project.price_usd);
        }
      }

      const usage: UsagePoint[] = buckets.map((bucket) => ({
        label: bucket.label,
        projects: bucket.projects,
        revenueUsd: bucket.revenueUsd,
      }));

      const currentMonth = buckets[5]?.revenueUsd ?? 0;
      const previousMonth = buckets[4]?.revenueUsd ?? 0;
      const revenueDelta =
        previousMonth > 0
          ? Math.round(((currentMonth - previousMonth) / previousMonth) * 1000) / 10
          : 0;

      const throughput = THROUGHPUT_STAGES.map((stage) => ({
        status: stage.label,
        count: projectRows.filter((project) => project.status === stage.status).length,
      })).filter((stage) => stage.count > 0);

      const customerNames = new Map(
        customerRows.map((row) => [row.id, mapCustomer(row).displayName]),
      );
      const clientTotals = new Map<
        string,
        { name: string; projects: number; revenueUsd: number }
      >();

      for (const project of projectRows) {
        const current = clientTotals.get(project.customer_id) ?? {
          name: customerNames.get(project.customer_id) ?? "Unknown customer",
          projects: 0,
          revenueUsd: 0,
        };
        current.projects += 1;
        if (project.payment_status === "paid") {
          current.revenueUsd += priceOf(project.price_usd);
        }
        clientTotals.set(project.customer_id, current);
      }

      const topClients = [...clientTotals.values()]
        .sort((a, b) => b.revenueUsd - a.revenueUsd)
        .slice(0, 4);

      return {
        usage,
        revenueUsd,
        revenueDelta,
        projectsDelivered: deliveredLast30.length,
        avgTurnaroundDays,
        revisionRate,
        aiActions,
        humanEscalations,
        agentCostUsd,
        topClients,
        throughput,
      };
    },
    () => demoAnalytics,
  );
}

export const agentStatuses: AgentStatus[] = [
  {
    id: "communication",
    name: "Communication Agent",
    role: "Outbound Discord messages",
    state: "active",
    model: "gpt-4o-mini",
    actions24h: 46,
    costUsd: 0.18,
    lastRunAt: "2026-10-19T08:42:00Z",
    description: "Drafts and sends customer updates. Cannot ban, delete or touch billing.",
  },
  {
    id: "brief_collector",
    name: "Brief Collector",
    role: "Structured brief extraction",
    state: "active",
    model: "gpt-4o-mini",
    actions24h: 12,
    costUsd: 0.09,
    lastRunAt: "2026-10-19T08:31:00Z",
    description: "Turns conversation into a validated brief; escalates on schema failure.",
  },
  {
    id: "project_manager",
    name: "Project Manager",
    role: "Records, tasks, deadlines",
    state: "active",
    model: "deterministic",
    actions24h: 88,
    costUsd: 0,
    lastRunAt: "2026-10-19T08:44:00Z",
    description: "No LLM. Idempotent upserts for projects, tasks and status transitions.",
  },
  {
    id: "qa_agent",
    name: "QA Agent",
    role: "Deliverable vs brief checks",
    state: "active",
    model: "gpt-4o",
    actions24h: 9,
    costUsd: 0.05,
    lastRunAt: "2026-10-19T08:12:00Z",
    description: "Mesh budget, texture size and rig compatibility checklist before delivery.",
  },
  {
    id: "followup_agent",
    name: "Follow-up Agent",
    role: "Scheduled nudges",
    state: "paused",
    model: "gpt-4o-mini",
    actions24h: 0,
    costUsd: 0,
    lastRunAt: "2026-10-18T18:00:00Z",
    description: "Paused by the studio owner. Max 3 follow-ups before escalation.",
  },
  {
    id: "reporting_agent",
    name: "Reporting Agent",
    role: "Completion reports",
    state: "active",
    model: "gpt-4o-mini",
    actions24h: 4,
    costUsd: 0.01,
    lastRunAt: "2026-10-18T16:20:00Z",
    description: "Generates the completion summary stored alongside the deliverable.",
  },
];

export interface AgentPauseState {
  aiPaused: boolean;
  pausedAgents: Record<string, boolean>;
}

const demoPauseState: AgentPauseState = {
  aiPaused: false,
  pausedAgents: { followup_agent: true },
};

function normalizeAgentName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function readAgentSettings(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<AgentPauseState> {
  const { data, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();

  if (error) throw error;

  const settings = asRecord(data?.settings);
  const rawPaused = asRecord(settings.agents_paused);
  const pausedAgents: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(rawPaused)) {
    if (value === true) pausedAgents[key] = true;
  }

  return { aiPaused: settings.ai_paused === true, pausedAgents };
}

export async function getAgentPauseState(): Promise<AgentPauseState> {
  if (isDemoMode) return demoPauseState;

  return withFallback<AgentPauseState>(
    "getAgentPauseState",
    async () => {
      const { supabase, tenantId } = await readContext();
      return readAgentSettings(supabase, tenantId);
    },
    () => demoPauseState,
  );
}

const AGENT_AUDIT_SELECT = "agent_name,model_used,cost_usd,created_at,status";

export async function getAgentStatuses(): Promise<AgentStatus[]> {
  if (isDemoMode) return agentStatuses;

  return withFallback<AgentStatus[]>(
    "getAgentStatuses",
    async () => {
      const { supabase, tenantId } = await readContext();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [auditResult, settings] = await Promise.all([
        supabase
          .from("agent_audit_log")
          .select(AGENT_AUDIT_SELECT)
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
        readAgentSettings(supabase, tenantId),
      ]);

      if (auditResult.error) throw auditResult.error;

      const rows = (auditResult.data ?? []) as unknown as Array<{
        agent_name: string;
        model_used: string | null;
        cost_usd: number | string | null;
        created_at: string;
        status: string | null;
      }>;

      interface AgentTotals {
        actions24h: number;
        costUsd: number;
        lastRunAt: string;
        model: string;
      }

      const totals = new Map<string, AgentTotals>();
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const row of rows) {
        const key = normalizeAgentName(row.agent_name);
        const current =
          totals.get(key) ??
          ({
            actions24h: 0,
            costUsd: 0,
            lastRunAt: row.created_at,
            model: row.model_used ?? "",
          } satisfies AgentTotals);

        if (new Date(row.created_at).getTime() >= dayAgo) {
          current.actions24h += 1;
          current.costUsd += asNumber(row.cost_usd) ?? 0;
        }
        if (row.created_at > current.lastRunAt) current.lastRunAt = row.created_at;
        if (!current.model && row.model_used) current.model = row.model_used;

        totals.set(key, current);
      }

      // Known identities are preserved so the roster stays stable before an agent
      // has produced any audit rows; live metrics are overlaid from the log.
      return agentStatuses.map((identity) => {
        const agentTotals = totals.get(normalizeAgentName(identity.id));
        const paused = settings.aiPaused || settings.pausedAgents[identity.id] === true;

        return {
          ...identity,
          state: paused ? "paused" : "active",
          model: agentTotals?.model || identity.model,
          actions24h: agentTotals?.actions24h ?? 0,
          costUsd: agentTotals?.costUsd ?? 0,
          lastRunAt: agentTotals?.lastRunAt ?? identity.lastRunAt,
        };
      });
    },
    () => agentStatuses,
  );
}

export const revisionRequests: RevisionRequest[] = [
  {
    id: "rev_1",
    projectId: "p_097",
    reference: "ROB-097",
    projectTitle: "Neon Racer Helmet",
    requestedBy: "@ChloeUGC",
    reason: "Visor roughness reads too glossy at distance; needs a matte pass.",
    status: "in_progress",
    createdAt: "2026-10-19T06:12:00Z",
  },
  {
    id: "rev_2",
    projectId: "p_102",
    reference: "ROB-102",
    projectTitle: "Anime Combat FX Pack",
    requestedBy: "@StudioHyper",
    reason: "Two crates are missing the emissive strip described in the brief.",
    status: "open",
    createdAt: "2026-10-18T21:40:00Z",
  },
  {
    id: "rev_3",
    projectId: "p_101",
    reference: "ROB-101",
    projectTitle: "Y2K Streetwear Hoodie & Beanie",
    requestedBy: "@BloxDevX",
    reason: "Hoodie seam intersects the avatar collar on R15.",
    status: "resolved",
    createdAt: "2026-10-16T10:05:00Z",
    resolvedAt: "2026-10-17T09:30:00Z",
  },
];

const REVISION_SELECT =
  "id,project_id,requested_by,reason,status,created_at,resolved_at,projects(reference_code,title)";

interface RevisionRow {
  id: string;
  project_id: string;
  requested_by: string | null;
  reason: string;
  status: string | null;
  created_at: string;
  resolved_at: string | null;
  projects?:
    | { reference_code: string | null; title: string | null }
    | { reference_code: string | null; title: string | null }[]
    | null;
}

function toRevisionStatus(value: string | null | undefined): RevisionStatus {
  switch (value) {
    case "in_progress":
    case "resolved":
    case "rejected":
      return value;
    default:
      return "open";
  }
}

function demoRevisions(): RevisionRequest[] {
  return [...revisionRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listRevisions(): Promise<RevisionRequest[]> {
  if (isDemoMode) return demoRevisions();

  return withFallback<RevisionRequest[]>(
    "listRevisions",
    async () => {
      const { supabase, tenantId } = await readContext();
      const { data, error } = await supabase
        .from("revisions")
        .select(REVISION_SELECT)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      return ((data ?? []) as unknown as RevisionRow[]).map((row) => {
        const project = first(row.projects);
        return {
          id: row.id,
          projectId: row.project_id,
          reference: project?.reference_code ?? row.project_id,
          projectTitle: project?.title ?? "Untitled project",
          requestedBy: row.requested_by ?? "Customer",
          reason: row.reason,
          status: toRevisionStatus(row.status),
          createdAt: row.created_at,
          resolvedAt: row.resolved_at ?? undefined,
        };
      });
    },
    demoRevisions,
  );
}

const demoAuditRows: AuditTableRow[] = [
  {
    id: "a_01",
    time: "09:42:18",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Parsed Discord intake message into draft brief",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1284,
    tokensOut: 386,
    costUsd: 0.000424,
    durationMs: 1840,
    status: "success",
  },
  {
    id: "a_02",
    time: "09:38:04",
    date: "Oct 19",
    agent: "Brief Collector",
    model: "gpt-4o-mini",
    action: "Extracted palette and poly budget from attachments",
    entity: "ROB-104",
    entityHref: "/projects/p_104",
    tokensIn: 2960,
    tokensOut: 742,
    costUsd: 0.000889,
    durationMs: 3210,
    status: "success",
  },
  {
    id: "a_03",
    time: "09:31:47",
    date: "Oct 19",
    agent: "QA Agent",
    model: "gpt-4o-mini",
    action: "Validated mesh bounds against UGC accessory spec",
    entity: "ROB-104",
    entityHref: "/projects/p_104",
    tokensIn: 8240,
    tokensOut: 512,
    costUsd: 0.001543,
    durationMs: 6480,
    status: "success",
  },
  {
    id: "a_04",
    time: "09:27:12",
    date: "Oct 19",
    agent: "Project Manager",
    model: "gpt-4o-mini",
    action: "Reassigned overdue QA task to Elena R.",
    entity: "TASK-104-03",
    tokensIn: 1120,
    tokensOut: 214,
    costUsd: 0.000296,
    durationMs: 980,
    status: "success",
  },
  {
    id: "a_05",
    time: "09:14:55",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Escalated ambiguous rig request to human review",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1640,
    tokensOut: 298,
    costUsd: 0.000425,
    durationMs: 1460,
    status: "escalated",
  },
  {
    id: "a_06",
    time: "08:58:31",
    date: "Oct 19",
    agent: "QA Agent",
    model: "claude-3.5-sonnet",
    action: "Texture resolution below 1024px threshold",
    entity: "ROB-097",
    entityHref: "/projects/p_097",
    tokensIn: 604,
    tokensOut: 142,
    costUsd: 0.003942,
    durationMs: 2940,
    status: "failure",
  },
  {
    id: "a_07",
    time: "08:44:09",
    date: "Oct 19",
    agent: "Brief Collector",
    model: "gpt-4o-mini",
    action: "Merged client revision notes into brief v3",
    entity: "ROB-097",
    entityHref: "/projects/p_097",
    tokensIn: 2240,
    tokensOut: 618,
    costUsd: 0.000707,
    durationMs: 2610,
    status: "success",
  },
  {
    id: "a_08",
    time: "08:21:36",
    date: "Oct 19",
    agent: "Project Manager",
    model: "gpt-4o-mini",
    action: "Queued delivery reminder in Discord ticket",
    entity: "ROB-102",
    entityHref: "/projects/p_102",
    tokensIn: 860,
    tokensOut: 164,
    costUsd: 0.000227,
    durationMs: 740,
    status: "success",
  },
  {
    id: "a_09",
    time: "07:59:02",
    date: "Oct 19",
    agent: "QA Agent",
    model: "gpt-4o-mini",
    action: "Asset manifest fetch timed out — retry scheduled",
    entity: "ROB-100",
    entityHref: "/projects/p_100",
    tokensIn: 980,
    tokensOut: 96,
    costUsd: 0.000205,
    durationMs: 12480,
    status: "failure",
  },
  {
    id: "a_10",
    time: "07:41:20",
    date: "Oct 19",
    agent: "Lexi Intake",
    model: "gpt-4o-mini",
    action: "Created commission from #order-098 thread",
    entity: "ROB-098",
    entityHref: "/projects/p_098",
    tokensIn: 1540,
    tokensOut: 402,
    costUsd: 0.000472,
    durationMs: 1980,
    status: "success",
  },
];

function toAuditTableRow(entry: AuditEntry): AuditTableRow {
  const at = new Date(entry.at);
  const valid = !Number.isNaN(at.getTime());

  return {
    id: entry.id,
    time: valid
      ? at.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : "--:--:--",
    date: valid ? at.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
    agent: entry.agentName,
    model: entry.modelUsed ?? "—",
    action: entry.outputSummary ?? entry.inputSummary ?? entry.action,
    entity: entry.entityId ?? entry.entityType ?? "—",
    entityHref:
      entry.entityType === "project" && entry.entityId
        ? `/projects/${entry.entityId}`
        : undefined,
    tokensIn: entry.tokensIn ?? 0,
    tokensOut: entry.tokensOut ?? 0,
    costUsd: entry.costUsd ?? 0,
    durationMs: entry.durationMs ?? 0,
    status: entry.status ?? "success",
  };
}

/* ------------------------------------------------------------------ */
/* Reports                                                            */
/* ------------------------------------------------------------------ */

export type ReportKind = "delivery" | "qa" | "summary";

export interface ProjectReport {
  id: string;
  projectId: string;
  kind: ReportKind;
  contentMd: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const REPORT_SELECT = "id,project_id,kind,content_md,payload,created_at,updated_at";

interface ReportRow {
  id: string;
  project_id: string;
  kind: string | null;
  content_md: string;
  payload: unknown;
  created_at: string;
  updated_at: string | null;
}

function toReportKind(value: string | null | undefined): ReportKind {
  switch (value) {
    case "qa":
    case "summary":
      return value;
    default:
      return "delivery";
  }
}

function mapProjectReport(row: ReportRow): ProjectReport {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: toReportKind(row.kind),
    contentMd: row.content_md,
    payload: asRecord(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/** Latest persisted report for a project, or null in demo mode / when absent. */
export async function getProjectReport(
  projectId: string,
  kind: ReportKind = "delivery",
): Promise<ProjectReport | null> {
  if (isDemoMode) return null;

  return withFallback<ProjectReport | null>(
    "getProjectReport",
    async () => {
      const { supabase, tenantId } = await readContext();
      const { data, error } = await supabase
        .from("reports")
        .select(REPORT_SELECT)
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .eq("kind", kind)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return mapProjectReport(data as unknown as ReportRow);
    },
    () => null,
  );
}

/** Every persisted report for a project, newest first (demo mode: empty). */
export async function listReports(projectId: string): Promise<ProjectReport[]> {
  if (isDemoMode) return [];

  return withFallback<ProjectReport[]>(
    "listReports",
    async () => {
      const { supabase, tenantId } = await readContext();
      const { data, error } = await supabase
        .from("reports")
        .select(REPORT_SELECT)
        .eq("tenant_id", tenantId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as unknown as ReportRow[]).map(mapProjectReport);
    },
    () => [],
  );
}

/* ------------------------------------------------------------------ */
/* Billing                                                            */
/* ------------------------------------------------------------------ */

export interface BillingInvoice {
  id: string;
  date: string;
  description: string;
  amountUsd: number;
  status: string;
}

export interface BillingSummary {
  planId: PlanId;
  aiCreditsUsed: number;
  aiCreditsLimit?: number;
  currentPeriodEnd: string | null;
  invoices: BillingInvoice[];
  demo: boolean;
}

const demoInvoices: BillingInvoice[] = [
  {
    id: "demo_inv_2026_09",
    date: "2026-09-18T12:00:00Z",
    description: "Growth plan — monthly",
    amountUsd: 49,
    status: "Paid",
  },
  {
    id: "demo_inv_2026_08",
    date: "2026-08-18T12:00:00Z",
    description: "Growth plan — monthly",
    amountUsd: 49,
    status: "Paid",
  },
  {
    id: "demo_inv_2026_07_upgrade",
    date: "2026-07-18T12:00:00Z",
    description: "Starter → Growth upgrade",
    amountUsd: 30,
    status: "Paid",
  },
  {
    id: "demo_inv_2026_07",
    date: "2026-07-02T12:00:00Z",
    description: "Starter plan — monthly",
    amountUsd: 19,
    status: "Paid",
  },
];

function toPlanId(value: unknown): PlanId {
  return value === "growth" || value === "pro" ? value : "starter";
}

function demoBillingSummary(): BillingSummary {
  const plan = getPlan("growth");
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  return {
    planId: "growth",
    aiCreditsUsed: Math.round(plan.aiCreditsUsd * 0.42),
    aiCreditsLimit: plan.aiCreditsUsd,
    currentPeriodEnd: periodEnd.toISOString(),
    invoices: demoInvoices,
    demo: true,
  };
}

interface BillingEventRow {
  id: string;
  type: string | null;
  payload: unknown;
  created_at: string;
}

function invoiceLineDescription(payload: Record<string, unknown>): string | undefined {
  const lines = asRecord(payload.lines);
  const line = first(lines.data as unknown[] | undefined);
  return asString(asRecord(line).description);
}

function invoiceFromEvent(row: BillingEventRow): BillingInvoice | null {
  const type = row.type ?? "";
  if (!type.startsWith("invoice.")) return null;

  const payload = asRecord(row.payload);
  const amountCents = asNumber(payload.amount_paid) ?? asNumber(payload.amount_total);
  if (amountCents === null) return null;

  const created = asNumber(payload.created);
  const date =
    created !== null ? new Date(created * 1000).toISOString() : row.created_at;

  const rawStatus =
    asString(payload.status) ?? (type.includes("paid") ? "paid" : "open");
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
  const description =
    asString(payload.description) ??
    invoiceLineDescription(payload) ??
    "Subscription invoice";
  const number = asString(payload.number);

  return {
    id: asString(payload.id) ?? row.id,
    date,
    description: number ? `${description} (${number})` : description,
    amountUsd: amountCents / 100,
    status,
  };
}

/**
 * Subscription/usage snapshot for the billing page. Reads the tenant row
 * (tenant-scoped) plus recent Stripe billing events; demo mode keeps the
 * previously hardcoded values and is flagged with `demo: true`.
 */
export async function getBillingSummary(): Promise<BillingSummary> {
  if (isDemoMode) return demoBillingSummary();

  return withFallback<BillingSummary>(
    "getBillingSummary",
    async () => {
      const { supabase, tenantId } = await readContext();

      const [tenantResult, eventResult] = await Promise.all([
        supabase
          .from("tenants")
          .select(
            "id,name,plan_id,ai_credits_used,current_period_end,stripe_subscription_id",
          )
          .eq("id", tenantId)
          .single(),
        supabase
          .from("billing_events")
          .select("id,type,payload,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (tenantResult.error) throw tenantResult.error;
      if (eventResult.error) throw eventResult.error;

      const tenant = asRecord(tenantResult.data);
      const planId = toPlanId(tenant.plan_id);
      const invoices = ((eventResult.data ?? []) as unknown as BillingEventRow[])
        .map(invoiceFromEvent)
        .filter((invoice): invoice is BillingInvoice => invoice !== null)
        .slice(0, 12);

      return {
        planId,
        aiCreditsUsed: asNumber(tenant.ai_credits_used) ?? 0,
        aiCreditsLimit: getPlan(planId).aiCreditsUsd,
        currentPeriodEnd: asString(tenant.current_period_end) ?? null,
        invoices,
        demo: false,
      };
    },
    demoBillingSummary,
  );
}

export async function listAuditEntries(limit = 50): Promise<AuditTableRow[]> {
  if (isDemoMode) return demoAuditRows.slice(0, limit);

  return withFallback<AuditTableRow[]>(
    "listAuditEntries",
    async () => {
      const { supabase, tenantId } = await readContext();
      const { data, error } = await supabase
        .from("agent_audit_log")
        .select(AUDIT_SELECT)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as unknown as AuditLogRow[]).map(mapAuditEntry).map(toAuditTableRow);
    },
    () => demoAuditRows.slice(0, limit),
  );
}
