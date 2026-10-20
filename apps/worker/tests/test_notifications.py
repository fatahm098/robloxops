"""Notifications, Resend email and per-kind approval tests (offline)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest

from app.email import DEFAULT_FROM, send_email
from app.notifications import notify_roles, notify_user
from app.outbound import approval_for

TENANT_ID = uuid4()
PROJECT_ID = uuid4()
USER_ID = uuid4()
DESIGNER_ID = uuid4()
TASK_ID = uuid4()


def _norm(sql: str) -> str:
    return " ".join(sql.split()).lower()


class FakeDB:
    """Shape-routing fake for notification and email tests."""

    def __init__(
        self,
        *,
        users: list[dict[str, Any]] | None = None,
        secret: str | None = None,
    ) -> None:
        self.users = users or []
        self.secret = secret
        self.notifications: list[dict[str, Any]] = []
        self.secret_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "insert into notifications" in s:
            _, user_id, project_id, kind, title, body = args
            row = {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "project_id": project_id,
                "kind": kind,
                "title": title,
                "body": body,
            }
            self.notifications.append(row)
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "from users" in s:
            roles = set(args[1])
            return [user for user in self.users if user["role"] in roles]
        return []

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        if "get_tenant_secret" in s:
            self.secret_calls.append((s, args))
            return self.secret
        raise AssertionError(f"unexpected fetchval: {s}")


class RaisingDB(FakeDB):
    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        raise RuntimeError("insert failed")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        raise RuntimeError("lookup failed")


class FakeResend:
    """``httpx.MockTransport`` that records the request and scripts a response."""

    def __init__(self, *, status_code: int = 200) -> None:
        self.status_code = status_code
        self.requests: list[httpx.Request] = []
        self.payloads: list[dict[str, Any]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        self.payloads.append(json.loads(request.content))
        if self.status_code >= 300:
            return httpx.Response(self.status_code, json={"message": "nope"})
        return httpx.Response(200, json={"id": "email-1"})

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.mark.asyncio
async def test_notify_user_inserts_tenant_scoped_row() -> None:
    db = FakeDB()

    await notify_user(
        db,
        TENANT_ID,
        user_id=USER_ID,
        kind="task_assigned",
        title="New task",
        body="You were assigned a project.",
        project_id=PROJECT_ID,
    )

    assert db.notifications == [
        {
            "tenant_id": TENANT_ID,
            "user_id": USER_ID,
            "project_id": PROJECT_ID,
            "kind": "task_assigned",
            "title": "New task",
            "body": "You were assigned a project.",
        }
    ]


@pytest.mark.asyncio
async def test_notify_user_swallows_insert_failure() -> None:
    await notify_user(
        RaisingDB(),
        TENANT_ID,
        user_id=USER_ID,
        kind="task_assigned",
        title="New task",
    )


@pytest.mark.asyncio
async def test_notify_roles_notifies_each_matching_user() -> None:
    owner = {"id": uuid4(), "email": "owner@example.com", "role": "owner"}
    manager = {"id": uuid4(), "email": "manager@example.com", "role": "manager"}
    designer = {"id": uuid4(), "email": "designer@example.com", "role": "designer"}
    db = FakeDB(users=[owner, manager, designer])

    count = await notify_roles(
        db,
        TENANT_ID,
        ("owner", "manager"),
        kind="approval_requested",
        title="Approval needed",
        project_id=PROJECT_ID,
    )

    assert count == 2
    assert {row["user_id"] for row in db.notifications} == {
        owner["id"],
        manager["id"],
    }


@pytest.mark.asyncio
async def test_notify_roles_returns_zero_when_lookup_fails() -> None:
    count = await notify_roles(
        RaisingDB(),
        TENANT_ID,
        ("owner", "manager"),
        kind="approval_requested",
        title="Approval needed",
    )

    assert count == 0


@pytest.mark.asyncio
async def test_notify_roles_returns_zero_for_empty_roles() -> None:
    db = FakeDB(users=[{"id": USER_ID, "email": "x@example.com", "role": "owner"}])

    assert await notify_roles(db, TENANT_ID, (), kind="approval_requested", title="x") == 0
    assert db.notifications == []


@pytest.mark.asyncio
async def test_send_email_uses_tenant_secret_and_resend_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("RESEND_FROM", raising=False)
    db = FakeDB(secret="re_tenant_key")
    resend = FakeResend()

    async with resend.client() as client:
        ok = await send_email(
            db,
            TENANT_ID,
            to="designer@example.com",
            subject="New task",
            text="Please review the brief.",
            client=client,
        )

    assert ok is True
    request = resend.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer re_tenant_key"
    assert resend.payloads[0] == {
        "from": DEFAULT_FROM,
        "to": ["designer@example.com"],
        "subject": "New task",
        "text": "Please review the brief.",
    }
    assert db.secret_calls[0][1] == (str(TENANT_ID), "RESEND_API_KEY")


@pytest.mark.asyncio
async def test_send_email_falls_back_to_environment_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RESEND_API_KEY", "re_env_key")
    monkeypatch.setenv("RESEND_FROM", "Studio <studio@example.com>")
    db = FakeDB(secret=None)
    resend = FakeResend()

    async with resend.client() as client:
        ok = await send_email(
            db,
            TENANT_ID,
            to="designer@example.com",
            subject="Hello",
            text="Body",
            client=client,
        )

    assert ok is True
    assert resend.requests[0].headers["Authorization"] == "Bearer re_env_key"
    assert resend.payloads[0]["from"] == "Studio <studio@example.com>"


@pytest.mark.asyncio
async def test_send_email_returns_false_without_any_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    resend = FakeResend()

    async with resend.client() as client:
        ok = await send_email(
            FakeDB(secret=None),
            TENANT_ID,
            to="designer@example.com",
            subject="Hello",
            text="Body",
            client=client,
        )

    assert ok is False
    assert resend.requests == []


@pytest.mark.asyncio
async def test_send_email_never_raises_on_http_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    resend = FakeResend(status_code=500)

    async with resend.client() as client:
        ok = await send_email(
            FakeDB(secret="re_tenant_key"),
            TENANT_ID,
            to="designer@example.com",
            subject="Hello",
            text="Body",
            client=client,
        )

    assert ok is False


@pytest.mark.asyncio
async def test_send_email_never_raises_on_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(boom)) as client:
        ok = await send_email(
            FakeDB(secret="re_tenant_key"),
            TENANT_ID,
            to="designer@example.com",
            subject="Hello",
            text="Body",
            client=client,
        )

    assert ok is False


def test_approval_for_uses_per_kind_map() -> None:
    settings = {
        "approval": {
            "first_message": "preview",
            "brief": "auto",
            "deliverable": "human",
            "status": "preview",
            "followup": "human",
        }
    }

    assert approval_for("first_message", settings) == "preview"
    assert approval_for("brief", settings) == "auto"
    assert approval_for("deliverable", settings) == "human"
    assert approval_for("status", settings) == "preview"
    assert approval_for("followup", settings) == "human"


def test_approval_for_falls_back_to_approval_mode() -> None:
    assert approval_for("status", {"approval_mode": "preview"}) == "preview"
    assert approval_for("deliverable", {"approval_mode": "human"}) == "human"


def test_approval_for_defaults_to_auto() -> None:
    assert approval_for("deliverable", {}) == "auto"
    assert approval_for("status", None) == "auto"
    assert approval_for("brief", {"approval": {"deliverable": "human"}}) == "auto"


class BriefDB:
    """Minimal shape-routing DB for ``refresh_brief``."""

    def __init__(self, *, email: str | None = "designer@example.com") -> None:
        self.email = email
        self.task_created = True
        self.calls: list[str] = []
        self.project = {
            "id": PROJECT_ID,
            "title": "Y2K hoodie",
            "status": "intake",
            "project_type": "other",
            "human_takeover": False,
            "structured_data": None,
        }

    async def fetchrow(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        self.calls.append(s)
        if "left join briefs b on b.project_id" in s:
            return self.project
        if "insert into briefs" in s:
            return {"id": uuid4()}
        if "insert into agent_audit_log" in s:
            return {"id": uuid4()}
        raise AssertionError(f"unexpected fetchrow: {s}")

    async def fetch(self, tenant_id: UUID, sql: str, *args: Any) -> list[Any]:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return [{"direction": "inbound", "content": "black hoodie with neon trim"}]

    async def fetchval(self, tenant_id: UUID, sql: str, *args: Any) -> Any:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        s = _norm(sql)
        self.calls.append(s)
        if "select email from users" in s:
            return self.email
        if "select u.id" in s and "from users" in s:
            return DESIGNER_ID
        if "insert into tasks" in s:
            return TASK_ID if self.task_created else None
        raise AssertionError(f"unexpected fetchval: {s}")

    async def execute(self, tenant_id: UUID, sql: str, *args: Any) -> str:
        assert tenant_id == TENANT_ID, "unscoped tenant_id"
        return "UPDATE 1"


@pytest.mark.asyncio
async def test_refresh_brief_notifies_assigned_designer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.handlers.brief as brief_module
    from app.llm import FakeLLM

    db = BriefDB()
    notifications: list[dict[str, Any]] = []
    emails: list[dict[str, Any]] = []

    async def fake_notify(
        _db: Any,
        _tenant_id: UUID,
        *,
        user_id: Any,
        kind: str,
        title: str,
        body: str | None = None,
        project_id: Any = None,
    ) -> None:
        notifications.append(
            {
                "user_id": user_id,
                "kind": kind,
                "title": title,
                "body": body,
                "project_id": project_id,
            }
        )

    async def fake_send(
        _db: Any,
        _tenant_id: UUID,
        *,
        to: str,
        subject: str,
        text: str,
        client: Any = None,
    ) -> bool:
        emails.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(brief_module, "notify_user", fake_notify)
    monkeypatch.setattr(brief_module, "send_email", fake_send)

    result = await brief_module.refresh_brief(db, FakeLLM(), TENANT_ID, PROJECT_ID)

    assert result is not None
    assert notifications[0]["user_id"] == DESIGNER_ID
    assert notifications[0]["kind"] == "task_assigned"
    assert notifications[0]["project_id"] == PROJECT_ID
    assert emails[0]["to"] == "designer@example.com"
    assert "design task" in emails[0]["subject"].lower()


@pytest.mark.asyncio
async def test_refresh_brief_skips_notification_when_task_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.handlers.brief as brief_module
    from app.llm import FakeLLM

    db = BriefDB()
    db.task_created = False
    notifications: list[dict[str, Any]] = []

    async def fake_notify(*args: Any, **kwargs: Any) -> None:
        notifications.append(kwargs)

    monkeypatch.setattr(brief_module, "notify_user", fake_notify)

    result = await brief_module.refresh_brief(db, FakeLLM(), TENANT_ID, PROJECT_ID)

    assert result is not None
    assert notifications == []


@pytest.mark.asyncio
async def test_refresh_brief_skips_email_when_assignee_has_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.handlers.brief as brief_module
    from app.llm import FakeLLM

    db = BriefDB(email=None)
    notifications: list[dict[str, Any]] = []
    emails: list[dict[str, Any]] = []

    async def fake_notify(*args: Any, **kwargs: Any) -> None:
        notifications.append(kwargs)

    async def fake_send(*args: Any, **kwargs: Any) -> bool:
        emails.append(kwargs)
        return True

    monkeypatch.setattr(brief_module, "notify_user", fake_notify)
    monkeypatch.setattr(brief_module, "send_email", fake_send)

    result = await brief_module.refresh_brief(db, FakeLLM(), TENANT_ID, PROJECT_ID)

    assert result is not None
    assert len(notifications) == 1
    assert emails == []
