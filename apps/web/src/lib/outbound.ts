import { createClient } from "@/lib/supabase/server";

export interface OutboundMessage {
  id: string;
  projectId: string;
  kind: string;
  body: string;
  status: "pending" | "sent" | "rejected" | "failed";
  createdAt: string;
  approvedBy?: string | null;
}

interface OutboundRow {
  id: string;
  project_id: string | null;
  kind: string;
  body: string;
  status: string;
  created_at: string;
  approved_by: string | null;
}

/**
 * Lists outbound Discord messages waiting for human approval. Uses the
 * user-scoped Supabase client so tenant RLS applies; never throws.
 */
export async function listPendingOutbound(projectId: string): Promise<OutboundMessage[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }
  if (!projectId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("outbound_messages")
      .select("id,project_id,kind,body,status,created_at,approved_by")
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as unknown as OutboundRow[]).map((row) => ({
      id: row.id,
      projectId: row.project_id ?? projectId,
      kind: row.kind,
      body: row.body,
      status: row.status as OutboundMessage["status"],
      createdAt: row.created_at,
      approvedBy: row.approved_by,
    }));
  } catch (error) {
    console.error("[outbound] listPendingOutbound failed", error);
    return [];
  }
}
