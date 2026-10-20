"""Portfolio publishing: draft a caption when a project finishes, publish on approval.

Flow: ``draft_for_project`` is called when a project reaches ``delivered`` or
``approved``. It asks the LLM for a short caption and stores a ``queued`` row.
Nothing is posted until a designer clicks Publish in the web review queue, which
calls ``publish``.

Only images are supported (X media upload v1.1 single-shot). Video needs the
chunked upload flow and is deliberately out of scope.

The worker uses the service role and bypasses RLS, so every query filters
``tenant_id``. Credentials come from Supabase Vault and are never logged.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets as random_secrets
import time
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from app.db import json_dict, require_tenant_id
from app.handlers import log_audit, summarize
from app.llm import LLMError, LLMProtocol
from app.models import PortfolioDraftResult, PortfolioPublishResult
from app.secrets import get_tenant_secret

logger = logging.getLogger("robloxops.social")

AGENT_NAME = "portfolio_agent"
PLATFORM = "x"
X_TWEETS_URL = "https://api.x.com/2/tweets"
X_MEDIA_URL = "https://upload.twitter.com/1.1/media/upload.json"
MAX_CAPTION = 240
MAX_MEDIA = 4

PROJECT_SQL = """
SELECT p.id, p.reference_code, p.title, p.project_type, p.status,
       b.structured_data
  FROM projects p
  LEFT JOIN briefs b ON b.project_id = p.id AND b.tenant_id = p.tenant_id
 WHERE p.tenant_id = $1 AND p.id = $2
"""

ACTIVE_POST_SQL = """
SELECT id FROM portfolio_posts
 WHERE tenant_id = $1 AND project_id = $2 AND platform = $3 AND status <> 'rejected'
 LIMIT 1
"""

INSERT_POST_SQL = """
INSERT INTO portfolio_posts (tenant_id, project_id, platform, status, caption, media_urls)
VALUES ($1, $2, $3, 'queued', $4, $5::jsonb)
RETURNING id, caption, status
"""

POST_SQL = """
SELECT id, tenant_id, project_id, platform, status, caption, media_urls
  FROM portfolio_posts
 WHERE tenant_id = $1 AND id = $2
"""


async def draft_for_project(
    db: Any,
    llm: LLMProtocol,
    tenant_id: UUID,
    project_id: UUID,
    media_urls: list[dict[str, str]] | None = None,
) -> PortfolioDraftResult:
    """Create one queued portfolio post for a finished project."""
    require_tenant_id(tenant_id)

    existing = await db.fetchval(
        tenant_id,
        ACTIVE_POST_SQL,
        tenant_id,
        project_id,
        PLATFORM,
    )
    if existing is not None:
        return PortfolioDraftResult(status="duplicate", post_id=existing, detail="post already exists")

    row = await db.fetchrow(tenant_id, PROJECT_SQL, tenant_id, project_id)
    if row is None:
        return PortfolioDraftResult(status="skipped", detail="unknown project")

    project = {
        "reference_code": row["reference_code"],
        "title": row["title"],
        "project_type": row["project_type"],
        "status": row["status"],
    }
    brief = json_dict(row["structured_data"])

    try:
        drafted = await llm.draft_portfolio_caption(project=project, brief=brief, platform=PLATFORM)
        caption = _clean_caption(drafted.caption)
    except LLMError as exc:
        await log_audit(
            db,
            tenant_id,
            agent_name=AGENT_NAME,
            action="portfolio_draft",
            status="failure",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"reference={row['reference_code']}",
            error_message=summarize(exc, limit=300),
        )
        return PortfolioDraftResult(status="failed", detail="caption generation failed")

    media = [
        {"path": str(item.get("path") or ""), "url": str(item.get("url") or "")}
        for item in (media_urls or [])
        if item.get("url")
    ][:MAX_MEDIA]

    inserted = await db.fetchrow(
        tenant_id,
        INSERT_POST_SQL,
        tenant_id,
        project_id,
        PLATFORM,
        caption,
        json.dumps(media),
    )

    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="portfolio_drafted",
        entity_type="project",
        entity_id=project_id,
        input_summary=f"reference={row['reference_code']} media={len(media)}",
        output_summary=f"post_id={inserted['id']} chars={len(caption)}",
        model_used=type(llm).__name__,
    )
    return PortfolioDraftResult(
        status="drafted",
        post_id=inserted["id"],
        caption=caption,
        detail=f"{len(media)} media",
    )


def _clean_caption(raw: str) -> str:
    """Collapse whitespace and keep at most two hashtags."""
    text = " ".join((raw or "").split())
    words = text.split(" ")
    hashtags = 0
    kept: list[str] = []
    for word in words:
        if word.startswith("#"):
            hashtags += 1
            if hashtags > 2:
                continue
        kept.append(word)
    return " ".join(kept)[:MAX_CAPTION].strip()


async def publish(db: Any, tenant_id: UUID, post_id: UUID) -> PortfolioPublishResult:
    """Publish one queued post to X. Marks the row ``failed`` instead of raising."""
    require_tenant_id(tenant_id)

    post = await db.fetchrow(tenant_id, POST_SQL, tenant_id, post_id)
    if post is None:
        return PortfolioPublishResult(status="skipped", error="unknown post")
    if post["status"] not in ("queued", "failed"):
        return PortfolioPublishResult(status="skipped", error=f"post is {post['status']}")

    credentials = await _credentials(db, tenant_id)
    if credentials is None:
        return await _fail(db, tenant_id, post_id, "X account is not connected")

    caption = str(post["caption"] or "").strip()
    if not caption:
        return await _fail(db, tenant_id, post_id, "caption is empty")

    media = post["media_urls"]
    if isinstance(media, str):
        try:
            media = json.loads(media)
        except json.JSONDecodeError:
            media = []
    media = media if isinstance(media, list) else []

    await db.execute(
        tenant_id,
        "UPDATE portfolio_posts SET status = 'publishing', error = NULL WHERE tenant_id = $1 AND id = $2",
        tenant_id,
        post_id,
    )

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            media_ids = await _upload_media(client, credentials, media)
            payload: dict[str, Any] = {"text": caption}
            if media_ids:
                payload["media"] = {"media_ids": media_ids}
            response = await client.post(
                X_TWEETS_URL,
                json=payload,
                headers={"Authorization": _oauth1_header("POST", X_TWEETS_URL, credentials)},
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        detail = summarize(exc.response.text, limit=400) or f"HTTP {exc.response.status_code}"
        return await _fail(db, tenant_id, post_id, detail)
    except (httpx.HTTPError, ValueError) as exc:
        return await _fail(db, tenant_id, post_id, summarize(exc, limit=400))

    tweet_id = str((data.get("data") or {}).get("id") or "")
    if not tweet_id:
        return await _fail(db, tenant_id, post_id, "X returned no tweet id")

    external_url = f"https://x.com/i/web/status/{tweet_id}"
    await db.execute(
        tenant_id,
        """
        UPDATE portfolio_posts
           SET status = 'published', external_id = $3, external_url = $4,
               published_at = now(), error = NULL
         WHERE tenant_id = $1 AND id = $2
        """,
        tenant_id,
        post_id,
        tweet_id,
        external_url,
    )
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="portfolio_published",
        entity_type="portfolio_post",
        entity_id=post_id,
        input_summary=f"media={len(media)}",
        output_summary=f"tweet_id={tweet_id}",
    )
    return PortfolioPublishResult(
        status="published", external_id=tweet_id, external_url=external_url
    )


async def reject(db: Any, tenant_id: UUID, post_id: UUID, reason: str = "") -> dict[str, Any]:
    require_tenant_id(tenant_id)
    row = await db.fetchrow(
        tenant_id,
        """
        UPDATE portfolio_posts
           SET status = 'rejected', error = $3
         WHERE tenant_id = $1 AND id = $2 AND status IN ('queued', 'failed')
        RETURNING id, status
        """,
        tenant_id,
        post_id,
        summarize(reason, limit=500) or None,
    )
    if row is None:
        return {"status": "skipped", "detail": "post not found or already decided"}
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="portfolio_rejected",
        entity_type="portfolio_post",
        entity_id=post_id,
        input_summary=summarize(reason, limit=200),
    )
    return {"status": "rejected", "detail": "ok"}


async def _fail(
    db: Any, tenant_id: UUID, post_id: UUID, error: str
) -> PortfolioPublishResult:
    await db.execute(
        tenant_id,
        "UPDATE portfolio_posts SET status = 'failed', error = $3 WHERE tenant_id = $1 AND id = $2",
        tenant_id,
        post_id,
        summarize(error, limit=500),
    )
    await log_audit(
        db,
        tenant_id,
        agent_name=AGENT_NAME,
        action="portfolio_publish_failed",
        status="failure",
        entity_type="portfolio_post",
        entity_id=post_id,
        error_message=summarize(error, limit=500),
    )
    logger.warning("portfolio publish failed tenant=%s post=%s: %s", tenant_id, post_id, error)
    return PortfolioPublishResult(status="failed", error=summarize(error, limit=300))


class XCredentials:
    __slots__ = ("api_key", "api_secret", "access_token", "access_secret")

    def __init__(self, api_key: str, api_secret: str, access_token: str, access_secret: str) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token = access_token
        self.access_secret = access_secret


async def _credentials(db: Any, tenant_id: UUID) -> XCredentials | None:
    api_key = await get_tenant_secret(db, tenant_id, "X_API_KEY")
    api_secret = await get_tenant_secret(db, tenant_id, "X_API_SECRET")
    access_token = await get_tenant_secret(db, tenant_id, "X_ACCESS_TOKEN")
    access_secret = await get_tenant_secret(db, tenant_id, "X_ACCESS_SECRET")
    if not all((api_key, api_secret, access_token, access_secret)):
        return None
    return XCredentials(api_key, api_secret, access_token, access_secret)


def _enc(value: str) -> str:
    return quote(str(value), safe="-._~")


def _oauth1_header(method: str, url: str, credentials: XCredentials) -> str:
    """Build an OAuth 1.0a header. X signs the URL + oauth params, not JSON bodies."""
    params = {
        "oauth_consumer_key": credentials.api_key,
        "oauth_nonce": random_secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": credentials.access_token,
        "oauth_version": "1.0",
    }
    normalized = "&".join(f"{_enc(key)}={_enc(value)}" for key, value in sorted(params.items()))
    base_string = f"{method.upper()}&{_enc(url)}&{_enc(normalized)}"
    signing_key = f"{_enc(credentials.api_secret)}&{_enc(credentials.access_secret)}"
    digest = hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    params["oauth_signature"] = base64.b64encode(digest).decode()

    header = ", ".join(f'{_enc(key)}="{_enc(value)}"' for key, value in sorted(params.items()))
    return f"OAuth {header}"


async def _upload_media(
    client: httpx.AsyncClient, credentials: XCredentials, media: list[Any]
) -> list[str]:
    """Download each media URL and upload it to X. Returns media ids."""
    media_ids: list[str] = []
    for item in media[:MAX_MEDIA]:
        url = item.get("url") if isinstance(item, dict) else None
        if not isinstance(url, str) or not url:
            continue
        download = await client.get(url)
        download.raise_for_status()
        content_type = download.headers.get("content-type", "image/png").split(";")[0]
        if not content_type.startswith("image/"):
            logger.info("skipping non-image media (%s)", content_type)
            continue
        upload = await client.post(
            X_MEDIA_URL,
            files={"media": ("image", download.content, content_type)},
            headers={"Authorization": _oauth1_header("POST", X_MEDIA_URL, credentials)},
        )
        upload.raise_for_status()
        media_id = upload.json().get("media_id_string")
        if media_id:
            media_ids.append(str(media_id))
    return media_ids
