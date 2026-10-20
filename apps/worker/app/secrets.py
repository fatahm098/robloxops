"""Per-tenant integration secrets.

Secret values live in Supabase Vault; this module only calls the definer RPC
``public.get_tenant_secret``. Any database error (including the stub that raises
when Vault is not installed) is treated as "no tenant override" so the worker
degrades to the process-wide environment configuration.

Never log secret values: only key names and whether a value was found.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("robloxops.secrets")

SECRET_KEYS: tuple[str, ...] = (
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "DISCORD_BOT_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "X_API_KEY",
    "X_API_SECRET",
    "X_ACCESS_TOKEN",
    "X_ACCESS_SECRET",
)

GET_SECRET_SQL = "select public.get_tenant_secret($1, $2)"


async def get_tenant_secret(db: Any, tenant_id: Any, key_name: str) -> str | None:
    """Return a tenant secret value, or ``None`` when unset/unavailable."""
    try:
        value = await db.fetchval(
            tenant_id, GET_SECRET_SQL, str(tenant_id), key_name
        )
    except Exception as exc:  # noqa: BLE001 - missing Vault/RPC must not break the worker
        logger.debug(
            "tenant secret lookup failed (tenant=%s key=%s): %s",
            tenant_id,
            key_name,
            type(exc).__name__,
        )
        return None
    if value is None:
        return None
    value = str(value)
    return value if value else None


def _settings_dict(tenant: Any) -> dict[str, Any]:
    if not isinstance(tenant, dict):
        return {}
    settings = tenant.get("settings")
    if isinstance(settings, dict):
        return settings
    return {}


async def tenant_llm_overrides(db: Any, tenant_id: Any) -> dict[str, Any]:
    """Collect the tenant's LLM overrides from Vault + ``tenants.settings``.

    Only keys that are actually set are returned, so ``get_llm`` can fall back
    to the process-wide defaults for everything else.
    """
    overrides: dict[str, Any] = {}

    api_key = await get_tenant_secret(db, tenant_id, "LLM_API_KEY")
    if api_key:
        overrides["api_key"] = api_key

    base_url = await get_tenant_secret(db, tenant_id, "LLM_BASE_URL")
    if base_url:
        overrides["base_url"] = base_url

    try:
        tenant = await db.fetch_tenant(tenant_id)
    except Exception as exc:  # noqa: BLE001 - metadata is optional
        logger.debug(
            "tenant settings lookup failed (tenant=%s): %s",
            tenant_id,
            type(exc).__name__,
        )
        tenant = None

    integrations = _settings_dict(tenant).get("integrations")
    llm_settings = integrations.get("llm") if isinstance(integrations, dict) else None
    if isinstance(llm_settings, dict):
        # Accept both the flat shape and a nested ``models`` object.
        models = llm_settings.get("models")
        source = models if isinstance(models, dict) else llm_settings
        for field in ("model_fast", "model_mid", "model_vision"):
            value = source.get(field)
            if not value:
                value = llm_settings.get(field)
            if isinstance(value, str) and value.strip():
                overrides[field] = value.strip()

    return overrides
