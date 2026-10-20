"""Brief/continue handler tests with a fake DB and the deterministic FakeLLM."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.handlers.brief import handle_continue
from app.llm import FakeLLM, LLMError
from app.models import ContinueRequest

TENANT_ID = uuid4()
PROJECT_ID = uuid4()
THREAD_ID = "thread-1"
TRANSCRIPT = [{"direction": "inbound", "content": "I want a y2k clothing hoodie"}]


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self, *, status: str = "intake", human_takeover: bool = False) -> None:
        self.tenant_row: dict[str, Any] | None = {
            "id": TENANT_ID,
            "name": "Pixel Forge",
            "settings": {"tone": "friendly"},
        }
        self.seen: dict[str, dict[str, Any]] = {}
        self.projects: list[dict[str, Any]] = [
            {
                "id": PROJECT_ID,
                "tenant_id": TENANT_ID,
                "reference_code": "ROB-1",
                "title": "Y2K hoodie",
                "status": status,
                "project_type": "other",
                "discord_thread_id": THREAD_ID,
                "human_takeover": human_takeover,
                "structured_data": None,
            }
        ]
        self.briefs: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.updates: list[tuple[str, tuple[Any, ...]]] = []
        self.tasks: list[dict[str, Any]] = []
        self.revisions: list[dict[str, Any]] = []
        self.notifications: list[dict[str, Any]] = []
        self.designer_id: Any = uuid4()

    def _project(self) -> dict[str, Any] | None:
        return self.projects[0] if self.projects else None

    async def fetch_tenant(self, tenant_id: UUID) -> dict[str, Any] | None:
        assert tenant_id == TENANT_ID
        return self.tenant_row

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "select id from conversations" in s:
            return self.seen.get(args[1], {}).get("id")
        if "insert into conversations" in s:
            _, project_id, customer_id, channel_id, message_id, content, author_id = args
            if message_id in self.seen:
                return None
            self.seen[message_id] = {
                "id": uuid4(),
                "project_id": project_id,
                "customer_id": customer_id,
                "channel_id": channel_id,
                "content": content,
                "author_id": author_id,
            }
            return self.seen[message_id]["id"]
        if "from users" in s:
            return self.designer_id
        if "insert into tasks" in s:
            _, project_id, assigned_to, title = args
            if any(task["project_id"] == project_id for task in self.tasks):
                return None
            task = {
                "id": uuid4(),
                "project_id": project_id,
                "assigned_to": assigned_to,
                "title": title,
                "status": "pending",
            }
            self.tasks.append(task)
            return task["id"]
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "discord_thread_id" in s:
            project = self._project()
            if project is not None and project["discord_thread_id"] == args[1]:
                return project
            return None
        if "left join briefs b on b.project_id" in s:
            project = self._project()
            if project is not None and project["id"] == args[1]:
                return project
            return None
        if "insert into briefs" in s:
            _, project_id, structured_data, score, summary = args
            self.briefs.append(
                {
                    "project_id": project_id,
                    "structured_data": structured_data,
                    "completeness_score": score,
                    "summary": summary,
                }
            )
            return {"id": uuid4()}
        if "from tasks" in s:
            return self.tasks[0] if self.tasks else {"status": "in_progress", "title": "Design", "due_at": None}
        if "from invoices" in s:
            return None
        if "insert into revisions" in s:
            _, project_id, requested_by, reason = args
            row = {"id": uuid4(), "project_id": project_id, "requested_by": requested_by, "reason": reason}
            self.revisions.append(row)
            return row
        if "insert into notifications" in s:
            row = {"id": uuid4()}
            self.notifications.append(row)
            return row
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
        if "from conversations" in _norm(sql):
            return list(TRANSCRIPT)
        return []

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        self.updates.append((s, args))
        if "update projects" in s:
            _, project_id = args
            project = self._project()
            if project is not None and project["id"] == project_id:
                if "status = 'approved'" in s:
                    project["status"] = "approved"
                elif "status = 'revision'" in s:
                    project["status"] = "revision"
                elif project["status"] == "intake":
                    project["status"] = "briefing"
                elif project["status"] in ("customer_review", "delivered", "approved"):
                    project["status"] = "revision"
        if "update tasks" in s:
            for task in self.tasks:
                task["status"] = "in_progress"
        return "UPDATE 1"


def _request(message_id: str = "msg-1") -> ContinueRequest:
    return ContinueRequest(
        tenant_id=TENANT_ID,
        project_id=None,
        channel_id="chan-1",
        message_id=message_id,
        author_id="discord-user-1",
        author_name="alex",
        content="Here is the updated hoodie design",
        thread_id=THREAD_ID,
    )


@pytest.mark.asyncio
async def test_ai_paused_records_message_and_audit_without_llm() -> None:
    class NoCallLLM(FakeLLM):
        async def extract_brief(self, conversation: str, project_type_hint: str | None = None) -> Any:
            raise AssertionError("LLM must not be called while paused")

        async def draft_message(self, **kwargs: Any) -> str:
            raise AssertionError("LLM must not be called while paused")

    db = FakeDB(status="intake")
    db.tenant_row["settings"] = {"tone": "friendly", "ai_paused": True}

    result = await handle_continue(db, NoCallLLM(), _request())

    assert result.status == "escalated"
    assert result.reply == ""
    assert "msg-1" in db.seen
    assert db.briefs == []
    assert db.updates == []
    assert db.audits[-1]["action"] == "ai_paused"
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_continue_advances_intake_to_briefing() -> None:
    db = FakeDB(status="intake")

    result = await handle_continue(db, FakeLLM(), _request())

    assert result.status == "processed"
    assert db.projects[0]["status"] == "briefing"
    assert len(db.briefs) == 1


@pytest.mark.asyncio
async def test_revision_message_moves_delivered_project_to_revision() -> None:
    db = FakeDB(status="delivered")

    result = await handle_continue(db, FakeLLM(), _request())

    assert result.status == "processed"
    assert db.projects[0]["status"] == "revision"
    assert "revision" in result.reply.lower()


@pytest.mark.asyncio
async def test_successful_refresh_creates_assigned_design_task() -> None:
    db = FakeDB(status="intake")

    result = await handle_continue(db, FakeLLM(), _request())

    assert result.status == "processed"
    assert len(db.tasks) == 1
    assert db.tasks[0]["assigned_to"] == db.designer_id
    assert db.tasks[0]["title"]


@pytest.mark.asyncio
async def test_escalated_refresh_creates_no_task() -> None:
    class FailingLLM(FakeLLM):
        async def extract_brief(
            self, conversation: str, project_type_hint: str | None = None
        ) -> Any:
            raise LLMError("boom")

    db = FakeDB(status="intake")

    result = await handle_continue(db, FailingLLM(), _request())

    assert result.status == "escalated"
    assert db.briefs == []
    assert db.tasks == []


@pytest.mark.asyncio
async def test_human_takeover_short_circuits_without_llm() -> None:
    class NoCallLLM(FakeLLM):
        async def extract_brief(
            self, conversation: str, project_type_hint: str | None = None
        ) -> Any:
            raise AssertionError("LLM must not be called during human takeover")

        async def draft_message(self, **kwargs: Any) -> str:
            raise AssertionError("LLM must not be called during human takeover")

    db = FakeDB(status="briefing", human_takeover=True)

    result = await handle_continue(db, NoCallLLM(), _request())

    assert result.status == "human_takeover"
    assert result.reply == ""
    assert result.project_id == PROJECT_ID
    assert "msg-1" in db.seen
    assert db.briefs == []
    assert db.tasks == []
    assert db.updates == []


@pytest.mark.asyncio
async def test_routing_failure_does_not_break_brief_extraction() -> None:
    class BoomRoutingDB(FakeDB):
        async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
            if "from users" in _norm(sql):
                raise RuntimeError("routing unavailable")
            return await super().fetchval(tenant_id, sql, *args)

    db = BoomRoutingDB(status="intake")

    result = await handle_continue(db, FakeLLM(), _request())

    assert result.status == "processed"
    assert len(db.briefs) == 1
    assert db.tasks == []


@pytest.mark.asyncio
async def test_continue_status_inquiry_replies_without_altering_status() -> None:
    db = FakeDB(status="in_design")
    req = _request(message_id="msg-status-1")
    req.content = "Halo min, progress sampai mana ya?"

    result = await handle_continue(db, FakeLLM(), req)

    assert result.status == "processed"
    assert result.intent == "status_inquiry"
    assert "ROB-1" in result.reply
    assert "in_design" in result.reply
    assert db.projects[0]["status"] == "in_design"
    assert db.audits[-1]["action"] == "status_inquiry_replied"


@pytest.mark.asyncio
async def test_continue_approval_advances_project_status_and_notifies_designer() -> None:
    db = FakeDB(status="customer_review")
    req = _request(message_id="msg-appr-1")
    req.content = "Looks awesome! Approved!"

    result = await handle_continue(db, FakeLLM(), req)

    assert result.status == "processed"
    assert result.intent == "approval"
    assert "approving" in result.reply.lower() or "awesome" in result.reply.lower()
    assert db.projects[0]["status"] == "approved"
    assert db.audits[-1]["action"] == "project_approved"


@pytest.mark.asyncio
async def test_continue_revision_request_logs_revision_and_sets_status() -> None:
    db = FakeDB(status="customer_review")
    req = _request(message_id="msg-rev-1")
    req.content = "Tolong bagian lengannya diganti warna biru ya"

    result = await handle_continue(db, FakeLLM(), req)

    assert result.status == "processed"
    assert result.intent == "revision_request"
    assert "revision" in result.reply.lower()
    assert db.projects[0]["status"] == "revision"
    assert len(db.revisions) == 1
    assert "warna biru" in db.revisions[0]["reason"]
    assert db.audits[-1]["action"] == "revision_created"


@pytest.mark.asyncio
async def test_continue_payment_inquiry_returns_payment_instructions() -> None:
    db = FakeDB(status="approved")
    req = _request(message_id="msg-pay-1")
    req.content = "Bayar lewat mana ya? Robux group funds?"

    result = await handle_continue(db, FakeLLM(), req)

    assert result.status == "processed"
    assert result.intent == "payment_inquiry"
    assert "payment" in result.reply.lower() or "robux" in result.reply.lower()
    assert db.projects[0]["status"] == "approved"
    assert db.audits[-1]["action"] == "payment_inquiry_replied"

