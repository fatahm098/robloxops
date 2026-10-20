"""QA handler tests: UI-compatible report shape and vision URL wiring."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.handlers.qa import run_qa
from app.llm import FakeLLM, LLMError
from app.models import QAReport

TENANT_ID = uuid4()
DELIVERABLE_ID = uuid4()
PROJECT_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Routes queries by shape; asserts every call is tenant-scoped."""

    def __init__(
        self,
        *,
        file_path: str = "clothing_y2k_female.rbxm",
        tenant_settings: dict[str, Any] | None = None,
        sent_to_customer_at: Any = None,
    ) -> None:
        self.row: dict[str, Any] | None = {
            "id": DELIVERABLE_ID,
            "project_id": PROJECT_ID,
            "file_path": file_path,
            "file_type": "rbxm",
            "sent_to_customer_at": sent_to_customer_at,
            "title": "Y2K hoodie",
            "structured_data": {
                "project_type": "clothing",
                "style": "y2k",
                "character": "female",
            },
        }
        self.tenant = {
            "id": TENANT_ID,
            "name": "Studio",
            "settings": tenant_settings or {},
        }
        self.audits: list[dict[str, Any]] = []
        self.saved: dict[str, Any] | None = None

    async def fetch_tenant(self, tenant_id: UUID) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return self.tenant

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "from deliverables d" in s:
            return self.row
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
                    "agent_name": agent_name,
                    "action": action,
                    "entity_id": entity_id,
                    "status": status,
                    "error_message": error_message,
                }
            )
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "set sent_to_customer_at" in s:
            _, deliverable_id = args
            assert deliverable_id == DELIVERABLE_ID
            assert self.row is not None
            self.row["sent_to_customer_at"] = "2026-10-19T00:00:02Z"
            return "UPDATE 1"
        assert "update deliverables" in s
        _, deliverable_id, qa_status, qa_report = args
        self.saved = {
            "deliverable_id": deliverable_id,
            "qa_status": qa_status,
            "qa_report": json.loads(qa_report),
        }
        return "UPDATE 1"


class FakeSender:
    """Stand-in for ``app.outbound.send_or_queue``; records every invocation."""

    def __init__(self, status: str = "skipped") -> None:
        self.status = status
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self,
        db: Any,
        tenant_id: UUID,
        *,
        project_id: Any,
        kind: str,
        body: str | None = None,
        tenant: dict[str, Any] | None = None,
        client: Any = None,
        force_auto: bool = False,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "tenant_id": tenant_id,
                "project_id": project_id,
                "kind": kind,
                "tenant": tenant,
            }
        )
        return {"status": self.status}


@pytest.fixture(autouse=True)
def fake_sender(monkeypatch: pytest.MonkeyPatch) -> FakeSender:
    """QA lazy-imports ``send_or_queue``, so patching the module attr is enough."""
    import app.outbound

    sender = FakeSender()
    monkeypatch.setattr(app.outbound, "send_or_queue", sender)
    return sender


class SpyLLM(FakeLLM):
    def __init__(self) -> None:
        self.seen_deliverable: dict[str, Any] | None = None

    async def qa_check(self, brief: dict[str, Any], deliverable: dict[str, Any]) -> QAReport:
        self.seen_deliverable = deliverable
        return await super().qa_check(brief, deliverable)


@pytest.mark.asyncio
async def test_qa_report_written_in_ui_checks_shape() -> None:
    db = FakeDB()

    report = await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert report is not None
    assert db.saved is not None
    stored = db.saved["qa_report"]
    assert stored["max_score"] == 100
    assert isinstance(stored["score"], int)
    assert "items" not in stored
    assert stored["checks"], "checks must not be empty"
    for check in stored["checks"]:
        assert set(check) == {"label", "value", "passed"}
        assert isinstance(check["passed"], bool)
    assert db.saved["qa_status"] == "passed"
    assert db.audits[-1]["status"] == "success"


@pytest.mark.asyncio
async def test_qa_forwards_url_only_when_file_path_is_a_url() -> None:
    url_db = FakeDB(file_path="https://cdn.example.com/render.png")
    url_llm = SpyLLM()

    await run_qa(url_db, url_llm, TENANT_ID, DELIVERABLE_ID)

    assert url_llm.seen_deliverable is not None
    assert url_llm.seen_deliverable["url"] == "https://cdn.example.com/render.png"

    path_db = FakeDB(file_path="tenants/abc/deliverables/render.png")
    path_llm = SpyLLM()

    await run_qa(path_db, path_llm, TENANT_ID, DELIVERABLE_ID)

    assert path_llm.seen_deliverable is not None
    assert "url" not in path_llm.seen_deliverable


@pytest.mark.asyncio
async def test_qa_llm_failure_escalates_without_writing_report() -> None:
    class BrokenLLM(FakeLLM):
        async def qa_check(self, brief: dict[str, Any], deliverable: dict[str, Any]) -> QAReport:
            raise LLMError("QA validation failed")

    db = FakeDB()

    report = await run_qa(db, BrokenLLM(), TENANT_ID, DELIVERABLE_ID)

    assert report is None
    assert db.saved is None
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_qa_passed_without_thread_does_not_mark_sent(
    fake_sender: FakeSender,
) -> None:
    fake_sender.status = "skipped"
    db = FakeDB()

    await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert db.saved is not None and db.saved["qa_status"] == "passed"
    assert len(fake_sender.calls) == 1
    assert fake_sender.calls[0]["kind"] == "deliverable"
    assert fake_sender.calls[0]["project_id"] == PROJECT_ID
    assert db.row is not None
    assert db.row["sent_to_customer_at"] is None


@pytest.mark.asyncio
async def test_qa_passed_auto_sends_preview_and_marks_sent(
    fake_sender: FakeSender,
) -> None:
    fake_sender.status = "sent"
    db = FakeDB()

    await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert len(fake_sender.calls) == 1
    call = fake_sender.calls[0]
    assert call["tenant_id"] == TENANT_ID
    assert call["project_id"] == PROJECT_ID
    assert call["kind"] == "deliverable"
    assert call["tenant"] == db.tenant
    assert db.row is not None
    assert db.row["sent_to_customer_at"] is not None


@pytest.mark.asyncio
async def test_qa_failed_does_not_send(fake_sender: FakeSender) -> None:
    class LowScoreLLM(FakeLLM):
        async def qa_check(self, brief: dict[str, Any], deliverable: dict[str, Any]) -> QAReport:
            return QAReport(checks=[], score=10, max_score=100, summary="missing")

    fake_sender.status = "sent"
    db = FakeDB()

    await run_qa(db, LowScoreLLM(), TENANT_ID, DELIVERABLE_ID)

    assert db.saved is not None and db.saved["qa_status"] == "failed"
    assert fake_sender.calls == []
    assert db.row is not None
    assert db.row["sent_to_customer_at"] is None


@pytest.mark.asyncio
async def test_qa_already_sent_is_not_resent(fake_sender: FakeSender) -> None:
    fake_sender.status = "sent"
    db = FakeDB(sent_to_customer_at="2026-10-18T00:00:00Z")

    await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert fake_sender.calls == []
    assert db.row is not None
    assert db.row["sent_to_customer_at"] == "2026-10-18T00:00:00Z"


@pytest.mark.asyncio
async def test_qa_ai_paused_skips_auto_send(fake_sender: FakeSender) -> None:
    fake_sender.status = "sent"
    db = FakeDB(tenant_settings={"ai_paused": True})

    await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert fake_sender.calls == []
    assert db.row is not None
    assert db.row["sent_to_customer_at"] is None


@pytest.mark.asyncio
async def test_qa_failed_send_leaves_timestamp_null_for_retry(
    fake_sender: FakeSender,
) -> None:
    fake_sender.status = "failed"
    db = FakeDB()

    await run_qa(db, FakeLLM(), TENANT_ID, DELIVERABLE_ID)

    assert len(fake_sender.calls) == 1
    assert db.row is not None
    assert db.row["sent_to_customer_at"] is None
