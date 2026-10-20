"""Tenant secret resolution tests (offline, fake DB)."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.secrets import SECRET_KEYS, get_tenant_secret, tenant_llm_overrides

TENANT_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Records RPC calls and returns a configurable secret value."""

    def __init__(self, *, secrets: dict[str, str] | None = None) -> None:
        self.secrets = secrets or {}
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.tenant: dict[str, Any] | None = {
            "id": TENANT_ID,
            "name": "Pixel Forge",
            "settings": {},
        }

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        self.calls.append((_norm(sql), args))
        assert "get_tenant_secret" in _norm(sql)
        return self.secrets.get(args[1])

    async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return self.tenant


class RaisingDB(FakeDB):
    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        raise RuntimeError("function public.get_tenant_secret does not exist")


@pytest.mark.asyncio
async def test_get_tenant_secret_calls_rpc_with_tenant_and_key() -> None:
    db = FakeDB(secrets={"LLM_API_KEY": "sk-tenant-1234"})

    value = await get_tenant_secret(db, TENANT_ID, "LLM_API_KEY")

    assert value == "sk-tenant-1234"
    sql, args = db.calls[0]
    assert "public.get_tenant_secret" in sql
    assert args == (str(TENANT_ID), "LLM_API_KEY")


@pytest.mark.asyncio
async def test_get_tenant_secret_returns_none_when_db_raises() -> None:
    db = RaisingDB()

    assert await get_tenant_secret(db, TENANT_ID, "LLM_API_KEY") is None


@pytest.mark.asyncio
async def test_get_tenant_secret_returns_none_for_missing_row() -> None:
    db = FakeDB()

    assert await get_tenant_secret(db, TENANT_ID, "LLM_API_KEY") is None


@pytest.mark.asyncio
async def test_tenant_llm_overrides_merges_vault_and_models() -> None:
    db = FakeDB(
        secrets={
            "LLM_API_KEY": "sk-tenant-1234",
            "LLM_BASE_URL": "https://llm.example.com/v1",
        }
    )
    db.tenant["settings"] = {
        "integrations": {
            "llm": {"models": {"model_fast": "fast-x", "model_mid": "mid-x"}}
        }
    }

    overrides = await tenant_llm_overrides(db, TENANT_ID)

    assert overrides == {
        "api_key": "sk-tenant-1234",
        "base_url": "https://llm.example.com/v1",
        "model_fast": "fast-x",
        "model_mid": "mid-x",
    }
    assert set(overrides) <= {"api_key", "base_url", "model_fast", "model_mid", "model_vision"}


@pytest.mark.asyncio
async def test_tenant_llm_overrides_accepts_flat_llm_settings() -> None:
    db = FakeDB()
    db.tenant["settings"] = {
        "integrations": {"llm": {"model_vision": "vision-x"}}
    }

    overrides = await tenant_llm_overrides(db, TENANT_ID)

    assert overrides == {"model_vision": "vision-x"}


@pytest.mark.asyncio
async def test_tenant_llm_overrides_omits_unset_keys() -> None:
    db = FakeDB(secrets={"LLM_BASE_URL": "https://llm.example.com/v1"})

    overrides = await tenant_llm_overrides(db, TENANT_ID)

    assert overrides == {"base_url": "https://llm.example.com/v1"}
    assert "api_key" not in overrides
    assert all(value is not None for value in overrides.values())


@pytest.mark.asyncio
async def test_tenant_llm_overrides_survives_tenant_lookup_failure() -> None:
    class NoTenantDB(FakeDB):
        async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
            raise RuntimeError("tenant lookup failed")

    db = NoTenantDB(secrets={"LLM_API_KEY": "sk-tenant-1234"})

    assert await tenant_llm_overrides(db, TENANT_ID) == {"api_key": "sk-tenant-1234"}


def test_secret_keys_match_migration_check_list() -> None:
    assert SECRET_KEYS == (
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
