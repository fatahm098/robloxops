"""Offline checks for slash-command registration and the message fast path.

``_register_commands`` is called from ``setup_hook``; we call it directly so the
test never logs in or reaches the Discord network. The message-listener tests
patch the Discord channel classes so ``isinstance`` checks pass and replace
``_call_worker`` (the HTTP hop) with the real handler on a fake DB, proving the
``ai_paused`` gate end-to-end through the bot.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import discord
import pytest

from app.config import Settings
from app.handlers.brief import handle_continue
from app.handlers.intake import handle_intake
from app.llm import FakeLLM
from app.models import ContinueRequest, IntakeRequest
from bot import BotRepo, ChannelTenant, RobloxOpsBot


class NullPool:
    async def fetchrow(self, *args: Any, **kwargs: Any) -> None:
        return None

    async def fetch(self, *args: Any, **kwargs: Any) -> list[Any]:
        return []

    async def fetchval(self, *args: Any, **kwargs: Any) -> None:
        return None


def _make_bot() -> RobloxOpsBot:
    return RobloxOpsBot(Settings(), BotRepo(NullPool()))  # type: ignore[arg-type]


def test_register_commands_registers_each_exactly_once() -> None:
    bot = _make_bot()

    bot._register_commands()

    names = [command.name for command in bot.tree.get_commands()]
    assert sorted(names) == ["brief", "help", "revision", "status"]
    assert len(names) == len(set(names))


def test_register_commands_does_not_raise_command_already_registered() -> None:
    bot = _make_bot()

    bot._register_commands()

    assert len(bot.tree.get_commands()) == 4


# --------------------------------------------------------------------------- #
# Message fast-path fakes
# --------------------------------------------------------------------------- #


class FakeUser:
    def __init__(self, *, bot: bool = False, uid: str = "user-1", name: str = "alex") -> None:
        self.bot = bot
        self.id = uid
        self.display_name = name


class FakeGuild:
    id = 12345


class FakeTextChannel:
    def __init__(self, cid: str = "chan-1") -> None:
        self.id = cid
        self.parent_id = None
        self.sent: list[Any] = []

    async def send(self, content: Any) -> None:
        self.sent.append(content)


class FakeThreadChannel:
    def __init__(self, cid: str = "thread-1", parent_id: str = "chan-1") -> None:
        self.id = cid
        self.parent_id = parent_id
        self.sent: list[Any] = []

    async def send(self, content: Any) -> None:
        self.sent.append(content)


class FakeCreatedThread:
    id = "thread-99"

    def __init__(self) -> None:
        self.sent: list[Any] = []

    async def send(self, content: Any) -> None:
        self.sent.append(content)


class FakeMessage:
    def __init__(self, channel: Any, *, content: str, mid: str = "msg-1") -> None:
        self.channel = channel
        self.guild = FakeGuild()
        self.author = FakeUser()
        self.content = content
        self.id = mid
        self.created_thread: FakeCreatedThread | None = None

    async def create_thread(self, name: str, auto_archive_duration: int) -> FakeCreatedThread:
        self.created_thread = FakeCreatedThread()
        return self.created_thread


class FakeRepo:
    def __init__(self, tenant: ChannelTenant, monitored: set[str]) -> None:
        self.tenant = tenant
        self.monitored = monitored
        self.enqueued: list[str] = []
        self.linked: list[str] = []
        self.project: dict[str, Any] | None = {
            "id": uuid4(),
            "reference_code": "ROB-1",
            "title": "Y2K hoodie",
            "status": "briefing",
            "created_at": None,
        }

    async def tenant_for_guild(self, guild_id: Any) -> ChannelTenant:
        return self.tenant

    def monitored_channels(self, settings: dict[str, Any]) -> set[str]:
        return self.monitored

    async def enqueue(self, tenant_id: Any, kind: str, payload: dict[str, Any]) -> None:
        self.enqueued.append(kind)

    async def link_thread(self, tenant_id: Any, project_id: Any, thread_id: str) -> None:
        self.linked.append(thread_id)

    async def find_project(
        self, tenant_id: Any, reference: str | None, discord_user_id: str
    ) -> dict[str, Any] | None:
        return self.project


class NoCallLLM(FakeLLM):
    async def classify_intent(self, text: str, tenant_name: str = "the studio") -> Any:
        raise AssertionError("LLM must not be called while paused")

    async def extract_brief(
        self, conversation: str, project_type_hint: str | None = None
    ) -> Any:
        raise AssertionError("LLM must not be called while paused")

    async def draft_message(self, **kwargs: Any) -> str:
        raise AssertionError("LLM must not be called while paused")


class PausedFakeDB:
    """Just enough surface for the intake/continue pause short-circuit."""

    def __init__(self, tenant: dict[str, Any]) -> None:
        self.tenant = tenant
        self.seen: dict[str, dict[str, Any]] = {}
        self.audits: list[dict[str, Any]] = []

    async def fetch_tenant(self, tenant_id: Any) -> dict[str, Any]:
        return self.tenant

    async def fetchval(self, tenant_id: Any, sql: str, *args: Any) -> Any:
        s = " ".join(sql.split()).lower()
        if "select id from conversations" in s:
            return self.seen.get(args[1], {}).get("id")
        if "insert into conversations" in s:
            message_id = args[4]
            if message_id in self.seen:
                return None
            self.seen[message_id] = {"id": uuid4()}
            return self.seen[message_id]["id"]
        raise AssertionError(f"unexpected fetchval: {s}")

    async def fetchrow(self, tenant_id: Any, sql: str, *args: Any) -> Any:
        s = " ".join(sql.split()).lower()
        if "insert into agent_audit_log" in s:
            _, agent_name, action, _entity_type, _entity_id, *_rest, status, error = args
            self.audits.append({"action": action, "status": status, "error": error})
            return {"id": uuid4()}
        if "discord_thread_id" in s:
            return None
        raise AssertionError(f"unexpected fetchrow: {s}")


def _handler_worker(db: Any, llm: Any) -> Any:
    async def call(path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if path == "/intake":
            result = await handle_intake(db, llm, IntakeRequest(**payload))
        else:
            result = await handle_continue(db, llm, ContinueRequest(**payload))
        return result.model_dump()

    return call


def _worker_with_notify(
    *,
    intake: dict[str, Any] | None = None,
    cont: dict[str, Any] | None = None,
    notify: dict[str, Any] | None = None,
) -> tuple[Any, list[tuple[str, dict[str, Any]]]]:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def call(path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        calls.append((path, payload))
        if path == "/intake":
            return intake
        if path == "/conversation/continue":
            return cont
        if path == "/notify":
            return notify
        raise AssertionError(f"unexpected worker path: {path}")

    return call, calls


def _paused_tenant(tenant_id: Any) -> ChannelTenant:
    return ChannelTenant(
        tenant_id,
        "Pixel Forge",
        {"monitored_channel_ids": ["chan-1"], "ai_paused": True},
    )


@pytest.mark.asyncio
async def test_paused_tenant_message_records_escalation_and_never_replies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(discord, "TextChannel", FakeTextChannel)
    monkeypatch.setattr(discord, "Thread", FakeThreadChannel)

    tenant_id = uuid4()
    tenant = _paused_tenant(tenant_id)
    db = PausedFakeDB(
        {"id": tenant_id, "name": tenant.name, "settings": tenant.settings}
    )
    repo = FakeRepo(tenant, {"chan-1"})
    bot = RobloxOpsBot(Settings(), repo)  # type: ignore[arg-type]
    bot._call_worker = _handler_worker(db, NoCallLLM())  # type: ignore[method-assign]

    channel = FakeTextChannel("chan-1")
    message = FakeMessage(channel, content="I want to commission a Y2K hoodie", mid="msg-1")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert channel.sent == [], "paused tenant must not receive an automated reply"
    assert message.created_thread is None, "no thread may be opened while paused"
    assert "msg-1" in db.seen, "the inbound message must still be recorded"
    assert db.audits[-1]["action"] == "ai_paused"
    assert db.audits[-1]["status"] == "escalated"


@pytest.mark.asyncio
async def test_paused_tenant_thread_message_records_escalation_and_never_replies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(discord, "TextChannel", FakeTextChannel)
    monkeypatch.setattr(discord, "Thread", FakeThreadChannel)

    tenant_id = uuid4()
    tenant = _paused_tenant(tenant_id)
    db = PausedFakeDB(
        {"id": tenant_id, "name": tenant.name, "settings": tenant.settings}
    )
    repo = FakeRepo(tenant, {"chan-1"})
    bot = RobloxOpsBot(Settings(), repo)  # type: ignore[arg-type]
    bot._call_worker = _handler_worker(db, NoCallLLM())  # type: ignore[method-assign]

    thread = FakeThreadChannel("thread-1", "chan-1")
    message = FakeMessage(thread, content="Here is the updated design", mid="msg-2")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert thread.sent == [], "paused tenant must not receive an automated reply"
    assert "msg-2" in db.seen
    assert db.audits[-1]["status"] == "escalated"


def _unpaused_bot(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[RobloxOpsBot, ChannelTenant, FakeRepo]:
    monkeypatch.setattr(discord, "TextChannel", FakeTextChannel)
    monkeypatch.setattr(discord, "Thread", FakeThreadChannel)
    tenant = ChannelTenant(
        uuid4(), "Pixel Forge", {"monitored_channel_ids": ["chan-1"]}
    )
    repo = FakeRepo(tenant, {"chan-1"})
    return RobloxOpsBot(Settings(), repo), tenant, repo  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_intake_notifies_instead_of_sending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot, tenant, repo = _unpaused_bot(monkeypatch)
    project_id = uuid4()
    call, calls = _worker_with_notify(
        intake={
            "status": "created",
            "intent": "commission_request",
            "reply": "Thanks! Reference ROB-1.",
            "reference_code": "ROB-1",
            "project_id": str(project_id),
        },
        notify={"status": "sent"},
    )
    bot._call_worker = call  # type: ignore[method-assign]

    channel = FakeTextChannel("chan-1")
    message = FakeMessage(channel, content="I want to commission a hoodie", mid="msg-3")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert message.created_thread is not None
    assert repo.linked == ["thread-99"]
    assert message.created_thread.sent == []
    assert channel.sent == []
    notify_calls = [payload for path, payload in calls if path == "/notify"]
    assert notify_calls == [
        {
            "tenant_id": str(tenant.tenant_id),
            "project_id": str(project_id),
            "kind": "first_message",
            "message": "Thanks! Reference ROB-1.",
        }
    ]


@pytest.mark.asyncio
async def test_intake_falls_back_to_direct_send_when_notify_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot, _tenant, _repo = _unpaused_bot(monkeypatch)
    call, calls = _worker_with_notify(
        intake={
            "status": "created",
            "intent": "commission_request",
            "reply": "Thanks! Reference ROB-1.",
            "reference_code": "ROB-1",
            "project_id": str(uuid4()),
        },
        notify=None,
    )
    bot._call_worker = call  # type: ignore[method-assign]

    channel = FakeTextChannel("chan-1")
    message = FakeMessage(channel, content="I want to commission a hoodie", mid="msg-3")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert message.created_thread is not None
    assert message.created_thread.sent == ["Thanks! Reference ROB-1."]
    assert channel.sent == []
    assert any(path == "/notify" for path, _payload in calls)


@pytest.mark.asyncio
async def test_conversation_continue_notifies_instead_of_sending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot, tenant, _repo = _unpaused_bot(monkeypatch)
    project_id = uuid4()
    reply = "Update on ROB-1 — status is now in progress."
    call, calls = _worker_with_notify(
        cont={"status": "ok", "reply": reply, "project_id": str(project_id)},
        notify={"status": "pending_approval"},
    )
    bot._call_worker = call  # type: ignore[method-assign]

    thread = FakeThreadChannel("thread-1", "chan-1")
    message = FakeMessage(thread, content="Here is an update", mid="msg-4")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert thread.sent == []
    notify_calls = [payload for path, payload in calls if path == "/notify"]
    assert notify_calls == [
        {
            "tenant_id": str(tenant.tenant_id),
            "project_id": str(project_id),
            "kind": "status",
            "message": reply,
        }
    ]


@pytest.mark.asyncio
async def test_conversation_continue_falls_back_to_direct_send_when_notify_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot, _tenant, _repo = _unpaused_bot(monkeypatch)
    reply = "Update on ROB-1 — status is now in progress."
    call, calls = _worker_with_notify(
        cont={"status": "ok", "reply": reply, "project_id": str(uuid4())},
        notify=None,
    )
    bot._call_worker = call  # type: ignore[method-assign]

    thread = FakeThreadChannel("thread-1", "chan-1")
    message = FakeMessage(thread, content="Here is an update", mid="msg-4")

    await bot.on_message(message)  # type: ignore[arg-type]

    assert thread.sent == [reply]
    assert any(path == "/notify" for path, _payload in calls)


# --------------------------------------------------------------------------- #
# Human slash commands are not suppressed by pause
# --------------------------------------------------------------------------- #


class FakeResponse:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.deferred = False

    async def send_message(self, *args: Any, **kwargs: Any) -> None:
        self.sent.append(kwargs)

    async def defer(self, *args: Any, **kwargs: Any) -> None:
        self.deferred = True


class FakeFollowup:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send(self, *args: Any, **kwargs: Any) -> None:
        self.sent.append(kwargs)


class FakeInteraction:
    def __init__(self, guild_id: int = 12345) -> None:
        self.guild_id = guild_id
        self.response = FakeResponse()
        self.followup = FakeFollowup()
        self.user = FakeUser()


async def _invoke(bot: RobloxOpsBot, name: str, interaction: FakeInteraction, **kwargs: Any) -> None:
    command = bot.tree.get_command(name)
    assert command is not None
    await command.callback(interaction, **kwargs)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_help_still_answers_ephemerally_while_paused() -> None:
    tenant = _paused_tenant(uuid4())
    bot = RobloxOpsBot(Settings(), FakeRepo(tenant, set()))  # type: ignore[arg-type]
    bot._register_commands()
    interaction = FakeInteraction()

    await _invoke(bot, "help", interaction)

    assert len(interaction.response.sent) == 1
    assert interaction.response.sent[0]["ephemeral"] is True


@pytest.mark.asyncio
async def test_status_still_answers_ephemerally_while_paused() -> None:
    tenant = _paused_tenant(uuid4())
    bot = RobloxOpsBot(Settings(), FakeRepo(tenant, set()))  # type: ignore[arg-type]
    bot._register_commands()
    interaction = FakeInteraction()

    await _invoke(bot, "status", interaction, reference="ROB-1")

    assert interaction.response.deferred is True
    assert len(interaction.followup.sent) == 1
    assert interaction.followup.sent[0]["ephemeral"] is True
