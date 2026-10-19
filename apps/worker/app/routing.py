"""Least-loaded designer routing for the auto-filled design queue.

The worker connects with the service role (RLS bypassed), so the statements here
are tenant-scoped explicitly. ``pick_designer`` returns the assignee a new
design task should go to: the studio member with the fewest open tasks, falling
back to the tenant owner and finally ``None`` when the tenant has no staff.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

SELECT_DESIGNER_SQL = """
SELECT u.id
FROM users u
LEFT JOIN tasks t
    ON t.tenant_id = u.tenant_id
    AND t.assigned_to = u.id
    AND t.status <> 'done'
WHERE u.tenant_id = $1
    AND u.role IN ('designer', 'manager')
GROUP BY u.id, u.created_at
ORDER BY COUNT(t.id) ASC, u.created_at ASC
LIMIT 1
"""

SELECT_OWNER_SQL = """
SELECT id FROM users
WHERE tenant_id = $1 AND role = 'owner'
ORDER BY created_at ASC
LIMIT 1
"""


async def pick_designer(db: Any, tenant_id: UUID) -> Any | None:
    """Return the least-loaded designer/manager id, else the tenant owner, else None."""
    designer = await db.fetchval(tenant_id, SELECT_DESIGNER_SQL, tenant_id)
    if designer is not None:
        return designer
    return await db.fetchval(tenant_id, SELECT_OWNER_SQL, tenant_id)
