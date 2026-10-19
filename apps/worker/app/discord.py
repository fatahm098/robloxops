"""Minimal Discord REST sender.

The bot token is read from settings (or passed explicitly for tests) and is
never included in error messages. Callers can inject an ``httpx.AsyncClient``
so tests use ``httpx.MockTransport`` and stay network-free.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings

DISCORD_API = "https://discord.com/api/v10"
MAX_CONTENT_CHARS = 2000


class DiscordSendError(RuntimeError):
    """Raised when a Discord message cannot be sent."""


def resolve_token(token: str | None = None) -> str:
    """Return the configured bot token or raise a token-free error."""
    resolved = token or get_settings().discord_bot_token
    if not resolved or not str(resolved).strip():
        raise DiscordSendError("DISCORD_BOT_TOKEN is not configured")
    return str(resolved).strip()


async def send_message(
    channel_id: str,
    content: str,
    *,
    token: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Post one message to a Discord channel/thread and return the JSON body.

    Raises ``DiscordSendError`` for invalid input, a missing token, transport
    errors, or any non-2xx response. The response body and token are never
    surfaced in the exception text.
    """
    if not isinstance(channel_id, str) or not channel_id or not channel_id.isdigit():
        raise DiscordSendError("channel_id must be a non-empty numeric string")
    if not isinstance(content, str) or not content.strip():
        raise DiscordSendError("content must be a non-empty string")
    if len(content) > MAX_CONTENT_CHARS:
        raise DiscordSendError(
            f"content exceeds Discord's {MAX_CONTENT_CHARS} character limit"
        )

    bot_token = resolve_token(token)
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    headers = {"Authorization": f"Bot {bot_token}"}
    payload = {"content": content, "allowed_mentions": {"parse": []}}

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await http.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise DiscordSendError("discord send failed: request error") from exc
    finally:
        if owns_client:
            await http.aclose()

    if response.status_code < 200 or response.status_code >= 300:
        raise DiscordSendError(f"discord send failed: {response.status_code}")

    return response.json()
