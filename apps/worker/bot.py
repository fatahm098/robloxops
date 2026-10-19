"""Discord bot: monitors tenant channels, enqueues intake jobs, exposes slash commands.

Run separately from the API container:

    python bot.py

If DISCORD_BOT_TOKEN or DATABASE_URL is missing the bot logs a clear message and
exits 0 so local dev and CI do not fail.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from dataclasses import dataclass
from typing import Any

import asyncpg
import discord
import httpx
from discord import app_commands

from app.config import Settings, get_settings
from app.db import json_dict
from app.queue import enqueue_job

logger = logging.getLogger("robloxops.bot")

MAX_THREAD_NAME = 100
THREAD_ARCHIVE_MINUTES = 10080  # 7 days


@dataclass(slots=True)
class ChannelTenant:
    tenant_id: Any
    name: str
    settings: dict[str, Any]


class BotRepo:
    """Small read/write surface used by the bot. Every query carries tenant_id."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def tenant_for_guild(self, guild_id: int) -> ChannelTenant | None:
        row = await self.pool.fetchrow(
            "SELECT id, name, settings FROM tenants WHERE discord_guild_id = $1",
            str(guild_id),
        )
        if row is None:
            return None
        return ChannelTenant(row["id"], str(row["name"]), json_dict(row["settings"]))

    @staticmethod
    def monitored_channels(settings: dict[str, Any]) -> set[str]:
        for key in ("monitored_channel_ids", "monitored_channels"):
            value = settings.get(key)
            if isinstance(value, list):
                return {str(item) for item in value}
        intake = settings.get("intake")
        if isinstance(intake, dict) and isinstance(intake.get("channel_ids"), list):
            return {str(item) for item in intake["channel_ids"]}
        return set()

    async def enqueue(self, tenant_id: Any, kind: str, payload: dict[str, Any]) -> None:
        await enqueue_job(self.pool, tenant_id, kind, payload)

    async def link_thread(self, tenant_id: Any, project_id: Any, thread_id: str) -> None:
        await self.pool.execute(
            """
            UPDATE projects
            SET discord_thread_id = $3, updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            project_id,
            thread_id,
        )

    async def find_project(
        self, tenant_id: Any, reference: str | None, discord_user_id: str
    ) -> Any | None:
        if reference:
            return await self.pool.fetchrow(
                """
                SELECT p.id, p.reference_code, p.title, p.status, p.created_at
                FROM projects p
                WHERE p.tenant_id = $1 AND p.reference_code = $2
                """,
                tenant_id,
                reference.strip().upper(),
            )
        return await self.pool.fetchrow(
            """
            SELECT p.id, p.reference_code, p.title, p.status, p.created_at
            FROM projects p
            JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
            WHERE p.tenant_id = $1 AND c.discord_user_id = $2
            ORDER BY p.created_at DESC
            LIMIT 1
            """,
            tenant_id,
            discord_user_id,
        )

    async def find_brief(self, tenant_id: Any, project_id: Any) -> Any | None:
        return await self.pool.fetchrow(
            """
            SELECT structured_data, completeness_score
            FROM briefs
            WHERE tenant_id = $1 AND project_id = $2
            """,
            tenant_id,
            project_id,
        )


class RobloxOpsBot(discord.Client):
    def __init__(self, settings: Settings, repo: BotRepo) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.guild_messages = True
        super().__init__(intents=intents)
        self.settings = settings
        self.repo = repo
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        self._register_commands()

    async def on_ready(self) -> None:
        logger.info("logged in as %s (guilds=%d)", self.user, len(self.guilds))
        try:
            await self.tree.sync()
        except discord.HTTPException as exc:
            logger.warning("slash command sync failed: %s", exc)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or message.guild is None:
            return
        if not isinstance(message.channel, (discord.TextChannel, discord.Thread)):
            return

        tenant = await self.repo.tenant_for_guild(message.guild.id)
        if tenant is None:
            return

        monitored = self.repo.monitored_channels(tenant.settings)
        in_thread = isinstance(message.channel, discord.Thread)
        if in_thread:
            parent_id = str(message.channel.parent_id or "")
            if parent_id not in monitored:
                return
            kind = "conversation_continue"
        else:
            if str(message.channel.id) not in monitored:
                return
            kind = "intake"

        payload: dict[str, Any] = {
            "tenant_id": str(tenant.tenant_id),
            "guild_id": str(message.guild.id),
            "channel_id": str(message.channel.id),
            "message_id": str(message.id),
            "author_id": str(message.author.id),
            "author_name": message.author.display_name,
            "content": message.content,
            "thread_id": str(message.channel.id) if in_thread else None,
        }

        # Fast path: immediate intent + reference so we can open a thread now.
        result = await self._call_worker("/intake" if kind == "intake" else "/conversation/continue", payload)

        # Durable path: the queued copy is deduped on message_id by the worker.
        try:
            await self.repo.enqueue(tenant.tenant_id, kind, payload)
        except Exception as exc:  # noqa: BLE001 - queue outage must not kill the gateway
            logger.error("failed to enqueue %s job: %s", kind, exc)

        if result is None:
            return

        if kind == "intake" and result.get("status") == "created" and result.get("intent") == "commission_request":
            await self._open_thread(message, tenant, result)
        elif kind == "conversation_continue" and result.get("reply"):
            await message.channel.send(result["reply"])

    async def _open_thread(
        self, message: discord.Message, tenant: ChannelTenant, result: dict[str, Any]
    ) -> None:
        reply = result.get("reply") or f"Thanks! Reference {result.get('reference_code', '')}."
        reference = result.get("reference_code") or "Commission"
        try:
            thread = await message.create_thread(
                name=f"{reference} · {message.author.display_name}"[:MAX_THREAD_NAME],
                auto_archive_duration=THREAD_ARCHIVE_MINUTES,
            )
            await thread.send(reply)
            await self.repo.link_thread(tenant.tenant_id, result["project_id"], str(thread.id))
        except (discord.HTTPException, KeyError) as exc:
            logger.warning("thread creation failed, replying in channel: %s", exc)
            await message.channel.send(reply)

    async def _call_worker(self, path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        url = f"{self.settings.discord_worker_url.rstrip('/')}{path}"
        headers = {"Authorization": f"Bearer {self.settings.internal_worker_token}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
            if response.status_code >= 400:
                logger.warning("worker %s returned %s", path, response.status_code)
                return None
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("worker %s unreachable (%s); job stays queued", path, exc)
            return None

    # ------------------------------------------------------------------ #
    # Slash commands
    # ------------------------------------------------------------------ #

    def _register_commands(self) -> None:
        @self.tree.command(name="status", description="Show the status of a commission")
        @app_commands.describe(reference="Reference code, e.g. ROB-260001 (optional)")
        async def status_cmd(
            interaction: discord.Interaction, reference: str | None = None
        ) -> None:
            await interaction.response.defer(ephemeral=True)
            tenant = await self._tenant_or_reply(interaction)
            if tenant is None:
                return
            project = await self.repo.find_project(
                tenant.tenant_id, reference, str(interaction.user.id)
            )
            if project is None:
                await interaction.followup.send("No project found.", ephemeral=True)
                return
            embed = discord.Embed(
                title=f"{project['reference_code']} · {project['title'] or 'Commission'}",
                description=f"Status: **{project['status']}**",
            )
            if project["created_at"] is not None:
                embed.add_field(
                    name="Opened",
                    value=discord.utils.format_dt(project["created_at"], "R"),
                    inline=False,
                )
            await interaction.followup.send(embed=embed, ephemeral=True)

        @self.tree.command(name="brief", description="Show the collected brief")
        @app_commands.describe(reference="Reference code, e.g. ROB-260001 (optional)")
        async def brief_cmd(
            interaction: discord.Interaction, reference: str | None = None
        ) -> None:
            await interaction.response.defer(ephemeral=True)
            tenant = await self._tenant_or_reply(interaction)
            if tenant is None:
                return
            project = await self.repo.find_project(
                tenant.tenant_id, reference, str(interaction.user.id)
            )
            if project is None:
                await interaction.followup.send("No project found.", ephemeral=True)
                return
            brief_row = await self.repo.find_brief(tenant.tenant_id, project["id"])
            if brief_row is None:
                await interaction.followup.send("No brief collected yet.", ephemeral=True)
                return

            data = json_dict(brief_row["structured_data"])
            lines = [
                f"**{key.replace('_', ' ').title()}:** {value}"
                for key, value in data.items()
                if value not in (None, "", [], {})
            ]
            embed = discord.Embed(
                title=f"Brief — {project['reference_code']}",
                description="\n".join(lines) or "Brief is still empty.",
            )
            embed.set_footer(text=f"Completeness: {brief_row['completeness_score']}%")
            await interaction.followup.send(embed=embed, ephemeral=True)

        @self.tree.command(name="help", description="How RobloxOps works")
        async def help_cmd(interaction: discord.Interaction) -> None:
            embed = discord.Embed(
                title="RobloxOps",
                description=(
                    "Post your commission request in the intake channel and the studio "
                    "will collect the brief automatically.\n\n"
                    "**Commands**\n"
                    "`/status [reference]` — project status\n"
                    "`/brief [reference]` — collected brief\n"
                    "`/help` — this message"
                ),
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)

        self.tree.add_command(status_cmd)
        self.tree.add_command(brief_cmd)
        self.tree.add_command(help_cmd)

    async def _tenant_or_reply(self, interaction: discord.Interaction) -> ChannelTenant | None:
        if interaction.guild_id is None:
            await interaction.followup.send("Use this in a server.", ephemeral=True)
            return None
        tenant = await self.repo.tenant_for_guild(interaction.guild_id)
        if tenant is None:
            await interaction.followup.send(
                "This server is not connected to RobloxOps.", ephemeral=True
            )
        return tenant


async def _run(settings: Settings) -> None:
    pool = await asyncpg.create_pool(dsn=settings.database_url, min_size=1, max_size=5)
    bot = RobloxOpsBot(settings, BotRepo(pool))
    try:
        await bot.start(settings.discord_bot_token)
    finally:
        await bot.close()
        await pool.close()


def main() -> int:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if not settings.discord_bot_token:
        logger.error(
            "DISCORD_BOT_TOKEN is not set — bot disabled. Copy .env.example to .env "
            "and set the token, then restart."
        )
        return 0
    if not settings.database_url:
        logger.error("DATABASE_URL is not set — bot disabled.")
        return 0

    try:
        asyncio.run(_run(settings))
    except discord.LoginFailure:
        logger.error("Discord rejected DISCORD_BOT_TOKEN — bot disabled.")
        return 0
    except discord.PrivilegedIntentsRequired:
        logger.error("Message Content intent is not enabled in the Discord developer portal.")
        return 0
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
