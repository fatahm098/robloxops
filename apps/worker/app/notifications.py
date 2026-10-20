"""Tenant-scoped in-app notifications.

The worker writes with the service role and therefore bypasses RLS, so every
statement filters on ``tenant_id``. Notification delivery is best-effort: a
failed insert or user lookup is logged (without message bodies or secrets) and
never raised, because a notification must not break the domain action that
triggered it.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

from app.db import require_tenant_id

logger = logging.getLogger("robloxops.notifications")

INSERT_SQL = """
INSERT INTO notifications (tenant_id, user_id, project_id, kind, title, body)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
"""

ROLE_USERS_SQL = """
SELECT id, email FROM users
WHERE tenant_id = $1 AND role = ANY($2::text[])
"""


async def notify_user(
    db: Any,
    tenant_id: Any,
    *,
    user_id: Any,
    kind: str,
    title: str,
    body: str | None = None,
    project_id: Any = None,
) -> None:
    """Insert one notification for a user. Best-effort: never raises."""
    try:
        require_tenant_id(tenant_id)
        await db.fetchrow(
            tenant_id,
            INSERT_SQL,
            tenant_id,
            user_id,
            project_id,
            kind,
            title,
            body,
        )
    except Exception as exc:  # noqa: BLE001 - notifications must not break callers
        logger.warning(
            "notification insert failed (tenant=%s user=%s kind=%s): %s",
            tenant_id,
            user_id,
            kind,
            type(exc).__name__,
        )


async def notify_roles(
    db: Any,
    tenant_id: Any,
    roles: Iterable[str],
    *,
    kind: str,
    title: str,
    body: str | None = None,
    project_id: Any = None,
) -> int:
    """Notify every tenant user whose role is in ``roles``; returns the count.

    Best-effort: a failed user lookup returns 0 (the caller continues), and
    per-user insert failures are swallowed by :func:`notify_user`.
    """
    try:
        require_tenant_id(tenant_id)
        role_list = [str(role) for role in roles]
        if not role_list:
            return 0
        rows = await db.fetch(tenant_id, ROLE_USERS_SQL, tenant_id, role_list)
    except Exception as exc:  # noqa: BLE001 - notifications must not break callers
        logger.warning(
            "notification role lookup failed (tenant=%s kind=%s): %s",
            tenant_id,
            kind,
            type(exc).__name__,
        )
        return 0

    count = 0
    for row in rows or []:
        await notify_user(
            db,
            tenant_id,
            user_id=row["id"],
            kind=kind,
            title=title,
            body=body,
            project_id=project_id,
        )
        count += 1
    return count
