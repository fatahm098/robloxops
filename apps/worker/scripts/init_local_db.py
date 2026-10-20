"""Initialise a Postgres database for bot testing.

- Local Postgres: applies the Supabase shim (auth schema/roles) + core migrations.
- Supabase cloud: pass --cloud to skip the shim and use the real auth schema.

Then seeds one tenant, customer, project, brief, conversation and task.

Usage (from apps/worker):
    .venv/Scripts/python scripts/init_local_db.py --guild-id 123 --channels 456,789
    .venv/Scripts/python scripts/init_local_db.py --cloud --guild-id 123 --channels 456,789

Re-running is safe: migrations are skipped once public.tenants exists, and the
tenant row is upserted so you can update the guild/channel ids at any time.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = [
    "0001_init.sql",
    "0002_rls.sql",
    "0003_jobs.sql",
    "0006_jobs_queue_fixes.sql",
    "0008_revisions.sql",
    "0010_reports.sql",
    "0011_outbound_takeover.sql",
    "0012_tenant_secrets.sql",
    "0016_assistant_chat.sql",
    "0017_social_portfolio.sql",
]

TENANT_ID = "11111111-1111-4111-8111-111111111111"
CUSTOMER_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_ID = "33333333-3333-4333-8333-333333333333"

BRIEF = {
    "summary": "Cyber samurai katana with a glowing edge and matching scabbard.",
    "specs": [
        {"label": "Blade length", "value": "1.1 studs", "note": "R15 hand grip"},
        {"label": "Texture budget", "value": "2 × 1024px", "note": "PBR"},
    ],
    "palette": [
        {"label": "Neon edge", "hex": "#22D3EE"},
        {"label": "Steel", "hex": "#94A3B8"},
    ],
    "references": [],
    "directives": "Keep the silhouette readable at R15 scale.",
}


def _read(name: str) -> str:
    return (ROOT / "supabase" / "migrations" / name).read_text(encoding="utf-8")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--guild-id", default=None, help="Discord test guild id")
    parser.add_argument("--channels", default="", help="Comma-separated monitored channel ids")
    parser.add_argument("--cloud", action="store_true", help="Real Supabase: skip the local auth shim")
    args = parser.parse_args()

    channels = [c.strip() for c in args.channels.split(",") if c.strip()]

    conn = await asyncpg.connect(get_settings().database_url)

    try:
        initialized = await conn.fetchval("select to_regclass('public.tenants')")
        if initialized is None:
            if args.cloud:
                print("Applying core migrations to Supabase (real auth schema) ...")
                async with conn.transaction():
                    for name in MIGRATIONS:
                        await conn.execute(_read(name))
                        print(f"  applied {name}")
            else:
                print("Applying local auth shim + core migrations ...")
                bootstrap = (ROOT / "supabase" / "local" / "bootstrap.sql").read_text(encoding="utf-8")
                async with conn.transaction():
                    await conn.execute(bootstrap)
                    for name in MIGRATIONS:
                        await conn.execute(_read(name))
                        print(f"  applied {name}")
        else:
            print("Schema already present — skipping migrations.")

        settings = {
            "ai_paused": False,
            "tone": "friendly-professional",
            "timezone": "Asia/Jakarta",
            "monitored_channel_ids": channels,
        }

        await conn.execute(
            """
            insert into public.tenants (id, name, slug, discord_guild_id, plan_id, settings)
            values ($1, 'Apex UGC Studio', 'apex-ugc', $2, 'growth', $3::jsonb)
            on conflict (id) do update set
              discord_guild_id = excluded.discord_guild_id,
              settings = public.tenants.settings || excluded.settings,
              updated_at = now()
            """,
            TENANT_ID,
            args.guild_id,
            json.dumps(settings),
        )

        await conn.execute(
            """
            insert into public.tenant_counters (tenant_id, last_seq)
            values ($1, 105)
            on conflict (tenant_id) do update
              set last_seq = greatest(public.tenant_counters.last_seq, 105)
            """,
            TENANT_ID,
        )

        await conn.execute(
            """
            insert into public.customers
              (id, tenant_id, discord_user_id, discord_username, display_name, total_projects)
            values ($1, $2, '893104810293', 'kevroblox', '@KevRoblox', 1)
            on conflict (tenant_id, discord_user_id) do nothing
            """,
            CUSTOMER_ID,
            TENANT_ID,
        )

        await conn.execute(
            """
            insert into public.projects
              (id, tenant_id, customer_id, reference_code, title, status, project_type,
               price_usd, payment_status, max_revisions)
            values ($1, $2, $3, 'ROB-105', 'Cyber Samurai Katana & Scabbard', 'in_design',
                    'accessory', 240.00, 'paid', 2)
            on conflict (tenant_id, reference_code) do nothing
            """,
            PROJECT_ID,
            TENANT_ID,
            CUSTOMER_ID,
        )

        await conn.execute(
            """
            insert into public.briefs (project_id, tenant_id, structured_data, completeness_score)
            values ($1, $2, $3::jsonb, 72)
            on conflict (project_id) do nothing
            """,
            PROJECT_ID,
            TENANT_ID,
            json.dumps(BRIEF),
        )

        await conn.execute(
            """
            insert into public.conversations
              (tenant_id, project_id, customer_id, discord_channel_id, discord_message_id,
               direction, content, author_discord_id)
            values ($1, $2, $3, '999000111', '999000222', 'inbound',
                    'Hi! I want a cyber samurai katana with a glowing edge.', '893104810293')
            on conflict (tenant_id, discord_message_id) do nothing
            """,
            TENANT_ID,
            PROJECT_ID,
            CUSTOMER_ID,
        )

        await conn.execute(
            """
            insert into public.tasks (tenant_id, project_id, title, status, priority)
            select $1, $2, 'Model katana + scabbard', 'in_progress', 2
            where not exists (
              select 1 from public.tasks
              where tenant_id = $1 and project_id = $2 and title = 'Model katana + scabbard'
            )
            """,
            TENANT_ID,
            PROJECT_ID,
        )

        print("")
        print("Local DB ready.")
        print(f"  tenant:    {TENANT_ID}")
        print(f"  guild_id:  {args.guild_id or '(not set)'}")
        print(f"  channels:  {channels or '(none)'}")
        print(f"  project:   ROB-105 (status in_design)")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
