import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { PlanId } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { planForPrice } from "@/lib/plans";

export const runtime = "nodejs";

function extractPriceId(obj: Record<string, unknown>): string | undefined {
  const items = (obj["items"] as { data?: Array<{ price?: { id?: string } }> })?.data;
  return items?.[0]?.price?.id;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency: a redelivered event is a no-op.
  const { data: existing } = await admin
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true });
  }

  const type = event.type;
  // Stripe's event object is a wide union; treat it loosely for metadata access.
  const eventObj = event.data.object as {
    metadata?: Record<string, string> | null;
    id?: string;
    current_period_end?: number;
  };
  const obj = event.data.object as unknown as Record<string, unknown>;
  const tenantId = eventObj.metadata?.tenant_id;

  const handled =
    type.startsWith("customer.subscription.") || type === "checkout.session.completed";

  if (handled && tenantId) {
    const metaPlan = eventObj.metadata?.plan as PlanId | undefined;
    const plan = metaPlan ?? planForPrice(extractPriceId(obj));
    if (plan) {
      const periodEnd = eventObj.current_period_end;
      await admin
        .from("tenants")
        .update({
          plan_id: plan,
          current_period_end:
            typeof periodEnd === "number"
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          stripe_subscription_id: String(eventObj.id ?? ""),
        })
        .eq("id", tenantId);
    }
  }

  if (tenantId) {
    await admin.from("billing_events").insert({
      tenant_id: tenantId,
      stripe_event_id: event.id,
      type,
      payload: obj,
    });
  }

  return NextResponse.json({ received: true });
}
