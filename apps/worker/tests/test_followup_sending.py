"""Follow-up sending tests: limits, Discord delivery, audit and the sweep.

Network-free: Discord uses ``httpx.MockTransport`` and the database is a
shape-routing ``FakeDB`` that asserts every business call is tenant-scoped.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.db import Database
from app.followups import send_due_followups, send_followup
from runner import sweep_followups

TENANT_ID = uuid4()
OTHER_TENANT_ID = uuid4()
PROJECT_ID = uuid4()
CUSTOMER_ID = uuid4()
CHANNEL_ID = "123456789"


@pytest.fixture(autouse=True)
def _discord_token(monkeypatch: pytest.MonkeyPatch) -> Any:
    from app.config import get_settings

    monkeypatch.setenv("DISCORD_BOT_TOKEN", "test-token")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDiscord:
    def __init__(self, *, status_code: int = 200, message_id: str = "9001") -> None:
        self.requests: list[httpx.Request] = []
        self.payloads: list[dict[str, Any]] = []
        self.status_code = status_code
        self.message_id = message_id

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        self.payloads.append(json.loads(request.content))
        if self.status_code >= 300:
            return httpx.Response(self.status_code, json={"message": "boom"})
        return httpx.Response(
            200, json={"id": self.message_id, "channel_id": CHANNEL_ID}
        )

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


def _followup(
    *,
    tenant_id: UUID = TENANT_ID,
    channel: str | None = None,
    message: str | None = "checking in",
    status: str = "pending",
) -> dict[str, Any]:
    payload: dict[str, Any] = {"reference_code": "ROB-1"}
    if message is not None:
        payload["message"] = message
    return {
        "id": uuid4(),
        "tenant_id": tenant_id,
        "project_id": PROJECT_ID,
        "customer_id": None,
        "kind": "nudge",
        "channel": channel,
        "status": status,
        "due_at": None,
        "sent_at": None,
        "payload": payload,
        "created_at": "2026-10-19T00:00:00Z",
    }


class FakeDB:
    """Routes follow-up queries by shape; asserts the tenant guard."""

    def __init__(
        self,
        *,
        tenant_ids: list[UUID] | None = None,
        rows: list[dict[str, Any]] | None = None,
        project: dict[str, Any] | None = None,
        recent_sent: int = 0,
        total_sent: int = 0,
    ) -> None:
        self.tenant_ids = tenant_ids or [TENANT_ID]
        self.rows = rows or []
        self.project = project
        self.recent_sent = recent_sent
        self.total_sent = total_sent
        self.conversations: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.processed_tenants: list[UUID] = []

    async def all_tenant_ids(self) -> list[Any]:
        return list(self.tenant_ids)

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id in self.tenant_ids, "unscoped tenant_id"
        s = _norm(sql)
        self.calls.append((s, args))

        if "from projects" in s:
            return self.project

        if "update followups" in s:
            followup_id = args[1]
            row = next((r for r in self.rows if r["id"] == followup_id), None)
            if row is None:
                return None
            if "set status = 'sent'" in s:
                row["status"] = "sent"
                row["sent_at"] = "2026-10-19T00:00:01Z"
            elif "set status = 'skipped'" in s:
                row["status"] = "skipped"
            return {
                "id": followup_id,
                "status": row["status"],
                "sent_at": row["sent_at"],
                "project_id": row["project_id"],
                "customer_id": row["customer_id"],
                "channel": row["channel"],
            }

        if "insert into conversations" in s:
            (
                _,
                project_id,
                customer_id,
                channel_id,
                message_id,
                content,
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
                    "sent_by_agent": True,
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

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id in self.tenant_ids, "unscoped tenant_id"
        s = _norm(sql)
        self.calls.append((s, args))
        if "sent_at >=" in s:
            return self.recent_sent
        if "count(*)" in s and "from followups" in s:
            return self.total_sent
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        assert tenant_id in self.tenant_ids, "unscoped tenant_id"
        self.processed_tenants.append(tenant_id)
        s = _norm(sql)
        if "from followups" in s and "status = 'pending'" in s:
            limit = args[1]
            pending = [
                r
                for r in self.rows
                if r["tenant_id"] == tenant_id and r["status"] == "pending"
            ]
            return pending[:limit]
        raise AssertionError(f"unexpected fetch: {s}")


@pytest.mark.asyncio
async def test_send_followup_happy_path() -> None:
    db = FakeDB(project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID})
    row = _followup(message="hello from the studio")
    db.rows.append(row)
    discord = FakeDiscord(message_id="9001")

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result == {"status": "sent", "message_id": "9001"}
    assert len(discord.requests) == 1
    assert discord.payloads[0]["content"] == "hello from the studio"
    assert row["status"] == "sent"
    assert len(db.conversations) == 1
    conversation = db.conversations[0]
    assert conversation["project_id"] == PROJECT_ID
    assert conversation["customer_id"] == CUSTOMER_ID
    assert conversation["channel_id"] == CHANNEL_ID
    assert conversation["message_id"] == "9001"
    assert conversation["sent_by_agent"] is True
    assert conversation["agent_id"] == "followup_agent"
    assert db.audits[-1]["agent_name"] == "followup_agent"
    assert db.audits[-1]["action"] == "followup_sent"
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_recent_sent_is_rate_limited_without_http_or_row_change() -> None:
    db = FakeDB(
        project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID},
        recent_sent=1,
    )
    row = _followup()
    db.rows.append(row)
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result == {"status": "skipped", "reason": "rate_limited"}
    assert discord.requests == []
    assert row["status"] == "pending"
    assert db.conversations == []
    assert db.audits == []


@pytest.mark.asyncio
async def test_total_limit_escalates_and_marks_skipped() -> None:
    db = FakeDB(
        project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID},
        total_sent=3,
    )
    row = _followup()
    db.rows.append(row)
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result == {"status": "escalated"}
    assert discord.requests == []
    assert row["status"] == "skipped"
    assert db.conversations == []
    assert db.audits[-1]["agent_name"] == "followup_agent"
    assert db.audits[-1]["action"] == "followup_escalated"
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_discord_error_leaves_row_pending_and_audits_failure() -> None:
    db = FakeDB(project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID})
    row = _followup()
    db.rows.append(row)
    discord = FakeDiscord(status_code=500)

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result == {"status": "failed"}
    assert row["status"] == "pending"
    assert db.conversations == []
    assert db.audits[-1]["agent_name"] == "followup_agent"
    assert db.audits[-1]["action"] == "followup_failed"
    assert db.audits[-1]["status"] == "failure"
    assert "500" in db.audits[-1]["error_message"]


@pytest.mark.asyncio
async def test_missing_channel_is_skipped_without_http() -> None:
    db = FakeDB(project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": None})
    row = _followup()
    db.rows.append(row)
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result == {"status": "skipped", "reason": "missing_channel"}
    assert discord.requests == []
    assert row["status"] == "skipped"
    assert db.audits == []


@pytest.mark.asyncio
async def test_row_channel_wins_over_project_thread() -> None:
    db = FakeDB(project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": "999"})
    row = _followup(channel=CHANNEL_ID)
    db.rows.append(row)
    discord = FakeDiscord()

    async with discord.client() as client:
        result = await send_followup(db, TENANT_ID, row, client=client)

    assert result["status"] == "sent"
    assert str(discord.requests[0].url).endswith(f"/channels/{CHANNEL_ID}/messages")


@pytest.mark.asyncio
async def test_missing_payload_message_uses_template() -> None:
    db = FakeDB(project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID})
    row = _followup(message=None)
    db.rows.append(row)
    discord = FakeDiscord()

    async with discord.client() as client:
        await send_followup(db, TENANT_ID, row, client=client)

    assert "ROB-1" in discord.payloads[0]["content"]


@pytest.mark.asyncio
async def test_send_due_followups_counts_outcomes() -> None:
    db = FakeDB(
        project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID},
    )
    db.rows.extend([_followup(), _followup(message="second")])
    discord = FakeDiscord()

    async with discord.client() as client:
        counts = await send_due_followups(db, TENANT_ID, client=client)

    assert counts == {"sent": 2, "skipped": 0, "escalated": 0, "failed": 0}
    assert len(discord.requests) == 2


@pytest.mark.asyncio
async def test_sweep_followups_processes_every_tenant() -> None:
    db = FakeDB(
        tenant_ids=[TENANT_ID, OTHER_TENANT_ID],
        rows=[
            _followup(tenant_id=TENANT_ID),
            _followup(tenant_id=OTHER_TENANT_ID),
        ],
        project={"id": PROJECT_ID, "customer_id": CUSTOMER_ID, "discord_thread_id": CHANNEL_ID},
    )
    discord = FakeDiscord()

    async with discord.client() as client:
        processed = await sweep_followups(db, client=client)

    assert processed == 2
    assert sorted(db.processed_tenants) == sorted([TENANT_ID, OTHER_TENANT_ID])
    assert len(discord.requests) == 2


class FakePool:
    """Minimal asyncpg pool for the one cross-tenant enumeration query."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.queries: list[str] = []

    def acquire(self) -> "FakePool":
        return self

    async def __aenter__(self) -> "FakePool":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        self.queries.append(_norm(sql))
        return self.rows


@pytest.mark.asyncio
async def test_all_tenant_ids_returns_only_ids() -> None:
    first, second = uuid4(), uuid4()
    pool = FakePool([{"id": first}, {"id": second}])

    tenant_ids = await Database(pool).all_tenant_ids()

    assert tenant_ids == [first, second]
    assert pool.queries == ["select id from tenants order by id"]
