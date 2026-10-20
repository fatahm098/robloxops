"use server";

import { revalidatePath } from "next/cache";

import type { AssistantToolTrace } from "@/lib/assistant";
import { isDemoMode } from "@/lib/data";
import { createClient, getAuthSession } from "@/lib/supabase/server";

const WORKER_URL = (process.env.INTERNAL_WORKER_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export interface AssistantActionResult {
  ok: boolean;
  reply?: string;
  threadId?: string;
  toolCalls?: AssistantToolTrace[];
  message?: string;
}

interface WorkerReply {
  thread_id?: string | null;
  reply?: string;
  tool_calls?: { name?: string; ok?: boolean; summary?: string }[];
  detail?: string;
}

export async function sendAssistantMessage(input: {
  message: string;
  threadId?: string | null;
}): Promise<AssistantActionResult> {
  const text = input.message.trim();
  if (!text) return { ok: false, message: "Tulis pesan dulu." };

  if (isDemoMode) {
    return {
      ok: true,
      reply:
        "Mode demo: aku belum terhubung ke worker, jadi belum bisa membaca atau mengubah data. Hubungkan Supabase dan worker untuk mengaktifkan asisten.",
    };
  }

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) {
    return { ok: false, message: "Sesi berakhir. Coba masuk lagi." };
  }

  const token = process.env.INTERNAL_WORKER_TOKEN;
  if (!token) {
    console.error("[assistant] INTERNAL_WORKER_TOKEN is not configured");
    return { ok: false, message: "Asisten belum dikonfigurasi di server ini." };
  }

  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}/assistant/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenant_id: session.tenantId,
        user_id: session.userId,
        message: text,
        thread_id: input.threadId ?? null,
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[assistant] worker unreachable", error);
    return { ok: false, message: "Asisten sedang tidak bisa dihubungi. Coba lagi sebentar." };
  }

  const data = (await response.json().catch(() => null)) as WorkerReply | null;
  if (!response.ok) {
    console.error("[assistant] worker rejected request", response.status, data);
    return {
      ok: false,
      message:
        data?.detail === "assistant_rate_limited"
          ? "Kuota AI hari ini habis. Coba lagi besok, atau ganti kunci LLM di Pengaturan."
          : data?.detail === "assistant_unavailable"
            ? "Asisten sedang tidak bisa memproses pesan. Coba lagi sebentar."
            : "Asisten tidak bisa memproses pesan itu.",
    };
  }

  const toolCalls = Array.isArray(data?.tool_calls)
    ? data.tool_calls.flatMap((call) => {
        const name = typeof call?.name === "string" ? call.name : "";
        if (!name) return [];
        return [
          {
            name,
            ok: call?.ok !== false,
            summary: typeof call?.summary === "string" ? call.summary : "",
          },
        ];
      })
    : [];

  revalidatePath("/assistant");
  revalidatePath("/today");
  revalidatePath("/projects");

  return {
    ok: true,
    reply: data?.reply ?? "",
    threadId: data?.thread_id ?? undefined,
    toolCalls,
  };
}
