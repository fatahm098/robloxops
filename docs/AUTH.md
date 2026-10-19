# Authentication & Tenant Provisioning

## Flow

1. **Sign up** (`/signup`) → server action `signUp` calls Supabase `auth.signUp`.
2. **Provision** → the same action calls the `provision_tenant(studio_name, slug)`
   RPC (SECURITY DEFINER, `granted to authenticated`). It:
   - creates a `tenants` row (`plan_id = 'starter'`, unique slug with `-N` suffix on collision),
   - inserts a `users` row for the caller with `role = 'owner'`,
   - stamps `auth.users.raw_app_meta_data -> tenant_id` — the custom JWT claim that
     RLS (`public.current_tenant_id()`) reads for tenant isolation.
3. Redirect to `/onboarding`.

Sign in (`/signin`) uses `signInWithPassword`. The OAuth code-exchange callback is
`/auth/callback` (used by Magic Link / future Discord/Google providers).

## Tenant claim

RLS trusts the `tenant_id` claim only. The RPC writes it directly so it works without
a Supabase Auth hook. If you prefer a hook, mirror the same `users` row + claim from a
post-confirmation trigger and keep the RPC for tests.

## Route protection

`middleware.ts` refreshes the session on every request. When Supabase env vars are
present, any non-public route without a user is redirected to `/login?next=<path>`.
Public paths: `/login`, `/signup`, `/auth/callback`, `/api/stripe/webhook`.

When env vars are **absent** (demo mode) the middleware passes through and the whole
app runs on mock data — login is disabled and shows a banner.

## Required env

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # only needed for server admin tasks
```

Disable email confirmation in the Supabase dashboard (Auth → Providers) for local/dev
so `provision_tenant` runs inside the same authenticated session.
