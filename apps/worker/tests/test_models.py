"""Tests for Pydantic contracts and input sanitisation."""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import (
    BriefSchema,
    IntentResult,
    IntakeRequest,
    QACheck,
    QAReport,
    sanitize_inbound_text,
)


def test_sanitize_strips_control_characters_but_keeps_newlines() -> None:
    raw = "hello\x00\x07 world\n\n\n\nnext\tline"
    cleaned = sanitize_inbound_text(raw)
    assert "\x00" not in cleaned
    assert "\x07" not in cleaned
    assert "\n" in cleaned
    assert "\t" in cleaned


def test_sanitize_caps_length() -> None:
    cleaned = sanitize_inbound_text("a" * 10_000)
    assert len(cleaned) == 4000


def test_brief_completeness_and_missing_fields() -> None:
    empty = BriefSchema()
    assert empty.completeness_score() == 0
    assert "project_type" in empty.missing_fields()

    full = BriefSchema(
        project_type="clothing",
        title="Y2K shirt",
        style="y2k",
        colors=["pink", "white"],
        character="female avatar",
        references=["https://example.com/ref.png"],
        special_requests="cropped fit",
    )
    assert full.completeness_score() == 100
    assert full.missing_fields() == []


def test_brief_partial_score() -> None:
    brief = BriefSchema(project_type="clothing", style="streetwear", colors=["black"])
    assert brief.completeness_score() == 60
    assert "references" in brief.missing_fields()


def test_intent_confidence_is_bounded() -> None:
    with pytest.raises(ValidationError):
        IntentResult(intent="commission_request", confidence=1.5)


def test_project_type_uses_other_not_unknown() -> None:
    brief = BriefSchema(project_type="other")
    assert brief.project_type == "other"
    assert brief.completeness_score() == 0

    with pytest.raises(ValidationError):
        BriefSchema(project_type="unknown")


def test_qa_report_score_is_bounded() -> None:
    with pytest.raises(ValidationError):
        QAReport(score=101)


def test_qa_report_uses_checks_and_max_score() -> None:
    report = QAReport(
        checks=[QACheck(label="Triangle count", value="3,420 / 4,000", passed=True)],
        score=98,
    )
    dumped = report.model_dump()
    assert dumped["max_score"] == 100
    assert dumped["checks"][0] == {
        "label": "Triangle count",
        "value": "3,420 / 4,000",
        "passed": True,
    }
    assert "items" not in dumped


def test_intake_request_parses_uuid() -> None:
    tenant_id = uuid4()
    req = IntakeRequest(
        tenant_id=str(tenant_id),
        channel_id="c",
        message_id="m",
        author_id="u",
        content="hi",
    )
    assert req.tenant_id == tenant_id
