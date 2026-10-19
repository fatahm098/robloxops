import { getMockProject, overviewStats, projects, studioEvents, tasks, teamLoads } from "./mock";
import type {
  OverviewStats,
  ProjectDetail,
  ProjectFilters,
  ProjectStatus,
  ProjectSummary,
  StudioEvent,
  Task,
  TeamLoad,
} from "./types";
import { createClient, getAuthSession, type SupabaseServerClient } from "./supabase/server";
import {
  AUDIT_SELECT,
  CONVERSATION_SELECT,
  PROJECT_SELECT,
  TASK_SELECT,
  first,
  initialsOf,
  mapAuditEntry,
  mapProjectDetail,
  mapProjectSummary,
  mapTask,
  mapTenant,
  toProjectStatus,
  type AuditLogRow,
  type ConversationRow,
  type ProjectRow,
  type TaskRow,
  type TenantRow,
  type UserRow,
} from "./supabase/mappers";

/**
 * Data access layer.
 *
 * Everything the UI reads goes through this module so the mock implementation can be
 * swapped for Supabase queries without touching components. `isDemoMode` is true when
 * no Supabase credentials are configured, which keeps `npm run dev` usable out of the box.
 */
export const isDemoMode =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface TenantContext {
  name: string;
  slug: string;
  plan: "starter" | "growth" | "pro";
  discordGuild: string;
  agentsActive: number;
  errorCount: number;
}

export const demoTenant: TenantContext = {
  name: "Apex UGC Studio",
  slug: "apex-ugc",
  plan: "growth",
  discordGuild: "#client-comm",
  agentsActive: 4,
  errorCount: 0,
};

interface DataContext {
  supabase: SupabaseServerClient;
  tenantId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INACTIVE_STATUSES: ProjectStatus[] = ["delivered", "cancelled"];

async function readContext(): Promise<DataContext> {
  const supabase = await createClient();
  const session = await getAuthSession(supabase);

  if (!session) {
    throw new Error("No authenticated Supabase user");
  }
  if (!session.tenantId) {
    throw new Error("Authenticated user has no tenant_id claim");
  }

  return { supabase, tenantId: session.tenantId };
}

/**
 * Runs a Supabase read. Errors are always logged; in development the caller's
 * mock result is returned so the UI stays usable, while production rethrows.
 */
async function withFallback<T>(
  scope: string,
  run: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[data] ${scope} failed:`, error);
    if (process.env.NODE_ENV === "production") {
      throw error instanceof Error ? error : new Error(`${scope} failed`);
    }
    return fallback();
  }
}

function demoOverview() {
  return {
    stats: overviewStats,
    events: studioEvents,
    teamLoads,
    urgent: projects.filter((p) =>
      ["qa_check", "in_design", "customer_review", "briefing"].includes(p.status),
    ),
    qaReady: projects.find((p) => p.reference === "ROB-104") ?? projects[0],
  };
}

function demoListProjects(filters: ProjectFilters = {}): ProjectSummary[] {
  const { status = "all", search } = filters;
  return projects.filter((project) => {
    const matchesStatus = status === "all" || project.status === status;
    const term = search?.trim().toLowerCase();
    const matchesSearch =
      !term ||
      project.reference.toLowerCase().includes(term) ||
      project.title.toLowerCase().includes(term) ||
      project.customer.displayName.toLowerCase().includes(term) ||
      project.discordTicket?.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });
}

function demoTasks(): Task[] {
  return [...tasks].sort((a, b) => b.priority - a.priority);
}

function emptyStatusCounts(): Record<ProjectStatus | "all", number> {
  return {
    all: 0,
    intake: 0,
    briefing: 0,
    brief_review: 0,
    in_design: 0,
    qa_check: 0,
    customer_review: 0,
    revision: 0,
    approved: 0,
    delivered: 0,
    cancelled: 0,
    on_hold: 0,
  };
}

function demoStatusCounts(): Record<ProjectStatus | "all", number> {
  const counts = emptyStatusCounts();
  counts.all = projects.length;

  for (const project of projects) {
    counts[project.status] += 1;
  }
  return counts;
}

export async function getTenant(): Promise<TenantContext> {
  if (isDemoMode) return demoTenant;

  return withFallback<TenantContext>(
    "getTenant",
    async () => {
      const { supabase, tenantId } = await readContext();
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,plan_id,discord_guild_id,settings")
        .eq("id", tenantId)
        .single();

      if (error) throw error;
      return mapTenant(data as unknown as TenantRow);
    },
    () => demoTenant,
  );
}

export async function getOverview() {
  if (isDemoMode) return demoOverview();

  return withFallback<ReturnType<typeof demoOverview>>(
    "getOverview",
    async () => {
      const { supabase, tenantId } = await readContext();

      const [projectResult, taskResult, auditResult, userResult] = await Promise.all([
        supabase
          .from("projects")
          .select(PROJECT_SELECT)
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false }),
        supabase.from("tasks").select("id,status,due_at").eq("tenant_id", tenantId),
        supabase
          .from("agent_audit_log")
          .select(AUDIT_SELECT)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("users").select("id,display_name,email,role").eq("tenant_id", tenantId),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (taskResult.error) throw taskResult.error;
      if (auditResult.error) throw auditResult.error;
      if (userResult.error) throw userResult.error;

      const projectRows = (projectResult.data ?? []) as unknown as ProjectRow[];
      const taskRows = (taskResult.data ?? []) as unknown as Array<{
        id: string;
        status: string | null;
        due_at: string | null;
      }>;
      const auditRows = (auditResult.data ?? []) as unknown as AuditLogRow[];
      const userRows = (userResult.data ?? []) as unknown as UserRow[];

      const summaries = projectRows.map(mapProjectSummary);
      const paid = summaries.filter((project) => project.paymentStatus === "paid");
      const today = new Date().toDateString();

      const stats: OverviewStats = {
        activeProjects: summaries.filter(
          (project) => !INACTIVE_STATUSES.includes(project.status),
        ).length,
        activeDelta: 0,
        queueTasks: taskRows.filter(
          (task) => task.status === "pending" || task.status === "in_progress",
        ).length,
        dueToday: taskRows.filter(
          (task) => task.due_at !== null && new Date(task.due_at).toDateString() === today,
        ).length,
        newIntakes: summaries.filter((project) => project.status === "intake").length,
        scopedByAi: projectRows.filter(
          (row) => first(row.briefs)?.approved_by_designer === true,
        ).length,
        briefReview: summaries.filter((project) => project.status === "brief_review").length,
        revenueUsd: paid.reduce((total, project) => total + (project.priceUsd ?? 0), 0),
        revenueRobux: paid.reduce((total, project) => total + (project.priceRobux ?? 0), 0),
        revenueDelta: 0,
      };

      const events: StudioEvent[] = auditRows.map((row) => {
        const entry = mapAuditEntry(row);
        return {
          id: entry.id,
          at: entry.at,
          actor: entry.agentName,
          text: entry.outputSummary ?? entry.inputSummary ?? entry.action,
          kind: entry.agentName.startsWith("human:") ? "human" : "agent",
        };
      });

      const loads: TeamLoad[] = userRows
        .filter((user) => user.role === "designer")
        .map((user) => {
          const activeProjects = summaries.filter(
            (project) =>
              project.assignee?.id === user.id && !INACTIVE_STATUSES.includes(project.status),
          ).length;
          const name = user.display_name ?? user.email ?? "Designer";
          return {
            id: user.id,
            name,
            initials: initialsOf(name),
            specialty: "Designer",
            load: Math.min(100, activeProjects * 30),
            activeProjects,
          };
        });

      const urgent = summaries.filter((project) =>
        ["qa_check", "in_design", "customer_review", "briefing"].includes(project.status),
      );

      return {
        stats,
        events,
        teamLoads: loads,
        urgent,
        qaReady: summaries.find((project) => project.status === "qa_check") ?? summaries[0],
      };
    },
    demoOverview,
  );
}

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  if (isDemoMode) return demoListProjects(filters);

  const { status = "all", search } = filters;

  return withFallback<ProjectSummary[]>(
    "listProjects",
    async () => {
      const { supabase, tenantId } = await readContext();

      let query = supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });

      if (status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;

      const summaries = ((data ?? []) as unknown as ProjectRow[]).map(mapProjectSummary);
      const term = search?.trim().toLowerCase();

      if (!term) return summaries;

      return summaries.filter(
        (project) =>
          project.reference.toLowerCase().includes(term) ||
          project.title.toLowerCase().includes(term) ||
          project.customer.displayName.toLowerCase().includes(term) ||
          project.discordTicket?.toLowerCase().includes(term),
      );
    },
    () => demoListProjects(filters),
  );
}

export async function getProjectDetail(idOrRef: string): Promise<ProjectDetail | null> {
  if (isDemoMode) return getMockProject(idOrRef);

  return withFallback<ProjectDetail | null>(
    "getProjectDetail",
    async () => {
      const { supabase, tenantId } = await readContext();

      const column = UUID_PATTERN.test(idOrRef) ? "id" : "reference_code";
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("tenant_id", tenantId)
        .eq(column, idOrRef)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as ProjectRow;

      const [conversationResult, auditResult] = await Promise.all([
        supabase
          .from("conversations")
          .select(CONVERSATION_SELECT)
          .eq("tenant_id", tenantId)
          .eq("project_id", row.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("agent_audit_log")
          .select(AUDIT_SELECT)
          .eq("tenant_id", tenantId)
          .eq("entity_id", row.id)
          .order("created_at", { ascending: true })
          .limit(50),
      ]);

      if (conversationResult.error) throw conversationResult.error;
      if (auditResult.error) throw auditResult.error;

      return mapProjectDetail(
        row,
        (conversationResult.data ?? []) as unknown as ConversationRow[],
        (auditResult.data ?? []) as unknown as AuditLogRow[],
      );
    },
    () => getMockProject(idOrRef),
  );
}

export async function listTasks(): Promise<Task[]> {
  if (isDemoMode) return demoTasks();

  return withFallback<Task[]>(
    "listTasks",
    async () => {
      const { supabase, tenantId } = await readContext();

      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false })
        .order("due_at", { ascending: true, nullsFirst: false });

      if (error) throw error;

      return ((data ?? []) as unknown as TaskRow[]).map(mapTask);
    },
    demoTasks,
  );
}

export async function getStatusCounts(): Promise<Record<ProjectStatus | "all", number>> {
  if (isDemoMode) return demoStatusCounts();

  return withFallback<Record<ProjectStatus | "all", number>>(
    "getStatusCounts",
    async () => {
      const { supabase, tenantId } = await readContext();

      const { data, error } = await supabase
        .from("projects")
        .select("status")
        .eq("tenant_id", tenantId);

      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{ status: string | null }>;
      const counts = emptyStatusCounts();
      counts.all = rows.length;

      for (const row of rows) {
        counts[toProjectStatus(row.status)] += 1;
      }

      return counts;
    },
    demoStatusCounts,
  );
}
