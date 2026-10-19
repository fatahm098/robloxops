"""Intake handler tests with a fake DB and the deterministic FakeLLM."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.handlers.intake import handle_intake
from app.llm import FakeLLM, LLMValidationError
from app.models import IntakeRequest

TENANT_ID = uuid4()
COMMISSION_TEXT = "I want to commission a Roblox shirt, pink and white, Y2K style"


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self) -> None:
        self.tenant_row: dict[str, Any] | None = {
            "id": TENANT_ID,
            "name": "Pixel Forge",
            "settings": {"tone": "friendly"},
        }
        self.seen: dict[str, dict[str, Any]] = {}
        self.customers: dict[str, dict[str, Any]] = {}
        self.projects: list[dict[str, Any]] = []
        self.briefs: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.updates: list[tuple[str, tuple[Any, ...]]] = []

    async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
        assert tenant_id == TENANT_ID
        return self.tenant_row

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "select id from conversations" in s:
            return self.seen.get(args[1], {}).get("id")
        if "insert into tenant_counters" in s:
            return len(self.projects) + 1
        if "select count(*) + 1 from projects" in s:
            return len(self.projects) + 1
        if "insert into customers" in s:
            _, discord_id, username = args
            row = self.customers.setdefault(
                discord_id,
                {
                    "id": uuid4(),
                    "tenant_id": tenant_id,
                    "discord_user_id": discord_id,
                    "discord_username": username,
                },
            )
            return row["id"]
        if "insert into conversations" in s:
            _, project_id, customer_id, channel_id, message_id, content, author_id = args
            if message_id in self.seen:
                return None
            self.seen[message_id] = {
                "id": uuid4(),
                "tenant_id": tenant_id,
                "project_id": project_id,
                "customer_id": customer_id,
                "channel_id": channel_id,
                "content": content,
                "author_id": author_id,
            }
            return self.seen[message_id]["id"]
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "insert into projects" in s:
            _, customer_id, title, project_type, thread_id = args
            reference_code = f"ROB-{len(self.projects) + 1}"
            row = {
                "id": uuid4(),
                "tenant_id": tenant_id,
                "customer_id": customer_id,
                "reference_code": reference_code,
                "title": title,
                "project_type": project_type,
                "status": "intake",
                "discord_thread_id": thread_id,
            }
            self.projects.append(row)
            return {"id": row["id"], "reference_code": reference_code}
        if "insert into briefs" in s:
            _, project_id, summary = args
            self.briefs.append(
                {"tenant_id": tenant_id, "project_id": project_id, "summary": summary}
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

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        self.updates.append((s, args))
        if "update conversations" in s:
            _, message_id, project_id, customer_id = args
            if message_id in self.seen:
                self.seen[message_id]["project_id"] = project_id
                self.seen[message_id]["customer_id"] = customer_id
        return "UPDATE 1"


def _request(message_id: str = "msg-1", content: str = COMMISSION_TEXT) -> IntakeRequest:
    return IntakeRequest(
        tenant_id=TENANT_ID,
        channel_id="chan-1",
        message_id=message_id,
        author_id="discord-user-1",
        author_name="alex",
        content=content,
    )


@pytest.mark.asyncio
async def test_commission_creates_customer_project_and_brief() -> None:
    db = FakeDB()

    result = await handle_intake(db, FakeLLM(), _request())

    assert result.status == "created"
    assert result.intent == "commission_request"
    assert result.reference_code is not None and result.reference_code.startswith("ROB-")
    assert result.customer_id is not None
    assert len(db.projects) == 1
    assert db.projects[0]["tenant_id"] == TENANT_ID
    assert db.projects[0]["status"] == "intake"
    assert db.projects[0]["project_type"] == "other"
    assert len(db.briefs) == 1
    assert db.audits[-1]["status"] == "success"
    assert db.seen["msg-1"]["project_id"] == result.project_id


@pytest.mark.asyncio
async def test_duplicate_message_is_a_noop() -> None:
    db = FakeDB()
    db.seen["msg-1"] = {"id": uuid4()}

    result = await handle_intake(db, FakeLLM(), _request())

    assert result.status == "duplicate"
    assert db.projects == []
    assert db.audits == []


@pytest.mark.asyncio
async def test_general_question_is_logged_but_creates_no_project() -> None:
    db = FakeDB()

    result = await handle_intake(
        db, FakeLLM(), _request(content="How does your commission process work?")
    )

    assert result.status == "ignored"
    assert result.intent == "general_question"
    assert db.projects == []
    assert "msg-1" in db.seen
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_invalid_llm_output_escalates_without_writing_data() -> None:
    class BrokenLLM(FakeLLM):
        async def classify_intent(self, text: str, tenant_name: str = "the studio") -> Any:
            raise LLMValidationError("IntentResult validation failed")

    db = FakeDB()

    result = await handle_intake(db, BrokenLLM(), _request())

    assert result.status == "escalated"
    assert db.projects == []
    assert db.briefs == []
    assert db.audits[-1]["status"] == "escalated"
    assert "validation failed" in db.audits[-1]["error_message"]


@pytest.mark.asyncio
async def test_ai_paused_records_message_and_audit_without_llm() -> None:
    class NoCallLLM(FakeLLM):
        async def classify_intent(self, text: str, tenant_name: str = "the studio") -> Any:
            raise AssertionError("LLM must not be called while paused")

    db = FakeDB()
    db.tenant_row["settings"] = {"tone": "friendly", "ai_paused": True}

    result = await handle_intake(db, NoCallLLM(), _request())

    assert result.status == "escalated"
    assert result.reply == ""
    assert db.projects == []
    assert db.briefs == []
    assert "msg-1" in db.seen
    assert db.audits[-1]["action"] == "ai_paused"
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_unknown_tenant_raises() -> None:
    db = FakeDB()
    db.tenant_row = None

    with pytest.raises(ValueError):
        await handle_intake(db, FakeLLM(), _request())


@pytest.mark.asyncio
async def test_inbound_content_is_sanitized() -> None:
    db = FakeDB()

    await handle_intake(db, FakeLLM(), _request(content="\x00" + "x" * 6000))

    stored = db.seen["msg-1"]["content"]
    assert "\x00" not in stored
    assert len(stored) <= 4000
