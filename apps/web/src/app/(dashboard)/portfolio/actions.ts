"use server";

import { revalidatePath } from "next/cache";

import { isDemoMode } from "@/lib/data";
import { createClient, getAuthSession } from "@/lib/supabase/server";

const WORKER_URL = (process.env.INTERNAL_WORKER_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export interface PortfolioActionResult {
  ok: boolean;
  message: string;
  externalUrl?: string;
}

async function callWorker(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  const token = process.env.INTERNAL_WORKER_TOKEN;
  if (!token) {
    console.error(`[portfolio] INTERNAL_WORKER_TOKEN is not configured — ${path} skipped`);
    return { ok: false, message: "Worker belum dikonfigurasi." };
  }

  try {
    const response = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      console.error(`[portfolio] worker ${path} failed`, response.status, data);
      return { ok: false, message: "Worker menolak permintaan." };
    }
    return { ok: true, data: data ?? undefined };
  } catch (error) {
    console.error(`[portfolio] worker ${path} failed`, error);
    return { ok: false, message: "Tidak bisa menghubungi worker." };
  }
}

export async function savePortfolioCaption(
  postId: string,
  caption: string,
): Promise<PortfolioActionResult> {
  if (isDemoMode) return { ok: false, message: "Mode demo — hubungkan Supabase." };

  const text = caption.trim();
  if (!text) return { ok: false, message: "Caption tidak boleh kosong." };
  if (text.length > 240) return { ok: false, message: "Caption maksimal 240 karakter." };

  try {
    const supabase = await createClient();
    const session = await getAuthSession(supabase);
    if (!session?.tenantId) return { ok: false, message: "Sesi berakhir. Masuk lagi." };

    const { error } = await supabase
      .from("portfolio_posts")
      .update({ caption: text })
      .eq("id", postId)
      .eq("tenant_id", session.tenantId);

    if (error) throw error;

    revalidatePath("/portfolio");
    return { ok: true, message: "Caption disimpan." };
  } catch (error) {
    console.error("[portfolio.saveCaption] failed", error);
    return { ok: false, message: "Gagal menyimpan caption." };
  }
}

export async function publishPortfolioPost(postId: string): Promise<PortfolioActionResult> {
  if (isDemoMode) return { ok: false, message: "Mode demo — hubungkan worker." };

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return { ok: false, message: "Sesi berakhir. Masuk lagi." };

  const result = await callWorker("/portfolio/publish", {
    tenant_id: session.tenantId,
    post_id: postId,
  });
  if (!result.ok) return { ok: false, message: result.message ?? "Gagal publish." };

  revalidatePath("/portfolio");

  const status = result.data?.status;
  if (status === "published") {
    return {
      ok: true,
      message: "Sudah tayang di X.",
      externalUrl: typeof result.data?.external_url === "string" ? result.data.external_url : undefined,
    };
  }
  if (status === "skipped") {
    return { ok: false, message: String(result.data?.error ?? "Post ini tidak bisa dipublish.") };
  }
  return { ok: false, message: String(result.data?.error ?? "X menolak post ini.") };
}

export async function rejectPortfolioPost(
  postId: string,
  reason = "",
): Promise<PortfolioActionResult> {
  if (isDemoMode) return { ok: false, message: "Mode demo — hubungkan worker." };

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) return { ok: false, message: "Sesi berakhir. Masuk lagi." };

  const result = await callWorker("/portfolio/reject", {
    tenant_id: session.tenantId,
    post_id: postId,
    reason,
  });
  if (!result.ok) return { ok: false, message: result.message ?? "Gagal menolak post." };

  revalidatePath("/portfolio");
  return { ok: true, message: "Post ditolak." };
}
