# neurocad/core/engine/lib/word/history.py

"""
Page history — snapshots (PageHist) of page content.

A snapshot captures html + content_json + css of a page at a point
in time. Snapshots are written:

  - on save, BEFORE the page is updated (see word/service.py →
    save_content) — this keeps the previous state recoverable;
  - on rollback, BEFORE the page is reverted — so the rollback
    itself is undoable;
  - on rollback, AFTER the page is reverted — an audit record
    with action='rollback'.

This module owns the READ + MANAGE side of the history:

    - list_history(page_id, nav_id)          — metadata only
    - get_history_item(hist_id, page_id, nav_id)
    - rollback(page_id, nav_id, hist_id)     — revert to snapshot
    - delete_history_item(page_id, hist_id, nav_id)
    - clear_history(page_id, nav_id)

Plus one helper used by service.save_content:

    - is_duplicate_snapshot(session, page_id, html, json, css)

`get_history_item` patches the returned `html` before returning:
data-creative-id on every core-creative section is rewritten to the
page's CURRENT active creative_id. This guarantees the preview
modal shows the current state of the creative, even for snapshots
saved with an older id. The patch itself lives in word/creative.py.

`rollback` does NOT rebuild the CSS — the snapshot already holds
the frozen CSS that was in effect when it was taken, and restoring
it as-is is exactly what "rollback" should do.

Namespace: CoreEngineLibWordHistory*
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import select
from sqlalchemy import delete as sa_delete

from ....models.base import Page
from ....models.page_hist import PageHist
from .....utils.sqlite import get_db_sqlite

from .creative import patch_creative_blocks
from .css import write_page_css_file


# ============================================
# PUBLIC API
# ============================================

async def list_history(
    page_id: int,
    nav_id: int,
) -> Optional[List[Dict[str, Any]]]:
    """
    List all snapshots for a page, newest first.

    Does NOT return html / content_json / css (heavy) — only metadata.
    For a full snapshot — use get_history_item().

    Returns None if page not found, [] if no snapshots.
    """
    async for session in get_db_sqlite():
        # Verify page belongs to this nav
        page_stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page_res = await session.execute(page_stmt)
        page = page_res.scalar_one_or_none()
        if not page:
            return None

        stmt = (
            select(PageHist)
            .where(PageHist.page_id == page_id)
            .order_by(PageHist.created_at.desc())
        )
        result = await session.execute(stmt)
        snapshots = result.scalars().all()

        return [
            {
                "id": s.id,
                "action": s.action,
                "note": s.note,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in snapshots
        ]

    return None


async def get_history_item(
    hist_id: int,
    page_id: int,
    nav_id: int,
) -> Optional[Dict[str, Any]]:
    """
    Get one full snapshot (html + content_json + css).

    Returns None if the snapshot does not exist or the page does
    not belong to this nav.

    The `html` field is patched before return: data-creative-id on
    every core-creative section is rewritten to the page's CURRENT
    active creative_id. This guarantees the preview modal shows the
    current state of the creative, even for snapshots saved with
    an older id.
    """
    async for session in get_db_sqlite():
        page_stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page_res = await session.execute(page_stmt)
        page = page_res.scalar_one_or_none()
        if not page:
            return None

        stmt = select(PageHist).where(
            PageHist.id == hist_id,
            PageHist.page_id == page_id,
        )
        result = await session.execute(stmt)
        s = result.scalar_one_or_none()
        if not s:
            return None

        # ===== PATCH HTML ON READ =====
        # Rewrite data-creative-id to the page's current active
        # creative_id — so the history preview renders the block
        # with the CURRENT creative data, not whatever was
        # captured in the snapshot.
        html = await patch_creative_blocks(s.html, page_id, session)

        return {
            "id": s.id,
            "page_id": s.page_id,
            "html": html,
            "content_json": s.content_json,
            "css": s.css,
            "action": s.action,
            "note": s.note,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }

    return None


async def rollback(
    page_id: int,
    nav_id: int,
    hist_id: int,
    user_note: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Roll the page back to the given snapshot.

    Flow:
      1. Find page and snapshot.
      2. Snapshot the CURRENT (pre-rollback) state into page_hist
         with action='user_edit' — so the rollback itself is undoable.
      3. Set Page.content / Page.content_json / Page.css to the
         snapshot values.
      4. Write a new record with action='rollback' — audit trail.
      5. Commit.
      6. Overwrite the static CSS file so the public page picks up
         the rolled-back CSS (see word/view.js → buildArticle).

    NOTE: we do NOT rebuild the CSS here. The snapshot already
    holds the frozen CSS that was in effect when it was taken —
    restoring it as-is is exactly what "rollback" should do.

    Returns updated data or None if page / snapshot not found.
    """
    async for session in get_db_sqlite():
        # ----- Find page -----
        page_stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page_res = await session.execute(page_stmt)
        page = page_res.scalar_one_or_none()
        if not page:
            return None

        # ----- Find snapshot -----
        hist_stmt = select(PageHist).where(
            PageHist.id == hist_id,
            PageHist.page_id == page_id,
        )
        hist_res = await session.execute(hist_stmt)
        snapshot = hist_res.scalar_one_or_none()
        if not snapshot:
            return None

        # ----- Snapshot current state (before rollback) -----
        current_html = page.content or ""
        current_json = page.content_json
        current_css = page.css or ""

        if current_html or current_css:
            is_dup = await is_duplicate_snapshot(
                session, page_id, current_html, current_json, current_css
            )
            if not is_dup:
                session.add(PageHist(
                    page_id=page_id,
                    html=current_html,
                    content_json=current_json,
                    css=current_css,
                    action="user_edit",
                    note=user_note,
                ))

        # ----- Apply snapshot -----
        page.content = snapshot.html
        page.content_json = snapshot.content_json
        page.css = snapshot.css
        page.updated_at = datetime.now()

        # ----- Audit trail: new record with action='rollback' -----
        session.add(PageHist(
            page_id=page_id,
            html=snapshot.html,
            content_json=snapshot.content_json,
            css=snapshot.css,
            action="rollback",
            note=f"rollback to snapshot id={hist_id}",
        ))

        await session.commit()
        await session.refresh(page)

        # ===== Overwrite static CSS file with the rolled-back CSS =====
        write_page_css_file(page.id, page.css)

        return {
            "id": page.id,
            "title": page.title,
            "content": page.content,
            "content_json": page.content_json,
            "css": page.css,
            "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        }

    return None


async def delete_history_item(
    page_id: int,
    hist_id: int,
    nav_id: int,
) -> bool:
    """
    Delete ONE snapshot from a page's history.

    The page itself is NOT touched — only the PageHist row.

    Verification:
      - the page must exist and belong to the current nav;
      - the snapshot must exist and belong to that page.

    Returns True on success, False otherwise.
    """
    async for session in get_db_sqlite():
        # Verify page belongs to this nav
        page_stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page_res = await session.execute(page_stmt)
        page = page_res.scalar_one_or_none()
        if not page:
            return False

        # Find the snapshot
        hist_stmt = select(PageHist).where(
            PageHist.id == hist_id,
            PageHist.page_id == page_id,
        )
        hist_res = await session.execute(hist_stmt)
        snapshot = hist_res.scalar_one_or_none()
        if not snapshot:
            return False

        await session.delete(snapshot)
        await session.commit()
        return True

    return False


async def clear_history(
    page_id: int,
    nav_id: int,
) -> bool:
    """
    Delete ALL snapshots of a page.

    The page itself is NOT touched — only the PageHist rows that
    reference it.

    Verification:
      - the page must exist and belong to the current nav.

    Returns True on success, False otherwise.
    """
    async for session in get_db_sqlite():
        # Verify page belongs to this nav
        page_stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page_res = await session.execute(page_stmt)
        page = page_res.scalar_one_or_none()
        if not page:
            return False

        await session.execute(
            sa_delete(PageHist).where(PageHist.page_id == page_id)
        )
        await session.commit()
        return True

    return False


# ============================================
# HELPERS
# ============================================

async def is_duplicate_snapshot(
    session,
    page_id: int,
    html: str,
    content_json: Optional[str],
    css: Optional[str],
) -> bool:
    """
    Return True if the LAST snapshot for this page has identical
    html AND content_json AND css — to skip writing duplicates.

    Public (no leading underscore) because word/service.py calls
    it from save_content, before adding a new snapshot.
    """
    stmt = (
        select(PageHist)
        .where(PageHist.page_id == page_id)
        .order_by(PageHist.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    last = result.scalar_one_or_none()
    if not last:
        return False

    return (
        last.html == html
        and last.content_json == content_json
        and (last.css or "") == (css or "")
    )