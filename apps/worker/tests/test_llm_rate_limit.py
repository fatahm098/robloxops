"""A 429 must never be retried, and a hard quota must stop further calls.

The production log that motivated this file:

    08:08:06 POST .../chat/completions 429 Too Many Requests
    08:08:07 POST .../chat/completions 429 Too Many Requests

One user click produced two provider requests because the client retried the
rate limit immediately. Retrying a daily quota cannot succeed, and every attempt
still counts against the limit.
"""

from __future__ import annotations

import httpx
import pytest

from app import llm as llm_module
from app.config import Settings
from app.llm import LLMError, LLMRateLimited, OpenAICompatibleLLM

QUOTA_BODY = (
    '{"error":{"code":429,"message":"You exceeded your current quota","status":'
    '"RESOURCE_EXHAUSTED","details":[{"reason":"RATE_LIMIT_EXCEEDED",'
    '"violations":[{"quotaId":"generate_content_free_tier_requests"}]}]}}'
)


def build() -> OpenAICompatibleLLM:
    settings = Settings(
        _env_file=None,
        llm_api_key="test-key",
        llm_base_url="https://llm.test/v1",
    )
    return OpenAICompatibleLLM(settings)


def install_transport(monkeypatch, handler) -> None:
    """Route the client's httpx calls through a mock handler."""
    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_client(*args, **kwargs)

    monkeypatch.setattr(llm_module.httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_quota_429_makes_exactly_one_request(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(429, text=QUOTA_BODY)

    install_transport(monkeypatch, handler)
    client = build()

    with pytest.raises(LLMRateLimited):
        await client._post_chat({"model": "m", "messages": []})

    assert len(seen) == 1, f"expected one provider call, saw {len(seen)}"
    assert client._blocked_until > 0, "a hard quota must arm the cooldown"


@pytest.mark.asyncio
async def test_calls_short_circuit_during_cooldown(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(429, text=QUOTA_BODY)

    install_transport(monkeypatch, handler)
    client = build()

    for _ in range(3):
        with pytest.raises(LLMRateLimited):
            await client._post_chat({"model": "m", "messages": []})

    assert len(seen) == 1, "cooldown must prevent further provider calls"


@pytest.mark.asyncio
async def test_burst_429_without_quota_markers_does_not_block(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(429, text='{"error":{"message":"slow down"}}')

    install_transport(monkeypatch, handler)
    client = build()

    with pytest.raises(LLMRateLimited):
        await client._post_chat({"model": "m", "messages": []})
    assert client._blocked_until == 0.0

    with pytest.raises(LLMRateLimited):
        await client._post_chat({"model": "m", "messages": []})
    assert len(seen) == 2, "a short burst should be retried on the next call"


@pytest.mark.asyncio
async def test_server_errors_are_still_retried(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(503, text="upstream unavailable")

    install_transport(monkeypatch, handler)
    client = build()

    with pytest.raises(LLMError):
        await client._post_chat({"model": "m", "messages": []})

    assert len(seen) == 2, "5xx keeps the single retry"


@pytest.mark.asyncio
async def test_client_errors_fail_fast(monkeypatch):
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(400, text="bad request")

    install_transport(monkeypatch, handler)
    client = build()

    with pytest.raises(LLMError):
        await client._post_chat({"model": "m", "messages": []})

    assert len(seen) == 1
