"""Brief/continue handler tests with a fake DB and the deterministic FakeLLM."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from app.handlers.brief import handle_continue
from app.llm import FakeLLM
from app.models import ContinueRequest

TENANT_ID = uuid4()
PROJECT_ID = uuid4()
THREAD_ID = "thread-1"
TRANSCRIPT = [{"direction": "inbound", "content": "I want a y2k clothing hoodie"}]


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(self, *, status: str = "intake") -> None:
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
                "structured_data": None,
            }
        ]
        self.briefs: list[dict[str, Any]] = []
        self.audits: list[dict[str, Any]] = []
        self.updates: list[tuple[str, tuple[Any, ...]]] = []

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
                if project["status"] == "intake":
                    project["status"] = "briefing"
                elif project["status"] in ("customer_review", "delivered", "approved"):
                    project["status"] = "revision"
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
