"""Pydantic contracts shared by the worker, handlers and bot."""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_INBOUND_CHARS = 4000

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BLANK_LINES = re.compile(r"\n{4,}")

IntentLabel = Literal["commission_request", "general_question", "other"]
ProjectType = Literal["clothing", "accessory", "avatar_item", "game_asset", "other"]


def sanitize_inbound_text(text: str, max_chars: int = MAX_INBOUND_CHARS) -> str:
    """Strip control characters, normalise newlines and cap the length.

    Applied to every piece of customer-authored text before it reaches an LLM
    prompt or the database.
    """
    cleaned = _CONTROL_CHARS.sub("", text or "")
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _BLANK_LINES.sub("\n\n\n", cleaned)
    return cleaned.strip()[:max_chars]


# --------------------------------------------------------------------------- #
# LLM outputs
# --------------------------------------------------------------------------- #


class IntentResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    intent: IntentLabel
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    reasoning: str = Field(default="", max_length=500)

    @property
    def is_commission(self) -> bool:
        return self.intent == "commission_request"


BRIEF_WEIGHTS: dict[str, int] = {
    "project_type": 25,
    "title": 10,
    "style": 20,
    "colors": 15,
    "character": 15,
    "references": 10,
    "special_requests": 5,
}


class BriefSchema(BaseModel):
    """Structured commission brief. Missing values stay empty, never invented."""

    model_config = ConfigDict(extra="ignore")

    project_type: ProjectType = "other"
    title: str = Field(default="", max_length=120)
    style: str = Field(default="", max_length=200)
    colors: list[str] = Field(default_factory=list, max_length=12)
    character: str = Field(default="", max_length=200)
    references: list[str] = Field(default_factory=list, max_length=12)
    resolution: str = Field(default="", max_length=64)
    deadline: str = Field(default="", max_length=120)
    budget_robux: int | None = Field(default=None, ge=0)
    payment_method: str = Field(default="", max_length=64)
    special_requests: str = Field(default="", max_length=1000)

    # Field -> weight, must sum to 100.
    def _is_filled(self, field: str) -> bool:
        value = getattr(self, field)
        if field == "project_type":
            # "other" is the DB-valid fallback and carries no classification,
            # so it does not earn completeness points.
            return value != "other"
        if isinstance(value, list):
            return len(value) > 0
        return bool(str(value).strip())

    def completeness_score(self) -> int:
        return sum(weight for field, weight in BRIEF_WEIGHTS.items() if self._is_filled(field))

    def missing_fields(self) -> list[str]:
        return [field for field in BRIEF_WEIGHTS if not self._is_filled(field)]


class ProjectDraft(BaseModel):
    """Minimal project metadata derived before the DB row is written."""

    title: str = Field(min_length=1, max_length=120)
    project_type: ProjectType = "other"
    customer_discord_id: str
    customer_username: str = ""
    summary: str = Field(default="", max_length=500)


class QACheck(BaseModel):
    """One QA check in the shape the web UI renders (label / value / passed)."""

    label: str = Field(max_length=200)
    value: str = Field(default="", max_length=300)
    passed: bool = False


class QAReport(BaseModel):
    checks: list[QACheck] = Field(default_factory=list)
    score: int = Field(ge=0, le=100)
    max_score: int = Field(default=100, ge=0)
    summary: str = Field(default="", max_length=1000)


# --------------------------------------------------------------------------- #
# Worker API requests / responses
# --------------------------------------------------------------------------- #


class IntakeRequest(BaseModel):
    tenant_id: UUID
    guild_id: str | None = None
    channel_id: str
    message_id: str
    author_id: str
    author_name: str = ""
    content: str
    thread_id: str | None = None


class ContinueRequest(BaseModel):
    tenant_id: UUID
    project_id: UUID | None = None
    channel_id: str
    message_id: str
    author_id: str
    author_name: str = ""
    content: str
    thread_id: str | None = None


class QARequest(BaseModel):
    tenant_id: UUID
    deliverable_id: UUID


class FollowUpRequest(BaseModel):
    tenant_id: UUID
    min_hours: int = Field(default=24, ge=1, le=720)
    limit: int = Field(default=10, ge=1, le=50)


class ReportRequest(BaseModel):
    tenant_id: UUID
    project_id: UUID
    kind: Literal["delivery", "qa", "summary"] = "delivery"


class RevisionCreateRequest(BaseModel):
    tenant_id: UUID
    project_id: UUID
    requested_by: str | None = None
    reason: str


class IntakeResult(BaseModel):
    status: Literal["created", "duplicate", "ignored", "escalated"]
    intent: IntentLabel
    customer_id: UUID | None = None
    project_id: UUID | None = None
    reference_code: str | None = None
    reply: str = ""


class ContinueResult(BaseModel):
    status: Literal["processed", "duplicate", "no_project", "escalated", "human_takeover"]
    project_id: UUID | None = None
    reply: str = ""
    missing_fields: list[str] = Field(default_factory=list)


class BriefRefreshResult(BaseModel):
    project_id: UUID
    brief: BriefSchema
    completeness_score: int
    missing_fields: list[str] = Field(default_factory=list)


class FollowUpDraft(BaseModel):
    project_id: UUID
    reference_code: str
    message: str
    hours_since_update: int
    followup_id: UUID | None = None


class ReportResult(BaseModel):
    project_id: UUID
    reference_code: str
    markdown: str
    report_id: UUID | None = None


# --------------------------------------------------------------------------- #
# Outbound / notification contracts
# --------------------------------------------------------------------------- #

NotifyKind = Literal["deliverable", "brief", "status", "first_message", "followup", "manual"]


class NotifyRequest(BaseModel):
    tenant_id: UUID
    project_id: UUID
    kind: NotifyKind = "status"
    message: str | None = None
    deliverable_id: UUID | None = None


class NotifyResult(BaseModel):
    status: Literal["sent", "pending_approval", "skipped", "failed"]
    outbound_id: UUID | None = None
    message_id: str | None = None
    detail: str = ""


class OutboundDecisionRequest(BaseModel):
    tenant_id: UUID
    outbound_id: UUID
    approver: str | None = None


class ConversationReplyRequest(BaseModel):
    tenant_id: UUID
    project_id: UUID
    content: str = Field(min_length=1, max_length=4000)
    author: str | None = None
