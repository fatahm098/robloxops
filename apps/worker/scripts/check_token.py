"""Validate DISCORD_BOT_TOKEN without touching the database.

Usage (from apps/worker):
    .venv/Scripts/python scripts/check_token.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402

API = "https://discord.com/api/v10"

# View channels, send messages, embed links, attach files, read history,
# add reactions, manage/create public threads, send messages in threads.
PERMISSIONS = 326417632320


async def main() -> int:
    token = get_settings().discord_bot_token.strip()
    if not token:
        print("DISCORD_BOT_TOKEN kosong.")
        print("Isi baris DISCORD_BOT_TOKEN=... di apps/worker/.env, lalu jalankan ulang.")
        return 1

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{API}/users/@me", headers={"Authorization": f"Bot {token}"})

    if res.status_code != 200:
        print(f"Token TIDAK valid (HTTP {res.status_code}). Periksa kembali token di .env.")
        return 1

    me = res.json()
    print(f"Token VALID — bot: {me['username']} (id {me['id']})")
    print("")
    print("Invite bot ke server tes (butuh scope bot + applications.commands):")
    print(
        "https://discord.com/oauth2/authorize"
        f"?client_id={me['id']}&scope=bot%20applications.commands&permissions={PERMISSIONS}"
    )
    print("")
    print("Jangan lupa aktifkan 'Message Content Intent' di Developer Portal → Bot.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
