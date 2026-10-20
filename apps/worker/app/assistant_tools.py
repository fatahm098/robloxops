"""Tool surface for the in-web assistant.

Design rules (see docs/ASSISTANT.md):

* ``tenant_id`` is injected by the caller, never read from model output. The
  model only chooses a tool name and its arguments.
* Every SQL statement filters on ``tenant_id`` because the worker connects with
  the service role and therefore bypasses RLS.
* There is no ``delete_*`` tool. Mutations are limited to creating rows and
  changing a project's status.
* ``draft_customer_message`` only *queues* a message; it never calls
  ``outbound.deliver``. A human still approves it in Discord/web.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import UUID, uuid4

from app.outbound import queue_outbound

MAX_TOOL_OUTPUT = 1200

PROJECT_STATUSES = (
    "intake",
    "briefing",
    "brief_review",
    "in_design",
    "qa_check",
    "customer_review",
    "revision",
    "approved",
    "delivered",
    "cancelled",
    "on_hold",
)
PROJECT_TYPES = ("clothing", "accessory", "avatar_item", "game_asset", "other")
TASK_STATUSES = ("pending", "in_progress", "done", "blocked")


@dataclass
class ToolOutcome:
    ok: bool
    summary: str
    payload: str


def _truncate(text: str, limit: int = MAX_TOOL_OUTPUT) -> str:
    return text if len(text) <= limit else text[: limit - 3] + "..."


def _ok(summary: str, data: Any) -> ToolOutcome:
    return ToolOutcome(True, summary, _truncate(json.dumps(data, default=str, ensure_ascii=False)))


def _err(message: str) -> ToolOutcome:
    return ToolOutcome(False, message[:200], _truncate(json.dumps({"error": message}, ensure_ascii=False)))


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _parse_when(value: str | None) -> datetime | None:
    """Accept ``2026-11-01``, ``2026-11-01T10:00`` or a full ISO timestamp."""
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _clean_reference(value: str | None) -> str:
    return (value or "").strip().upper()


async def _find_project(db: Any, tenant_id: UUID, reference: str) -> Any:
    return await db.fetchrow(
        tenant_id,
        """
        SELECT p.id, p.reference_code, p.title, p.status, p.project_type,
               p.deadline, p.price_usd, p.revision_count, p.max_revisions,
               p.discord_thread_id, p.customer_id,
               c.display_name AS customer_name, c.discord_username
          FROM projects p
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.tenant_id = $1 AND upper(p.reference_code) = $2
         LIMIT 1
        """,
        tenant_id,
        _clean_reference(reference),
    )


# --------------------------------------------------------------------------- #
# Read tools
# --------------------------------------------------------------------------- #


async def studio_overview(db: Any, tenant_id: UUID) -> ToolOutcome:
    rows = await db.fetch(
        tenant_id,
        "SELECT status, count(*)::int AS total FROM projects WHERE tenant_id = $1 GROUP BY status",
        tenant_id,
    )
    counts = {row["status"]: row["total"] for row in rows}
    overdue = await db.fetchval(
        tenant_id,
        """
        SELECT count(*)::int FROM tasks
         WHERE tenant_id = $1 AND status <> 'done' AND due_at IS NOT NULL AND due_at < now()
        """,
        tenant_id,
    )
    revenue = await db.fetchval(
        tenant_id,
        """
        SELECT coalesce(sum(price_usd), 0) FROM projects
         WHERE tenant_id = $1
           AND status IN ('approved', 'delivered')
           AND created_at >= date_trunc('month', now())
        """,
        tenant_id,
    )
    active = sum(
        counts.get(status, 0)
        for status in (
            "intake",
            "briefing",
            "brief_review",
            "in_design",
            "qa_check",
            "customer_review",
            "revision",
        )
    )
    data = {
        "active_projects": active,
        "projects_by_status": counts,
        "overdue_tasks": overdue or 0,
        "revenue_usd_this_month": float(revenue or 0),
    }
    return _ok(f"{active} proyek aktif, {overdue or 0} task lewat tenggat", data)


async def list_projects(
    db: Any, tenant_id: UUID, status: str | None = None, limit: int = 10
) -> ToolOutcome:
    status = (status or "").strip() or None
    if status is not None and status not in PROJECT_STATUSES:
        return _err(f"status tidak dikenal: {status}")
    limit = max(1, min(int(limit or 10), 25))
    rows = await db.fetch(
        tenant_id,
        """
        SELECT p.reference_code, p.title, p.status, p.deadline,
               coalesce(c.display_name, c.discord_username, 'tanpa nama') AS customer
          FROM projects p
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.tenant_id = $1
           AND ($2::text IS NULL OR p.status = $2)
         ORDER BY p.created_at DESC
         LIMIT $3
        """,
        tenant_id,
        status,
        limit,
    )
    data = [
        {
            "reference": row["reference_code"],
            "title": row["title"],
            "status": row["status"],
            "deadline": _iso(row["deadline"]),
            "customer": row["customer"],
        }
        for row in rows
    ]
    return _ok(f"{len(data)} proyek ditemukan", {"projects": data})


async def get_project(db: Any, tenant_id: UUID, reference: str) -> ToolOutcome:
    project = await _find_project(db, tenant_id, reference)
    if project is None:
        return _err(f"proyek {reference} tidak ditemukan")

    brief = await db.fetchrow(
        tenant_id,
        "SELECT completeness_score, approved_by_designer FROM briefs WHERE tenant_id = $1 AND project_id = $2",
        tenant_id,
        project["id"],
    )
    revisions = await db.fetch(
        tenant_id,
        """
        SELECT reason, status FROM revisions
         WHERE tenant_id = $1 AND project_id = $2
         ORDER BY created_at DESC LIMIT 5
        """,
        tenant_id,
        project["id"],
    )
    deliverables = await db.fetchval(
        tenant_id,
        "SELECT count(*)::int FROM deliverables WHERE tenant_id = $1 AND project_id = $2",
        tenant_id,
        project["id"],
    )
    data = {
        "reference": project["reference_code"],
        "title": project["title"],
        "status": project["status"],
        "project_type": project["project_type"],
        "customer": project["customer_name"] or project["discord_username"],
        "deadline": _iso(project["deadline"]),
        "price_usd": float(project["price_usd"]) if project["price_usd"] is not None else None,
        "revisions": f"{project['revision_count']}/{project['max_revisions']}",
        "brief_completeness": brief["completeness_score"] if brief else 0,
        "brief_approved": bool(brief["approved_by_designer"]) if brief else False,
        "deliverables": deliverables or 0,
        "open_revisions": [
            {"reason": row["reason"], "status": row["status"]}
            for row in revisions
            if row["status"] in ("open", "in_progress")
        ],
    }
    return _ok(f"{project['reference_code']} — {project['status']}", data)


async def list_tasks(
    db: Any, tenant_id: UUID, status: str | None = None, limit: int = 10
) -> ToolOutcome:
    status = (status or "").strip() or None
    if status is not None and status not in TASK_STATUSES:
        return _err(f"status task tidak dikenal: {status}")
    limit = max(1, min(int(limit or 10), 25))
    rows = await db.fetch(
        tenant_id,
        """
        SELECT t.title, t.status, t.due_at, p.reference_code
          FROM tasks t
          JOIN projects p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
         WHERE t.tenant_id = $1
           AND ($2::text IS NULL OR t.status = $2)
         ORDER BY t.priority DESC, t.created_at DESC
         LIMIT $3
        """,
        tenant_id,
        status,
        limit,
    )
    data = [
        {
            "title": row["title"],
            "status": row["status"],
            "due_at": _iso(row["due_at"]),
            "project": row["reference_code"],
        }
        for row in rows
    ]
    return _ok(f"{len(data)} task", {"tasks": data})


# --------------------------------------------------------------------------- #
# Write tools
# --------------------------------------------------------------------------- #


async def create_project(
    db: Any,
    tenant_id: UUID,
    title: str,
    customer_name: str | None = None,
    project_type: str | None = None,
    deadline: str | None = None,
    price_usd: float | None = None,
) -> ToolOutcome:
    title = (title or "").strip()[:120]
    if not title:
        return _err("judul proyek wajib diisi")

    project_type = (project_type or "other").strip()
    if project_type not in PROJECT_TYPES:
        return _err(f"jenis proyek tidak dikenal: {project_type}")

    when = _parse_when(deadline)
    if deadline and when is None:
        return _err("format tenggat tidak dikenali, pakai YYYY-MM-DD")

    name = (customer_name or "").strip()[:120]
    customer_id: UUID | None = None
    if name:
        row = await db.fetchrow(
            tenant_id,
            """
            SELECT id FROM customers
             WHERE tenant_id = $1
               AND lower(coalesce(display_name, discord_username, '')) = lower($2)
             LIMIT 1
            """,
            tenant_id,
            name,
        )
        if row is not None:
            customer_id = row["id"]

    if customer_id is None:
        handle = "manual:" + str(uuid4())
        row = await db.fetchrow(
            tenant_id,
            """
            INSERT INTO customers (tenant_id, discord_user_id, discord_username, display_name)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            tenant_id,
            handle,
            name or "manual",
            name or "Tanpa nama",
        )
        customer_id = row["id"]

    project = await db.fetchrow(
        tenant_id,
        """
        INSERT INTO projects (
            tenant_id, customer_id, reference_code, title, project_type,
            deadline, price_usd, status
        )
        VALUES ($1, $2, '', $3, $4, $5, $6, 'intake')
        RETURNING id, reference_code, title, status
        """,
        tenant_id,
        customer_id,
        title,
        project_type,
        when,
        price_usd,
    )
    data = {
        "reference": project["reference_code"],
        "title": project["title"],
        "status": project["status"],
        "customer": name or "Tanpa nama",
    }
    return _ok(f"proyek {project['reference_code']} dibuat", data)


async def update_project_status(
    db: Any, tenant_id: UUID, reference: str, status: str, note: str | None = None
) -> ToolOutcome:
    status = (status or "").strip()
    if status not in PROJECT_STATUSES:
        return _err(f"status tidak dikenal: {status}")
    project = await _find_project(db, tenant_id, reference)
    if project is None:
        return _err(f"proyek {reference} tidak ditemukan")
    if project["status"] == status:
        return _ok(f"{project['reference_code']} sudah berstatus {status}", {
            "reference": project["reference_code"],
            "status": status,
            "changed": False,
        })

    updated = await db.fetchrow(
        tenant_id,
        """
        UPDATE projects SET status = $3
         WHERE tenant_id = $1 AND id = $2
        RETURNING reference_code, status
        """,
        tenant_id,
        project["id"],
        status,
    )
    data = {
        "reference": updated["reference_code"],
        "previous_status": project["status"],
        "status": updated["status"],
        "note": (note or "").strip()[:200] or None,
        "changed": True,
    }
    return _ok(f"{updated['reference_code']}: {project['status']} → {status}", data)


async def create_task(
    db: Any,
    tenant_id: UUID,
    reference: str,
    title: str,
    due_at: str | None = None,
    priority: int | None = None,
) -> ToolOutcome:
    title = (title or "").strip()[:200]
    if not title:
        return _err("judul task wajib diisi")
    project = await _find_project(db, tenant_id, reference)
    if project is None:
        return _err(f"proyek {reference} tidak ditemukan")

    when = _parse_when(due_at)
    if due_at and when is None:
        return _err("format tenggat tidak dikenali, pakai YYYY-MM-DD")

    row = await db.fetchrow(
        tenant_id,
        """
        INSERT INTO tasks (tenant_id, project_id, title, due_at, priority)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, status, due_at
        """,
        tenant_id,
        project["id"],
        title,
        when,
        max(0, min(int(priority or 0), 10)),
    )
    data = {
        "project": project["reference_code"],
        "title": row["title"],
        "status": row["status"],
        "due_at": _iso(row["due_at"]),
    }
    return _ok(f"task '{title}' ditambahkan ke {project['reference_code']}", data)


async def log_revision(db: Any, tenant_id: UUID, reference: str, reason: str) -> ToolOutcome:
    reason = (reason or "").strip()[:1000]
    if not reason:
        return _err("alasan revisi wajib diisi")
    project = await _find_project(db, tenant_id, reference)
    if project is None:
        return _err(f"proyek {reference} tidak ditemukan")

    row = await db.fetchrow(
        tenant_id,
        """
        INSERT INTO revisions (tenant_id, project_id, requested_by, reason)
        VALUES ($1, $2, 'assistant', $3)
        RETURNING id, status
        """,
        tenant_id,
        project["id"],
        reason,
    )
    await db.execute(
        tenant_id,
        "UPDATE projects SET revision_count = revision_count + 1 WHERE tenant_id = $1 AND id = $2",
        tenant_id,
        project["id"],
    )
    data = {
        "project": project["reference_code"],
        "reason": reason,
        "status": row["status"],
        "revisions": f"{project['revision_count'] + 1}/{project['max_revisions']}",
    }
    return _ok(f"revisi dicatat untuk {project['reference_code']}", data)


async def draft_customer_message(
    db: Any, tenant_id: UUID, reference: str, body: str
) -> ToolOutcome:
    """Queue a message for human approval. Never delivers it."""
    body = (body or "").strip()[:2000]
    if not body:
        return _err("isi pesan wajib diisi")
    project = await _find_project(db, tenant_id, reference)
    if project is None:
        return _err(f"proyek {reference} tidak ditemukan")

    channel_id = project["discord_thread_id"]
    if not channel_id:
        return _err(
            f"{project['reference_code']} belum punya thread Discord, "
            "jadi pesan tidak bisa diantrekan"
        )

    row = await queue_outbound(
        db,
        tenant_id,
        project_id=project["id"],
        channel_id=channel_id,
        kind="manual",
        body=body,
    )
    data = {
        "project": project["reference_code"],
        "outbound_id": str(row["id"]),
        "status": "pending_approval",
        "preview": body[:200],
    }
    return _ok(f"draf pesan untuk {project['reference_code']} menunggu persetujuan", data)


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #

ToolFn = Callable[..., Awaitable[ToolOutcome]]

IMPLEMENTATIONS: dict[str, ToolFn] = {
    "studio_overview": studio_overview,
    "list_projects": list_projects,
    "get_project": get_project,
    "list_tasks": list_tasks,
    "create_project": create_project,
    "update_project_status": update_project_status,
    "create_task": create_task,
    "log_revision": log_revision,
    "draft_customer_message": draft_customer_message,
}


def _fn(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


TOOLS: list[dict[str, Any]] = [
    _fn(
        "studio_overview",
        "Ringkasan studio: jumlah proyek aktif, sebaran status, task lewat tenggat, pendapatan bulan ini.",
        {},
        [],
    ),
    _fn(
        "list_projects",
        "Daftar proyek terbaru, opsional difilter status.",
        {
            "status": {"type": "string", "enum": list(PROJECT_STATUSES)},
            "limit": {"type": "integer", "minimum": 1, "maximum": 25},
        },
        [],
    ),
    _fn(
        "get_project",
        "Detail satu proyek berdasarkan kode referensi (mis. ROB-105).",
        {"reference": {"type": "string", "description": "Kode referensi proyek"}},
        ["reference"],
    ),
    _fn(
        "list_tasks",
        "Daftar task desainer, opsional difilter status.",
        {
            "status": {"type": "string", "enum": list(TASK_STATUSES)},
            "limit": {"type": "integer", "minimum": 1, "maximum": 25},
        },
        [],
    ),
    _fn(
        "create_project",
        "Buat proyek/komisi baru. Pakai hanya kalau pengguna meminta menambah proyek.",
        {
            "title": {"type": "string", "description": "Judul proyek"},
            "customer_name": {"type": "string", "description": "Nama customer"},
            "project_type": {"type": "string", "enum": list(PROJECT_TYPES)},
            "deadline": {"type": "string", "description": "Tanggal YYYY-MM-DD"},
            "price_usd": {"type": "number", "minimum": 0},
        },
        ["title"],
    ),
    _fn(
        "update_project_status",
        "Ubah status satu proyek.",
        {
            "reference": {"type": "string"},
            "status": {"type": "string", "enum": list(PROJECT_STATUSES)},
            "note": {"type": "string", "description": "Alasan singkat perubahan"},
        },
        ["reference", "status"],
    ),
    _fn(
        "create_task",
        "Tambah task kerja untuk sebuah proyek.",
        {
            "reference": {"type": "string"},
            "title": {"type": "string"},
            "due_at": {"type": "string", "description": "Tanggal YYYY-MM-DD"},
            "priority": {"type": "integer", "minimum": 0, "maximum": 10},
        },
        ["reference", "title"],
    ),
    _fn(
        "log_revision",
        "Catat permintaan revisi customer pada sebuah proyek.",
        {"reference": {"type": "string"}, "reason": {"type": "string"}},
        ["reference", "reason"],
    ),
    _fn(
        "draft_customer_message",
        "Buat DRAF pesan untuk customer. Pesan tidak langsung terkirim; menunggu persetujuan manusia.",
        {
            "reference": {"type": "string"},
            "body": {"type": "string", "description": "Isi pesan, bahasa Indonesia, sopan"},
        },
        ["reference", "body"],
    ),
]


async def run_tool(db: Any, tenant_id: UUID, name: str, raw_arguments: str) -> ToolOutcome:
    """Validate and execute one tool call. Never raises for bad model output."""
    implementation = IMPLEMENTATIONS.get(name)
    if implementation is None:
        return _err(f"tool tidak dikenal: {name}")

    try:
        arguments = json.loads(raw_arguments or "{}")
    except json.JSONDecodeError:
        return _err("argumen tool bukan JSON yang valid")
    if not isinstance(arguments, dict):
        return _err("argumen tool harus berupa objek JSON")

    # Drop keys the schema does not declare: the model must not smuggle
    # tenant_id (or anything else) into a query.
    allowed = set(_PARAM_NAMES.get(name, ()))
    extra = set(arguments) - allowed
    if extra:
        return _err(f"argumen tidak dikenal: {', '.join(sorted(extra))}")

    try:
        return await implementation(db, tenant_id, **arguments)
    except TypeError as exc:
        return _err(f"argumen tidak sesuai: {exc}")
    except Exception as exc:  # noqa: BLE001 - a tool failure must not kill the turn
        return _err(f"{type(exc).__name__}: {exc}")


_PARAM_NAMES: dict[str, tuple[str, ...]] = {
    "studio_overview": (),
    "list_projects": ("status", "limit"),
    "get_project": ("reference",),
    "list_tasks": ("status", "limit"),
    "create_project": ("title", "customer_name", "project_type", "deadline", "price_usd"),
    "update_project_status": ("reference", "status", "note"),
    "create_task": ("reference", "title", "due_at", "priority"),
    "log_revision": ("reference", "reason"),
    "draft_customer_message": ("reference", "body"),
}


def summarize_arguments(name: str, raw_arguments: str) -> str:
    """Audit-safe one-liner: never dump a whole message body."""
    try:
        arguments = json.loads(raw_arguments or "{}")
    except json.JSONDecodeError:
        return "invalid json"
    if not isinstance(arguments, dict):
        return "invalid json"
    parts = []
    for key, value in arguments.items():
        text = str(value)
        parts.append(f"{key}={text[:60]}")
    return " ".join(parts)[:200]


__all__ = [
    "IMPLEMENTATIONS",
    "TOOLS",
    "ToolOutcome",
    "run_tool",
    "summarize_arguments",
]
