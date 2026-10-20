import { isDemoMode } from "./data";
import { createClient, getAuthSession } from "./supabase/server";

export interface AssistantToolTrace {
  name: string;
  ok: boolean;
  summary: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: AssistantToolTrace[];
  createdAt: string;
}

export interface AssistantHistory {
  threadId: string | null;
  messages: AssistantMessage[];
}

const EMPTY: AssistantHistory = { threadId: null, messages: [] };

function mapTrace(value: unknown): AssistantToolTrace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) return [];
    return [
      {
        name,
        ok: record.ok !== false,
        summary: typeof record.summary === "string" ? record.summary : "",
      },
    ];
  });
}

/**
 * Last thread of the signed-in user, with its most recent messages.
 * RLS already scopes both tables to the tenant and to `auth.uid()`.
 */
export async function loadAssistantHistory(): Promise<AssistantHistory> {
  if (isDemoMode) return EMPTY;

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return EMPTY;

  const { data: thread } = await supabase
    .from("assistant_threads")
    .select("id")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!thread?.id) return EMPTY;

  const { data: rows } = await supabase
    .from("assistant_messages")
    .select("id, role, content, tool_calls, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(50);

  const messages: AssistantMessage[] = (rows ?? []).flatMap((row) => {
    const record = row as Record<string, unknown>;
    const role = record.role === "user" ? "user" : "assistant";
    return [
      {
        id: String(record.id),
        role,
        content: typeof record.content === "string" ? record.content : "",
        toolCalls: mapTrace(record.tool_calls),
        createdAt: String(record.created_at ?? ""),
      },
    ];
  });

  return { threadId: thread.id, messages };
}
