# Security

RobloxOps is multi-tenant: one deployment serves many studios, and every studio's
projects, customers, briefs and invoices live in the same Postgres database. The
security model exists to make sure studio A can never read or write studio B's data,
and that no credential in this repository can be used to reach production.

This document describes what is protected, how, and what to do when something leaks.

---

## 1. Threat model

| Threat | Impact | Control |
|---|---|---|
| A committed secret (service role key, Stripe key, bot token) | Full database access, billing actions, message sending | Nothing secret is committed; scanner runs before every push (§3, §4) |
| A logged-in user of tenant A calling the API for tenant B | Cross-tenant data leak | RLS on every table + tenant taken from the JWT, never from the request body (§5) |
| Anyone on the network calling the worker directly | Arbitrary writes with service-role power | Bearer token on every endpoint except `/health`; production refuses weak tokens (§6) |
| A prompt-injected or hallucinating LLM picking the tenant or deleting data | Data loss / cross-tenant write | Tools are a fixed allowlist, tenant comes from the session, no delete tools, writes are audited (§7) |
| The assistant sending a message to a customer on its own | Reputation damage, wrong commitments | Outbound messages are queued for human approval, never sent inline (§8) |
| Clickjacking / MIME sniffing / referrer leakage in the browser | Session theft, phishing | Security headers on every response (§9) |

---

## 2. Secret inventory

Everything below is a **real credential** and must exist only in the deployment
environment or in Supabase Vault — never in git, never in a screenshot, never in
a Discord message.

| Secret | Where it belongs | What it can do |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Web server env, worker env | **Bypasses RLS.** Full read/write on every tenant |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser bundle (public by design) | Anonymous access, limited by RLS |
| `DATABASE_URL` | Worker env | Direct Postgres, same power as the service role |
| `INTERNAL_WORKER_TOKEN` | Web + worker env | Drives every worker endpoint |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Web env | Charges, refunds, webhook forgery |
| `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` | Web / worker env | Bot impersonation, guild access |
| `LLM_API_KEY` | Worker env | Billed API usage |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | **Supabase Vault, per tenant** | Posts as the studio's X account |

The X/Twitter credentials are the only ones that are per-tenant. They are written
through the settings UI into Vault (`vault.create_secret` / `vault.update_secret`)
and read back by the worker at publish time; they never touch an env file.

**Rule of thumb:** a key that starts with `NEXT_PUBLIC_` is compiled into JavaScript
that anyone can read. Only the anon key may use that prefix, because RLS is what
protects the data. The service role key must never gain that prefix.

---

## 3. What is committed

Tracked:

- `apps/web/.env.example`, `apps/worker/.env.example` — templates with empty values.
- All source, migrations, docs, and tests.

Ignored (`.gitignore`):

- `.env`, `.env.*`, `*.env`, plus `!.env.example` negations so templates stay tracked.
- `*.pem`, `*.p8`, `*.p12`, `*.key`, `secrets/`, `.secrets/`.
- `*.tsbuildinfo`, `.next/`, `node_modules/`, `.venv/`, `__pycache__/`, build output.

Verify at any time:

```bash
git check-ignore -v apps/web/.env.local apps/worker/.env
git ls-files | grep -i env      # must only list *.env.example
```

---

## 4. Secret scanner

`scripts/scan-secrets.mjs` walks every tracked file (and, with `--history`, every
blob in every commit) looking for Supabase JWTs, Stripe keys, GitHub/Slack/Discord
tokens, Google and OpenAI keys, private key blocks, and Postgres DSNs with an
inline password. Placeholder values (`your-…`, `change-me`, `<…>`, `dev-…`) and
localhost DSNs are ignored so the examples stay clean.

```bash
npm run scan:secrets        # tracked files, fast — run before every commit
npm run scan:secrets:all    # tracked files + full git history — run before a push
```

Exit code `1` means stop. The history mode is the important one: it finds a key
that was committed and deleted in a later commit, which is exactly the case a
normal `git status` misses.

### If the scanner finds something

1. **Rotate first.** Treat the credential as compromised the moment it was written
   to disk, even if the commit was never pushed. Supabase → Settings → API → rotate
   the JWT secret (this invalidates both anon and service role keys). Stripe →
   Developers → API keys → roll. Discord → Bot → Reset Token.
2. Remove it from the working tree and replace it with an env read.
3. If it was committed, rewriting history is required *and* rotation is still
   required — assume the old value is public.
   ```bash
   git filter-repo --path path/to/file --invert-paths   # or BFG
   ```
4. Force-push the rewritten history, then ask GitHub Support to purge cached views.
5. Re-run `npm run scan:secrets:all` and confirm it passes.

---

## 5. Tenant isolation

**Every table in `public` has RLS enabled.** The policy shape is consistent:

```sql
tenant_id = current_tenant_id()
```

`current_tenant_id()` reads the tenant from the JWT — first the top-level
`tenant_id` claim, then `app_metadata.tenant_id` (migration `0018`), because
`provision_tenant()` writes the tenant into `raw_app_meta_data` and Supabase
exposes that as `app_metadata`. A user cannot edit `app_metadata` from the
browser, which is why it is a safe carrier; `user_metadata` would not be.

Consequences the code must respect:

- **The service role bypasses RLS entirely.** Every worker query therefore filters
  `tenant_id` explicitly (`require_tenant_id`), and the tenant always comes from
  the verified session or the Discord guild mapping — never from a model response,
  never from a request body.
- **The admin client is server-only.** `createAdminClient()` throws if
  `typeof window !== "undefined"`, so importing it into a client component fails
  loudly instead of shipping the key to the browser.
- **tRPC procedures are `protectedProcedure` / `tenantProcedure`.** The tenant is
  read from `ctx`, not from `input`.

To audit RLS after a migration:

```sql
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not relrowsecurity;
-- must return zero rows
```

---

## 6. Worker authentication

Every worker endpoint except `/health` sits behind a shared bearer token, compared
with `secrets.compare_digest` (constant time, no early exit). `/health` is
intentionally open so a load balancer can probe it, and it returns only
`status`, the LLM class name, and whether the DB is connected.

`APP_ENV=production` activates a startup guard (`app/config.py`):

- `INTERNAL_WORKER_TOKEN` must not be the development default and must be at least
  24 characters.
- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` must be non-empty.

If any of those fail the worker refuses to boot rather than running wide open.

Generate a token:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Set the same value in the web env and the worker env. Rotate by deploying both
sides together; there is a brief window where the old token is rejected.

---

## 7. LLM safety

The assistant can read studio data and mutate it, so the model is treated as an
untrusted caller.

- **Fixed tool allowlist** (`app/assistant_tools.py`): nine tools. `run_tool()`
  rejects any argument that is not declared in the tool's JSON schema, so the
  model cannot smuggle an extra field into a query.
- **No delete tools.** Nothing the model can call removes a row. The worst case is
  a project created with the wrong name, which a human deletes.
- **Tenant is not a parameter.** No tool accepts `tenant_id`; the implementation
  closes over the session's tenant.
- **Every call is audited** as `tool:<name>` with the summarised arguments, so the
  audit table shows exactly what the model did.
- **Inbound text is sanitised and capped** at 4,000 characters before it reaches
  the prompt, which limits injection payload size.
- **Structured output only** for the pipeline agents: a validation failure escalates
  to a human, it never falls back to a write.
- **`settings.ai_paused`** is checked before automated actions.

The model never sees a service role key, a password, or another tenant's rows —
the context snapshot is built from queries already scoped to the session tenant.

---

## 8. Approval gates

Anything that leaves the building passes through `outbound_messages` with status
`pending`. The assistant's `draft_customer_message` tool only inserts a row; it
does not send. A human approves in the UI, and only then does the worker call
Discord or email. The same applies to portfolio posts: `portfolio_posts` starts
`queued`, the caption is editable, and publishing requires an explicit click.

`reject` marks the row `rejected` and keeps it for the audit trail. Nothing is
hard-deleted.

---

## 9. Web hardening

`apps/web/next.config.mjs` sets on every response:

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops MIME confusion attacks |
| `X-Frame-Options` | `DENY` | No embedding in a hostile frame |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No path leakage to third parties |
| `Permissions-Policy` | camera/mic/geo/payment/usb disabled | Removes APIs the app never uses |
| `Content-Security-Policy` | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` | Clickjacking and plugin injection, without touching script loading |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the browsing context |
| `Strict-Transport-Security` | 2 years, `includeSubDomains` | Production only |

`poweredByHeader: false` drops the `X-Powered-By: Next.js` fingerprint.

`src/middleware.ts` redirects unauthenticated requests to `/login` for every route
except `/login`, `/signup`, `/auth/callback` and the Stripe webhook. It validates
the session with `supabase.auth.getUser()` (a server round-trip), not by trusting
the cookie contents. The Stripe webhook is public because it authenticates with a
signature instead.

---

## 10. Production checklist

- [ ] `APP_ENV=production` on the worker, with a random `INTERNAL_WORKER_TOKEN`.
- [ ] Supabase Auth → Email provider enabled, "Confirm email" on, signups limited to
      invited studios if the product is not public yet.
- [ ] Rotate the anon and service role keys if either was ever pasted into a chat,
      an issue, or a screenshot.
- [ ] Stripe in live mode with the webhook secret from the dashboard, not from a test.
- [ ] `npm run scan:secrets:all` passes.
- [ ] RLS audit query in §5 returns zero rows.
- [ ] Backups enabled on the Supabase project.
- [ ] `npm run typecheck` and `npm run build` pass.

---

## 11. Reporting

This is a private project without a bug bounty. If you find a vulnerability, open
a private security advisory on the repository rather than a public issue, and do
not include live credentials in the report.
