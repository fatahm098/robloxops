"""LLM resolver tests: default FakeLLM, tenant overrides, factory kwargs."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.config import Settings
from app.llm import FakeLLM, OpenAICompatibleLLM, build_llm_for_tenant, get_llm

TENANT_ID = uuid4()


def _settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "llm_api_key": "",
        "llm_base_url": "https://api.openai.com/v1",
        "llm_model_fast": "fast-default",
        "llm_model_mid": "mid-default",
        "llm_model_vision": "vision-default",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


class FakeDB:
    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        return None

    async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
        return {"id": tenant_id, "settings": {}}


def test_get_llm_without_key_returns_fake() -> None:
    assert isinstance(get_llm(_settings()), FakeLLM)


def test_get_llm_with_settings_key_returns_real_client() -> None:
    llm = get_llm(_settings(llm_api_key="sk-env"))

    assert isinstance(llm, OpenAICompatibleLLM)


def test_get_llm_tenant_key_overrides_empty_settings() -> None:
    llm = get_llm(_settings(), api_key="sk-tenant")

    assert isinstance(llm, OpenAICompatibleLLM)
    assert llm._api_key == "sk-tenant"


def test_get_llm_applies_model_and_base_url_overrides() -> None:
    llm = get_llm(
        _settings(llm_api_key="sk-env"),
        api_key="sk-tenant",
        base_url="https://llm.example.com/v1/",
        model_fast="fast-tenant",
        model_mid="mid-tenant",
        model_vision="vision-tenant",
    )

    assert isinstance(llm, OpenAICompatibleLLM)
    assert llm._base_url == "https://llm.example.com/v1"
    assert llm._model_fast == "fast-tenant"
    assert llm._model_mid == "mid-tenant"
    assert llm._model_vision == "vision-tenant"


def test_get_llm_keeps_defaults_for_unset_overrides() -> None:
    llm = get_llm(_settings(llm_api_key="sk-env"), model_mid="mid-tenant")

    assert isinstance(llm, OpenAICompatibleLLM)
    assert llm._base_url == "https://api.openai.com/v1"
    assert llm._model_fast == "fast-default"
    assert llm._model_mid == "mid-tenant"
    assert llm._model_vision == "vision-default"


@pytest.mark.asyncio
async def test_build_llm_for_tenant_passes_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    async def fake_overrides(db: Any, tenant_id: Any) -> dict[str, Any]:
        captured["tenant_id"] = tenant_id
        return {
            "api_key": "sk-tenant",
            "base_url": "https://llm.example.com/v1",
            "model_fast": "fast-tenant",
        }

    monkeypatch.setattr("app.secrets.tenant_llm_overrides", fake_overrides)

    llm = await build_llm_for_tenant(FakeDB(), TENANT_ID, _settings())

    assert captured["tenant_id"] == TENANT_ID
    assert isinstance(llm, OpenAICompatibleLLM)
    assert llm._api_key == "sk-tenant"
    assert llm._base_url == "https://llm.example.com/v1"
    assert llm._model_fast == "fast-tenant"


@pytest.mark.asyncio
async def test_build_llm_for_tenant_falls_back_to_fake() -> None:
    llm = await build_llm_for_tenant(FakeDB(), TENANT_ID, _settings())

    assert isinstance(llm, FakeLLM)
