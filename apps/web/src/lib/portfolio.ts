import { isDemoMode } from "./data";
import { createClient, getAuthSession } from "./supabase/server";

export interface PortfolioMedia {
  path: string;
  url: string;
}

export type PortfolioStatus = "queued" | "publishing" | "published" | "failed" | "rejected";

export interface PortfolioPost {
  id: string;
  status: PortfolioStatus;
  caption: string;
  mediaUrls: PortfolioMedia[];
  projectReference: string | null;
  projectTitle: string | null;
  externalUrl: string | null;
  error: string | null;
  createdAt: string;
}

function mapStatus(value: unknown): PortfolioStatus {
  return value === "publishing" || value === "published" || value === "failed" || value === "rejected"
    ? value
    : "queued";
}

function mapMedia(value: unknown): PortfolioMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : "";
    if (!url) return [];
    return [{ path: typeof record.path === "string" ? record.path : "", url }];
  });
}

/** Connected X account metadata (tokens stay in Vault). */
export async function getSocialAccount(): Promise<{ handle: string | null; connected: boolean }> {
  if (isDemoMode) return { handle: null, connected: false };

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return { handle: null, connected: false };

  const { data } = await supabase
    .from("social_accounts")
    .select("handle, status")
    .eq("tenant_id", session.tenantId)
    .eq("platform", "x")
    .maybeSingle<{ handle: string | null; status: string }>();

  return {
    handle: data?.handle ?? null,
    connected: data?.status === "connected",
  };
}

/** Portfolio review queue for the signed-in tenant. RLS scopes the query. */
export async function listPortfolioPosts(): Promise<PortfolioPost[]> {
  if (isDemoMode) return [];

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return [];

  const { data, error } = await supabase
    .from("portfolio_posts")
    .select(
      "id, status, caption, media_urls, external_url, error, created_at, project_id, projects(reference_code, title)",
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[portfolio] query failed", error);
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const record = row as Record<string, unknown>;
    const project = record.projects as { reference_code?: string; title?: string } | null;
    const status = mapStatus(record.status);
    if (status === "rejected") return [];
    return [
      {
        id: String(record.id),
        status,
        caption: typeof record.caption === "string" ? record.caption : "",
        mediaUrls: mapMedia(record.media_urls),
        projectReference: project?.reference_code ?? null,
        projectTitle: project?.title ?? null,
        externalUrl: typeof record.external_url === "string" ? record.external_url : null,
        error: typeof record.error === "string" ? record.error : null,
        createdAt: String(record.created_at ?? ""),
      },
    ];
  });
}
