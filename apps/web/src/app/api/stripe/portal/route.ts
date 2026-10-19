import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { isDemoMode } from "@/lib/data";
import { createClient, getAuthSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForTenant, getAppUrl } from "@/lib/stripe";

export async function POST() {
  if (isDemoMode) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const session = await getAuthSession(supabase);
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", session.tenantId)
    .single();

  const stripeCustomerId = tenant?.stripe_customer_id as string | null;
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "No billing customer yet." }, { status: 400 });
  }

  let stripe: Stripe;
  try {
    stripe = await getStripeForTenant(session.tenantId);
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${getAppUrl()}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
