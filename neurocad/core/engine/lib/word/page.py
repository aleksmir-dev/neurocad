# neurocad/core/engine/lib/word/page.py

"""
Page reading — load a page by date/time or by ID, and serialize
it to the dict the frontend consumes.

This module owns the READ side of CoreEngineLibWordService:

    - get_by_datetime(date, time, nav_id)
    - get_by_id(page_id, nav_id)
    - page_to_dict(session, page)   ← the serializer

The WRITE side (`save_content`) stays in `word/service.py` — it
touches media extraction, creative patching, CSS rebuild, and
snapshots, and is too entangled to move without dragging half of
the service along.

`page_to_dict` fills the following computed fields:

  - `creative_id` — the id of the creative currently attached to
    the page (the active placement, date_end IS NULL). Read from
    the `placements` table, NOT from a column on Page. The editor's
    creative block uses it to fill the block on drop and on load
    (see word/editor/creative.js). None when no creative attached.

  - `content` — patched before return: data-creative-id on every
    core-creative section is rewritten to the current creative_id.
    This guarantees the frontend (editor, admin preview, history
    preview) always sees the current id, even for pages whose HTML
    was never re-saved after the creative changed.

  - `public_url` — full public URL of the page on the OWNER's host
    (subdomain or custom domain). Used by the editor's "Open public
    version" button.

  - `public_host` — the bare hostname without scheme or path
    (e.g. "testuser3.neurocad-dev.ru" or "atou.ru"). Used by the
    editor to substitute the real host into the footer block when
    a page is loaded — see dataloader.js → _applyFooterBrand().

Namespace: CoreEngineLibWordPage*
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from sqlalchemy import select

from ....models.base import Page
from .....utils.sqlite import get_db_sqlite

from .creative import (
    load_active_creative_id,
    patch_creative_id_in_html,
)
from .url import (
    build_public_url,
    public_host_from_url,
)


# ============================================
# PUBLIC API
# ============================================

async def get_by_datetime(
    date: str,
    time: str,
    nav_id: int,
) -> Optional[Dict[str, Any]]:
    """
    Find page by date and time within a nav instance.

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    datetime in DB has microseconds (15:39:10.666406),
    so we search in range [dt_start, dt_start + 1 sec).
    """
    try:
        dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
    except ValueError as e:
        print(f"[Word] Invalid date/time: {date} {time} — {e}")
        return None

    dt_end = dt_start + timedelta(seconds=1)

    async for session in get_db_sqlite():
        stmt = select(Page).where(
            Page.nav_id == nav_id,
            Page.datetime >= dt_start,
            Page.datetime < dt_end,
            Page.is_delete == 0,
        )
        result = await session.execute(stmt)
        page = result.scalar_one_or_none()

        if not page:
            return None

        return await page_to_dict(session, page)

    return None


async def get_by_id(
    page_id: int,
    nav_id: int,
) -> Optional[Dict[str, Any]]:
    """Find page by ID within a nav instance."""
    async for session in get_db_sqlite():
        stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        result = await session.execute(stmt)
        page = result.scalar_one_or_none()

        if not page:
            return None

        return await page_to_dict(session, page)

    return None


async def page_to_dict(session, page) -> Dict[str, Any]:
    """
    Serialize Page model to dict.

    Async because it also resolves the page's absolute public URL
    and public host (via word/url.py) and queries the `placements`
    table to attach the current creative_id. See module docstring
    for the full field list.
    """
    public_url = await build_public_url(page)
    public_host = public_host_from_url(public_url)

    creative_id = await load_active_creative_id(session, page.id)

    # ===== PATCH CONTENT ON READ =====
    # Rewrite data-creative-id on every core-creative section to
    # the page's current active creative_id. This handles the case
    # where the page's creative was changed via the page
    # properties (PUT /pages/item) — a route that does NOT
    # re-save the HTML, so the saved data-creative-id can be
    # stale. The frontend always sees the current id.
    content = page.content
    if content and 'core-creative' in content:
        content = patch_creative_id_in_html(content, creative_id)

    return {
        "id": page.id,
        "nav_id": page.nav_id,
        "datetime": page.datetime.isoformat() if page.datetime else None,
        "title": page.title,
        "description": page.description,
        "logo": page.logo,
        "content": content,
        "content_json": page.content_json,
        "css": page.css,
        "is_active": page.is_active,
        "is_delete": page.is_delete,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "rss_yandex_id": page.rss_yandex_id,
        "is_template": int(page.is_template) if page.is_template is not None else 0,
        "template_id": page.template_id,
        "creative_id": creative_id,
        "public_url": public_url,
        "public_host": public_host,
    }