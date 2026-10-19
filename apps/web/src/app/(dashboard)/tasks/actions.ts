"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { TASK_STATUSES } from "@/lib/supabase/mappers";
import { createClient, getAuthSession } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  priority?: number | null;
  dueAt?: string;
  assignedTo?: string | null;
}

export interface CreateTaskResult {
  ok: boolean;
  message: string;
  taskId?: string;
}

/**
 * Creates a designer work item against an existing project. Writes an audit row
 * attributed to the signed-in user, mirroring `human:<id>` used elsewhere.
 */
export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — connect Supabase to create tasks." };
  }

  const title = input.title?.trim();
  if (!title) return { ok: false, message: "A task title is required." };
  if (title.length > 200) return { ok: false, message: "Keep the title under 200 characters." };
  if (!input.projectId) return { ok: false, message: "Choose a project for this task." };

  let priority = 0;
  if (input.priority !== undefined && input.priority !== null) {
    const parsed = Number(input.priority);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false, message: "Priority must be between 0 and 100." };
    }
    priority = Math.round(parsed);
  }

  let dueAt: string | null = null;
  if (input.dueAt) {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "Due date is not a valid date." };
    }
    dueAt = parsed.toISOString();
  }

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) return { ok: false, message: "Session expired. Sign in again." };
    const { tenantId, userId } = session;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", input.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { ok: false, message: "Project not found." };

    let assignedTo: string | null = null;
    if (input.assignedTo) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", input.assignedTo)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return { ok: false, message: "Assignee was not found on this team." };
      assignedTo = user.id;
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        tenant_id: tenantId,
        project_id: input.projectId,
        title,
        priority,
        due_at: dueAt,
        assigned_to: assignedTo,
      })
      .select("id")
      .single();
    if (taskError) throw taskError;

    const { error: auditError } = await supabase.from("agent_audit_log").insert({
      tenant_id: tenantId,
      agent_name: `human:${userId}`,
      action: "task_created",
      entity_type: "project",
      entity_id: input.projectId,
      input_summary: `priority=${priority}`,
      output_summary: `Task "${title}" created`,
      status: "success",
    });
    if (auditError) console.error("[tasks.createTask] audit failed", auditError);

    revalidatePath("/tasks");
    revalidatePath("/");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, message: `Task "${title}" added.`, taskId: task.id };
  } catch (error) {
    console.error("[tasks.createTask] failed", error);
    return { ok: false, message: "Could not create the task. Try again." };
  }
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Moves a task between board columns (pending / in_progress / blocked / done)
 * and records the change as a human audit row.
 */
export async function updateTaskStatus(
  taskId: string,
  status: string,
): Promise<CreateTaskResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode — connect Supabase to change task status." };
  }
  if (!isTaskStatus(status)) {
    return { ok: false, message: "Unknown task status." };
  }

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) return { ok: false, message: "Session expired. Sign in again." };
    const { tenantId, userId } = session;

    const { data: task, error } = await supabase
      .from("tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .select("id, project_id, title")
      .maybeSingle();
    if (error) throw error;
    if (!task) return { ok: false, message: "Task not found." };

    const { error: auditError } = await supabase.from("agent_audit_log").insert({
      tenant_id: tenantId,
      agent_name: `human:${userId}`,
      action: "task_status",
      entity_type: "task",
      entity_id: task.id,
      input_summary: `status=${status}`,
      output_summary: `Task "${task.title}" moved to ${status}`,
      status: "success",
    });
    if (auditError) console.error("[tasks.updateTaskStatus] audit failed", auditError);

    revalidatePath("/tasks");
    revalidatePath("/");
    revalidatePath(`/projects/${task.project_id}`);
    return { ok: true, message: `Task moved to ${status}.`, taskId: task.id };
  } catch (error) {
    console.error("[tasks.updateTaskStatus] failed", error);
    return { ok: false, message: "Could not update the task. Try again." };
  }
}
