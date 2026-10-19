# Billing (Stripe)

## Plans

| Plan    | Price | Commissions/mo | AI credits | Discord servers |
| ------- | ----- | -------------- | ---------- | --------------- |
| Starter | $19   | 10             | 500        | 1               |
| Growth  | $49   | 40             | 2,500      | 3               |
| Pro     | $99   | 150            | 10,000     | 10              |

Defined in `src/lib/plans.ts` (`BillingPlan`).

## Flow

- **Checkout** `POST /api/stripe/checkout` → ensures a Stripe customer (stored on
  `tenants.stripe_customer_id`), creates a subscription Checkout Session for the
  plan's price id, returns `{ url }`. Prices come from env
  (`STRIPE_PRICE_STARTER/_GROWTH/_PRO`); a missing price returns 400.
- **Portal** `POST /api/stripe/portal` → Billing Portal session for the stored
  customer, returns `{ url }`.
- **Webhook** `POST /api/stripe/webhook` → verifies `STRIPE_WEBHOOK_SECRET`, handles
  `customer.subscription.*` and `checkout.session.completed`, maps price → plan, updates
  `tenants.plan_id` + `current_period_end` + `stripe_subscription_id`, and appends to
  `billing_events` (idempotent on `stripe_event_id`).

All routes require an authenticated session (middleware) except the webhook, which is
public but signature-verified. Every route degrades gracefully without Stripe env
(demo mode) — the UI shows a disabled state and a banner.

## Required env

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PRO
NEXT_PUBLIC_APP_URL
```

## DB

`0005_billing.sql`: `tenants.current_period_end` and `billing_events`
(`stripe_event_id` unique, tenant RLS read, service-role write).
