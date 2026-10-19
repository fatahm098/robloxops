"""Outbound queue / delivery / approval tests.

Network-free: Discord is replaced with ``httpx.MockTransport`` and the database
with a shape-routing ``FakeDB`` that asserts every call is tenant-scoped.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.discord import DiscordSendError, send_message
from app.outbound import (
    approve_outbound,
    default_body,
    reject_outbound,
    send_manual_reply,
    send_or_queue,
)

TENANT_ID = uuid4()
OTHER_TENANT_ID = uuid4()
PROJECT_ID = uuid4()
CUSTOMER_ID = uuid4()


@pytest.fixture(autouse=True)
def _discord_token(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Configure a throwaway bot token so delivery tests never hit real settings."""
    from app.config import get_settings

    monkeypatch.setenv("DISCORD_BOT_TOKEN", "test-token")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


def _project(thread_id: str | None = "123456789") -> dict[str, Any]:
    return {
        "id": PROJECT_ID,
        "reference_code": "ROB-7",
        "title": "Neon Hoodie",
        "status": "in_design",
        "discord_thread_id": thread_id,
        "customer_id": CUSTOMER_ID,
    }


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self, *, tenant: dict[str, Any] | None = None) -> None:
        self.tenant = tenant or {"id": TENANT_ID, "name": "Studio", "settings": {}}
        self.projects: dict[Any, dict[str, Any]] = {PROJECT_ID: _project()}
        self.outbound: dict[Any, dict[str, Any]] = {}
        self.conversations: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        self.calls.append((s, args))

        if "from projects" in s:
            return self.projects.get(args[1])

        if "insert into outbound_messages" in s:
            _, project_id, channel_id, kind, body = args
            row = {
                "id": uuid4(),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "channel_id": channel_id,
                "kind": kind,
                "body": body,
                "status": "pending",
                "approved_by": None,
                "sent_at": None,
                "external_message_id": None,
                "error": None,
                "created_at": "2026-10-19T00:00:00Z",
            }
            self.outbound[row["id"]] = row
            return dict(row)

        if s.startswith("select") and "from outbound_messages" in s:
            row = self.outbound.get(args[1])
            return dict(row) if row is not None else None

        if "update outbound_messages" in s:
            outbound_id = args[1]
            row = self.outbound.get(outbound_id)
            if row is None:
                return None
            if "set status = 'sent'" in s:
                row["status"] = "sent"
                row["sent_at"] = "2026-10-19T00:00:01Z"
                row["external_message_id"] = args[2]
                row["error"] = None
                return {
                    "id": outbound_id,
                    "status": "sent",
                    "sent_at": row["sent_at"],
                    "external_message_id": args[2],
                }
            if "set status = 'failed'" in s:
                row["status"] = "failed"
                row["error"] = args[2]
                return {
                    "id": outbound_id,
                    "status": "failed",
                    "sent_at": None,
                    "external_message_id": None,
                    "error": args[2],
                }
            if "set status = 'rejected'" in s:
                row["status"] = "rejected"
                row["approved_by"] = args[2]
                return dict(row)
            if "set approved_by" in s:
                row["approved_by"] = args[2]
                return dict(row)
            raise AssertionError(f"unexpected update: {s}")

        if "insert into conversations" in s:
            (
                _,
                project_id,
                customer_id,
                channel_id,
                message_id,
                content,
                sent_by_agent,
                agent_id,
            ) = args
            self.conversations.append(
                {
                    "tenant_id": tenant_id,
                    "project_id": project_id,
                    "customer_id": customer_id,
                    "channel_id": channel_id,
                    "message_id": message_id,
                    "content": content,
                    "sent_by_agent": sent_by_agent,
                    "agent_id": agent_id,
                }
            )
            return {"id": uuid4()}

        if "insert into agent_audit_log" in s:
            (
                _,
                agent_name,
                action,
                entity_type,
                entity_id,
                input_summary,
                output_summary,
                model_used,
                status,
                error_message,
            ) = args
            self.audits.append(
                {
                    "tenant_id": tenant_id,
                    "agent_name": agent_name,
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "status": status,
                    "error_message": error_message,
                }
            )
            return {"id": uuid4()}

        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return []

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return None

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return "OK"

    async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return self.tenant


class FakeDiscord:
    """MockTransport that records requests and returns a scripted response."""

    def __init__(self, *, status_code: int = 200, message_id: str = "9001") -> None:
        self.requests: list[httpx.Request] = []
        self.payloads: list[dict[str, Any]] = []
        self.status_code = status_code
        self.message_id = message_id

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        self.payloads.append(__import__("json").loads(request.content))
        if self.status_code >= 300:
            return httpx.Response(self.status_code, json={"message": "boom"})
        return httpx.Response(200, json={"id": self.message_id, "channel_id": "123456789"})

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.mark.asyncio
async def test_auto_mode_sends_conversation_and_audit() -> None:
    db = FakeDB()
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="deliverable",
            client=client,
        )

    assert result["status"] == "sent"
    assert result["outbound"]["external_message_id"] == "9001"
    assert len(discord.requests) == 1
    assert discord.payloads[0]["content"] == default_body("deliverable", _project())
    assert len(db.conversations) == 1
    conversation = db.conversations[0]
    assert conversation["customer_id"] == CUSTOMER_ID
    assert conversation["sent_by_agent"] is True
    assert conversation["agent_id"] == "communication_agent"
    assert db.audits[-1]["action"] == "message_sent"
    assert db.audits[-1]["status"] == "success"
    assert db.audits[-1]["agent_name"] == "communication_agent"
    assert db.audits[-1]["entity_type"] == "project"
    assert db.audits[-1]["entity_id"] == PROJECT_ID


@pytest.mark.asyncio
async def test_preview_mode_queues_pending_without_calling_discord() -> None:
    db = FakeDB(tenant={"id": TENANT_ID, "name": "Studio", "settings": {"approval_mode": "preview"}})
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="status",
            client=client,
        )

    assert result["status"] == "pending_approval"
    assert result["outbound"]["status"] == "pending"
    assert discord.requests == []
    assert db.conversations == []
    assert db.audits[-1]["action"] == "awaiting_approval"


@pytest.mark.asyncio
async def test_approve_sends_the_queued_row() -> None:
    db = FakeDB(tenant={"id": TENANT_ID, "name": "Studio", "settings": {"approval_mode": "human"}})
    discord = FakeDiscord()

    async with discord.client() as client:
        queued = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="brief",
            client=client,
        )
        outbound_id = queued["outbound"]["id"]
        approved = await approve_outbound(
            db,
            TENANT_ID,
            outbound_id,
            approver="alex",
            client=client,
        )

    assert approved["status"] == "sent"
    assert len(discord.requests) == 1
    assert db.outbound[outbound_id]["approved_by"] == "alex"
    assert db.outbound[outbound_id]["status"] == "sent"
    assert len(db.conversations) == 1
    assert db.audits[-1]["action"] == "message_sent"


@pytest.mark.asyncio
async def test_reject_marks_rejected_and_audits() -> None:
    db = FakeDB(tenant={"id": TENANT_ID, "name": "Studio", "settings": {"approval_mode": "preview"}})

    queued = await send_or_queue(
        db, TENANT_ID, project_id=PROJECT_ID, kind="followup"
    )
    outbound_id = queued["outbound"]["id"]

    rejected = await reject_outbound(
        db, TENANT_ID, outbound_id, approver="alex"
    )

    assert rejected["status"] == "rejected"
    assert rejected["approved_by"] == "alex"
    assert db.outbound[outbound_id]["status"] == "rejected"
    assert db.audits[-1]["action"] == "message_rejected"
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_manual_reply_sends_even_when_ai_paused() -> None:
    db = FakeDB(tenant={"id": TENANT_ID, "name": "Studio", "settings": {"ai_paused": True}})
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_manual_reply(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            content="  We fixed the sleeve.  ",
            author="alex",
            client=client,
        )

    assert result["status"] == "sent"
    assert len(discord.requests) == 1
    assert discord.payloads[0]["content"] == "We fixed the sleeve."
    assert db.conversations[0]["sent_by_agent"] is False
    assert db.conversations[0]["agent_id"] == "human"
    assert [audit["action"] for audit in db.audits][-2:] == ["message_sent", "manual_reply"]


@pytest.mark.asyncio
async def test_ai_kind_skipped_when_ai_paused() -> None:
    db = FakeDB(tenant={"id": TENANT_ID, "name": "Studio", "settings": {"ai_paused": True}})
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="status",
            client=client,
        )

    assert result == {"status": "skipped", "detail": "ai_paused"}
    assert discord.requests == []
    assert db.audits[-1]["action"] == "ai_paused"
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_discord_failure_marks_row_failed_and_audits() -> None:
    db = FakeDB()
    discord = FakeDiscord(status_code=500)

    async with discord.client() as client:
        result = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="status",
            client=client,
        )

    assert result["status"] == "failed"
    outbound = result["outbound"]
    assert outbound["status"] == "failed"
    assert "500" in outbound["error"]
    assert db.outbound[outbound["id"]]["status"] == "failed"
    assert db.conversations == []
    assert db.audits[-1]["action"] == "message_failed"
    assert db.audits[-1]["status"] == "failure"


@pytest.mark.asyncio
async def test_missing_thread_is_skipped() -> None:
    db = FakeDB()
    db.projects[PROJECT_ID] = _project(thread_id=None)
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_or_queue(
            db,
            TENANT_ID,
            project_id=PROJECT_ID,
            kind="status",
            client=client,
        )

    assert result == {"status": "skipped", "detail": "project has no discord thread"}
    assert discord.requests == []


@pytest.mark.asyncio
async def test_send_message_payload_and_auth_header() -> None:
    discord = FakeDiscord(message_id="42")

    async with discord.client() as client:
        body = await send_message(
            "123456789",
            "hello",
            token="test-token",
            client=client,
        )

    assert body["id"] == "42"
    request = discord.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://discord.com/api/v10/channels/123456789/messages"
    assert request.headers["Authorization"] == "Bot test-token"
    assert discord.payloads[0] == {
        "content": "hello",
        "allowed_mentions": {"parse": []},
    }


@pytest.mark.asyncio
async def test_send_message_validation() -> None:
    with pytest.raises(DiscordSendError):
        await send_message("not-a-channel", "hi", token="t")
    with pytest.raises(DiscordSendError):
        await send_message("123", "", token="t")
    with pytest.raises(DiscordSendError):
        await send_message("123", "x" * 2001, token="t")


@pytest.mark.asyncio
async def test_missing_token_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
    get_settings.cache_clear()
    with pytest.raises(DiscordSendError):
        await send_message("123", "hi")
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_manual_kind_without_body_raises() -> None:
    db = FakeDB()
    with pytest.raises(ValueError):
        await send_or_queue(db, TENANT_ID, project_id=PROJECT_ID, kind="manual")
