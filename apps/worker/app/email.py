"""Transactional email delivery through Resend.

The API key is resolved per tenant from Supabase Vault first (see
``app.secrets``) and then from the process environment. The key and the
recipient address are never logged. Sending is best-effort: failures return
``False`` and never raise, because email must not break the worker action that
triggered it.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.secrets import get_tenant_secret

logger = logging.getLogger("robloxops.email")

RESEND_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "RobloxOps <onboarding@resend.dev>"


async def send_email(
    db: Any,
    tenant_id: Any,
    *,
    to: str,
    subject: str,
    text: str,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Send one plain-text email. Returns ``True`` on a 2xx response.

    The caller may inject an ``httpx.AsyncClient`` so tests use
    ``httpx.MockTransport`` and stay offline.
    """
    try:
        api_key = await get_tenant_secret(db, tenant_id, "RESEND_API_KEY")
        if not api_key:
            api_key = os.environ.get("RESEND_API_KEY")
        if not api_key:
            return False

        payload = {
            "from": os.environ.get("RESEND_FROM") or DEFAULT_FROM,
            "to": [to],
            "subject": subject,
            "text": text,
        }
        headers = {"Authorization": f"Bearer {api_key}"}

        owns_client = client is None
        http = client or httpx.AsyncClient(timeout=10.0)
        try:
            response = await http.post(RESEND_URL, headers=headers, json=payload)
        finally:
            if owns_client:
                await http.aclose()

        if response.status_code < 200 or response.status_code >= 300:
            logger.warning(
                "email send failed (tenant=%s status=%s)",
                tenant_id,
                response.status_code,
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001 - email must not break callers
        logger.warning(
            "email send failed (tenant=%s): %s",
            tenant_id,
            type(exc).__name__,
        )
        return False
