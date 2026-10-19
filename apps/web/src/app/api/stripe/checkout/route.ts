import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { PlanId } from "@/lib/types";
import { isDemoMode } from "@/lib/data";
import { createClient, getAuthSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForTenant, getAppUrl } from "@/lib/stripe";
import { priceIdFor } from "@/lib/plans";

const VALID: PlanId[] = ["starter", "growth", "pro"];

export async function POST(request: Request) {
  if (isDemoMode) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan;
  if (!plan || !VALID.includes(plan as PlanId)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const priceId = priceIdFor(plan as PlanId);
  if (!priceId) {
    return NextResponse.json(
      { error: "Missing Stripe price id for this plan (check env)." },
      { status: 400 },
    );
  }

  let stripe: Stripe;
  try {
    stripe = await getStripeForTenant(session.tenantId);
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id, name")
    .eq("id", session.tenantId)
    .single();

  let stripeCustomerId = (tenant?.stripe_customer_id as string | null) ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.email ?? undefined,
      name: (tenant?.name as string) ?? undefined,
      metadata: { tenant_id: session.tenantId },
    });
    stripeCustomerId = customer.id;
    await admin
      .from("tenants")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", session.tenantId);
  }

  const checkout = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${getAppUrl()}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/billing`,
    metadata: { tenant_id: session.tenantId, plan },
    subscription_data: { metadata: { tenant_id: session.tenantId, plan } },
  });

  return NextResponse.json({ url: checkout.url });
}
