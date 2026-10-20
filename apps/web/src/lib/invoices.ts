import { isDemoMode, readContext, withFallback } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { asNumber } from "@/lib/supabase/mappers";

/**
 * Project invoices.
 *
 * Reads go through the request-scoped Supabase client so RLS enforces tenant
 * isolation. Mutations are delegated to the worker (service role) and always
 * carry the tenant id resolved from the verified session -- never from input.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface Invoice {
  id: string;
  tenantId: string;
  projectId: string;
  number: string;
  amountRobux: number | null;
  rateRobuxPerUsd: number | null;
  amountUsd: number | null;
  status: InvoiceStatus;
  issuedAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceSummary {
  totalCount: number;
  outstandingCount: number;
  paidCount: number;
  outstandingUsd: number;
  paidUsd: number;
  outstandingRobux: number;
  paidRobux: number;
}

export interface InvoiceMutationResult {
  ok: boolean;
  message: string;
  invoice?: Invoice;
}

/** Sensible Robux -> USD fallback used when the tenant has no rate configured. */
export const DEFAULT_ROBUX_RATE = 80;

const INVOICE_SELECT =
  "id,tenant_id,project_id,number,amount_robux,rate_robux_per_usd,amount_usd,status,issued_at,paid_at,created_at";

interface InvoiceRow {
  id: string;
  tenant_id: string;
  project_id: string;
  number: string;
  amount_robux: number | string | null;
  rate_robux_per_usd: number | string | null;
  amount_usd: number | string | null;
  status: string | null;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

export function toInvoiceStatus(value: string | null | undefined): InvoiceStatus {
  switch (value) {
    case "sent":
    case "paid":
    case "void":
      return value;
    default:
      return "draft";
  }
}

export function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    number: row.number,
    amountRobux: asNumber(row.amount_robux),
    rateRobuxPerUsd: asNumber(row.rate_robux_per_usd),
    amountUsd: asNumber(row.amount_usd),
    status: toInvoiceStatus(row.status),
    issuedAt: row.issued_at ?? row.created_at ?? new Date().toISOString(),
    paidAt: row.paid_at,
    createdAt: row.created_at ?? row.issued_at ?? new Date().toISOString(),
  };
}

/**
 * Reads the tenant's configured Robux rate from `tenants.settings`. A few key
 * spellings are accepted so the UI works before settings has a dedicated field;
 * `DEFAULT_ROBUX_RATE` is used when none is present.
 */
export function readRobuxRate(
  settings: Record<string, unknown>,
  fallback: number = DEFAULT_ROBUX_RATE,
): number {
  for (const key of ["robux_rate", "rate_robux_per_usd", "robux_per_usd"]) {
    const raw = settings[key];
    const value =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

export async function getInvoices(projectId?: string): Promise<Invoice[]> {
  if (isDemoMode) return [];

  return withFallback<Invoice[]>(
    "getInvoices",
    async () => {
      const { supabase, tenantId } = await readContext();

      let query = supabase
        .from("invoices")
        .select(INVOICE_SELECT)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as unknown as InvoiceRow[]).map(mapInvoice);
    },
    () => [],
  );
}

const EMPTY_SUMMARY: InvoiceSummary = {
  totalCount: 0,
  outstandingCount: 0,
  paidCount: 0,
  outstandingUsd: 0,
  paidUsd: 0,
  outstandingRobux: 0,
  paidRobux: 0,
};

export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  if (isDemoMode) return { ...EMPTY_SUMMARY };

  return withFallback<InvoiceSummary>(
    "getInvoiceSummary",
    async () => {
      const invoices = await getInvoices();
      const summary: InvoiceSummary = { ...EMPTY_SUMMARY };

      for (const invoice of invoices) {
        summary.totalCount += 1;

        if (invoice.status === "paid") {
          summary.paidCount += 1;
          summary.paidUsd += invoice.amountUsd ?? 0;
          summary.paidRobux += invoice.amountRobux ?? 0;
        } else if (invoice.status !== "void") {
          summary.outstandingCount += 1;
          summary.outstandingUsd += invoice.amountUsd ?? 0;
          summary.outstandingRobux += invoice.amountRobux ?? 0;
        }
      }

      return summary;
    },
    () => ({ ...EMPTY_SUMMARY }),
  );
}

function workerConfig(): { url: string; token: string } | null {
  const url = process.env.INTERNAL_WORKER_URL;
  const token = process.env.INTERNAL_WORKER_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

async function callWorker(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
  const config = workerConfig();
  if (!config) return { ok: false, message: "Worker not configured" };

  try {
    const response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : null;
      console.error(`[invoices] worker ${path} failed`, response.status, data);
      return { ok: false, message: detail ?? "The worker rejected the request." };
    }

    return { ok: true, data: data ?? undefined };
  } catch (error) {
    console.error(`[invoices] worker ${path} failed`, error);
    return { ok: false, message: "Could not reach the worker." };
  }
}

function parseWorkerInvoice(data: Record<string, unknown> | undefined): Invoice | undefined {
  if (!data || typeof data.id !== "string") return undefined;
  return mapInvoice(data as unknown as InvoiceRow);
}

async function writeHumanAudit(params: {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  inputSummary: string;
  outputSummary: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("agent_audit_log").insert({
      tenant_id: params.tenantId,
      agent_name: `human:${params.userId}`,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      input_summary: params.inputSummary,
      output_summary: params.outputSummary,
      status: "success",
    });
    if (error) console.error("[invoices] audit write failed", error);
  } catch (error) {
    console.error("[invoices] audit write failed", error);
  }
}

export async function createInvoiceForProject(
  projectId: string,
  input: { rateRobuxPerUsd: number; amountRobux?: number },
): Promise<InvoiceMutationResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode - connect Supabase and the worker to create invoices." };
  }
  if (!projectId) return { ok: false, message: "Missing project." };

  const rate = Number(input.rateRobuxPerUsd);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, message: "Robux rate must be greater than zero." };
  }

  const amountRobux =
    input.amountRobux === undefined || input.amountRobux === null
      ? undefined
      : Number(input.amountRobux);
  if (amountRobux !== undefined && (!Number.isInteger(amountRobux) || amountRobux <= 0)) {
    return { ok: false, message: "Robux amount must be a positive whole number." };
  }

  try {
    const { tenantId, userId } = await readContext();

    const response = await callWorker("/invoice/create", {
      tenant_id: tenantId,
      project_id: projectId,
      rate_robux_per_usd: rate,
      ...(amountRobux === undefined ? {} : { amount_robux: amountRobux }),
    });

    if (!response.ok) {
      return { ok: false, message: response.message ?? "Could not create the invoice." };
    }

    const invoice = parseWorkerInvoice(response.data);
    if (!invoice) return { ok: false, message: "The worker returned an unexpected response." };

    await writeHumanAudit({
      tenantId,
      userId,
      action: "invoice_created",
      entityType: "invoice",
      entityId: invoice.id,
      inputSummary: `number=${invoice.number} rate=${rate}`,
      outputSummary: `amount_usd=${invoice.amountUsd ?? "unknown"}`,
    });

    return { ok: true, message: `Invoice ${invoice.number} created.`, invoice };
  } catch (error) {
    console.error("[invoices.createInvoiceForProject] failed", error);
    return { ok: false, message: "Could not create the invoice. Try again." };
  }
}

export async function markInvoicePaid(invoiceId: string): Promise<InvoiceMutationResult> {
  if (isDemoMode) {
    return { ok: false, message: "Demo mode - connect Supabase and the worker to mark invoices paid." };
  }
  if (!invoiceId) return { ok: false, message: "Missing invoice." };

  try {
    const { tenantId, userId } = await readContext();

    const response = await callWorker("/invoice/paid", {
      tenant_id: tenantId,
      invoice_id: invoiceId,
    });

    if (!response.ok) {
      return { ok: false, message: response.message ?? "Could not mark the invoice paid." };
    }

    const invoice = parseWorkerInvoice(response.data);
    if (!invoice) return { ok: false, message: "The worker returned an unexpected response." };

    await writeHumanAudit({
      tenantId,
      userId,
      action: "invoice_paid",
      entityType: "invoice",
      entityId: invoice.id,
      inputSummary: `number=${invoice.number}`,
      outputSummary: `amount_usd=${invoice.amountUsd ?? "unknown"}`,
    });

    return { ok: true, message: `Invoice ${invoice.number} marked paid.`, invoice };
  } catch (error) {
    console.error("[invoices.markInvoicePaid] failed", error);
    return { ok: false, message: "Could not mark the invoice paid. Try again." };
  }
}
