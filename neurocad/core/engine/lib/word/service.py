# neurocad/core/engine/lib/word/service.py

"""
Word service — page content, history, and media.

Read/write access to Page and PageHist records, scoped to a nav
instance (Page.nav_id). Media lives under media/<nav_id>/.

Main responsibilities:
    - Load pages by date/time or ID.
    - Save page content (HTML + GrapesJS JSON + CSS) and write a
      snapshot of the previous state to page_hist.
    - List / fetch / roll back / delete snapshots.
    - List and upload media for a nav.

CSS handling:
    The full page CSS is rebuilt from scratch on every save
    (content.css + used blocks/*.css + used fx/*.css + custom CSS)
    and frozen into Page.css. The public page loads only that file
    (plus the wrapper public.css) — it never scans the editor
    directory at runtime.

Media handling (smart data-URI extraction):
    On save, `content` and `content_json` are passed through
    `editor.io.media.extract_from_html` / `extract_from_json`.
    Data-URIs larger than the per-URI threshold (50 KB) — or any
    URIs at all, if the page-wide sum exceeds 1 MB — are written
    to `media/<nav_id>/<uuid>.<ext>` and replaced with public URLs.
    Small icons (< 50 KB) stay inline, so pasting a tiny image via
    the editor is still possible.

Constants:
    `MEDIA_URL` and `SPECIAL_NAMES` live in `word/constants.py`.
    They are imported here — and re-exported, so existing callers
    that did `from ..service import MEDIA_URL` keep working.

Namespace: CoreEngineLibWord*
"""

import os
import re
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from fastapi import UploadFile

from sqlalchemy import select
from sqlalchemy import delete as sa_delete

from ....models.base import Page
from ....models.page_hist import PageHist
from .....utils.sqlite import get_db_sqlite

# Public pages module — provides the static namespace for page CSS files.
# The URL prefix is what view.js uses for the <link> tag.
from ..pages.public.service import PAGES_CSS_DIR, PAGES_CSS_URL
from .....utils.css import ensure_css_file

# Full-CSS builder — assembles content.css + used blocks/*.css +
# used fx/*.css + custom page CSS, at every save.
from .css_builder import build_full_page_css

# Constants — MEDIA_URL and SPECIAL_NAMES live in a dedicated
# module so that editor/io/media.py can import MEDIA_URL without
# a circular import through this module.
from .constants import MEDIA_URL, SPECIAL_NAMES

# Smart data-URI extraction — moves large inline images from
# `content` / `content_json` into media/<nav_id>/.
#
# `editor` is a SUBPACKAGE of `word` (word/editor/), so the import
# is `.editor...` — NOT `..editor...`. The latter would resolve to
# `lib/editor`, which does not exist.
from .editor.io.media import extract_from_html, extract_from_json


# ============================================
# RE-EXPORT
# ============================================
# MEDIA_URL and SPECIAL_NAMES are imported from `.constants`
# above. They stay available as `service.MEDIA_URL` and
# `service.SPECIAL_NAMES` — nothing to do here. Any module that
# previously imported them from `word.service` keeps working.


class CoreEngineLibWordService:
    """Service for page content and assets."""

    # ========================================
    # PAGE BY DATETIME
    # ========================================

    @staticmethod
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

            return _page_to_dict(page)

        return None

    # ========================================
    # PAGE BY ID
    # ========================================

    @staticmethod
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

            return _page_to_dict(page)

        return None

    # ========================================
    # SAVE CONTENT
    # ========================================

    @staticmethod
    async def save_content(
        page_id: int,
        nav_id: int,
        content: Optional[str],
        content_json: Optional[str],
        css: Optional[str] = None,
        user_note: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Save page content and write a snapshot to page_hist.

        Flow:
          0. Smart media extraction — move large data-URIs from
             `content` and `content_json` into media/<nav_id>/.
             (see editor.io.media — threshold policy: 50 KB per URI,
              1 MB per page; small icons stay inline)
          1. Find page.
          2. Rebuild the full page CSS from scratch:
               content.css + used blocks/*.css + used fx/*.css + custom.
             (see css_builder.build_full_page_css)
          3. If html / content_json / css actually changed — write a
             snapshot of the CURRENT (pre-save) state to page_hist
             with action='user_edit'. Duplicates are skipped.
          4. Update Page.content / Page.content_json / Page.css.
          5. Commit.
          6. Write the page's CSS to a static file under
             PAGES_CSS_DIR / PAGES_CSS_URL so the public page can
             <link> to it (see word/view.js → buildArticle).

        user_note — optional comment for the snapshot (e.g. username).

        Returns updated data or None if page not found.
        """

        # ===== 0. Smart media extraction =====
        # The caller (word/route.py) already resolved nav_id for the
        # current user. It is the SAME nav_id that owns the page and
        # the media folder.
        if content:
            content, _map_html = extract_from_html(content, nav_id, force=False)
        if content_json:
            content_json, _map_json = extract_from_json(content_json, nav_id, force=False)

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

            # ===== Snapshot BEFORE update =====
            old_html = page.content or ""
            old_json = page.content_json
            old_css = page.css or ""

            # Determine new values (fallback to old if None)
            new_html = content if content is not None else old_html
            new_json = content_json if content_json is not None else old_json

            # Custom CSS from the editor (Style Manager). May be None
            # for callers that only save HTML.
            custom_css = css if css is not None else ""

            # Rebuild the full page CSS from scratch on EVERY save.
            # content.css + used blocks/*.css + used fx/*.css + custom.
            # This freezes the CSS at save time: the result is written
            # to page.css and no longer depends on the editor runtime.
            new_css = build_full_page_css(new_html, custom_css)

            # Only snapshot if something actually changed
            changed = (
                new_html != old_html
                or new_json != old_json
                or new_css != old_css
            )

            if changed and (old_html or old_css):
                # Check for duplicates — skip if last snapshot is identical
                is_dup = await _is_duplicate_snapshot(
                    session, page_id, old_html, old_json, old_css
                )
                if not is_dup:
                    snapshot = PageHist(
                        page_id=page_id,
                        html=old_html,
                        content_json=old_json,
                        css=old_css,
                        action="user_edit",
                        note=user_note,
                    )
                    session.add(snapshot)

            # ===== Update Page =====
            if content is not None:
                page.content = content
            if content_json is not None:
                page.content_json = content_json

            # Always write the rebuilt CSS — even when custom_css is
            # empty, content.css + blocks + effects still need to be
            # frozen into page.css.
            page.css = new_css

            page.updated_at = datetime.now()
            await session.commit()
            await session.refresh(page)

            # ===== Write static CSS file for the public page =====
            # Non-fatal: if the write fails, the DB save is still valid.
            _write_page_css_file(page.id, page.css)

            return {
                "id": page.id,
                "title": page.title,
                "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            }

        return None

    # ========================================
    # HISTORY — LIST
    # ========================================

    @staticmethod
    async def list_history(
        page_id: int,
        nav_id: int,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        List all snapshots for a page, newest first.

        Does NOT return html / content_json / css (heavy) — only metadata.
        For full snapshot — use get_history_item().

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

    # ========================================
    # HISTORY — ONE ITEM
    # ========================================

    @staticmethod
    async def get_history_item(
        hist_id: int,
        page_id: int,
        nav_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one full snapshot (html + content_json + css).

        Returns None if the snapshot does not exist or the page
        does not belong to this nav.
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

            return {
                "id": s.id,
                "page_id": s.page_id,
                "html": s.html,
                "content_json": s.content_json,
                "css": s.css,
                "action": s.action,
                "note": s.note,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }

        return None

    # ========================================
    # HISTORY — ROLLBACK
    # ========================================

    @staticmethod
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
                is_dup = await _is_duplicate_snapshot(
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
            _write_page_css_file(page.id, page.css)

            return {
                "id": page.id,
                "title": page.title,
                "content": page.content,
                "content_json": page.content_json,
                "css": page.css,
                "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            }

        return None

    # ========================================
    # HISTORY — DELETE ONE SNAPSHOT
    # ========================================

    @staticmethod
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

    # ========================================
    # HISTORY — CLEAR ALL SNAPSHOTS
    # ========================================

    @staticmethod
    async def clear_history(
        page_id: int,
        nav_id: int,
    ) -> bool:
        """
        Delete ALL snapshots of a page.

        The page itself is NOT touched — only the PageHist rows
        that reference it.

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

    # ========================================
    # LIST ASSETS — media/<nav_id>/
    # ========================================

    @staticmethod
    async def list_assets(nav_id: int) -> List[Dict[str, str]]:
        """
        Get list of all images from media/<nav_id>/.

        Each nav instance owns its own media folder — assets are
        isolated per nav, not per module. This matches the data
        model: a nav is the object that owns pages, and media
        belongs to the object too.

        Returns list of dicts: { src, name, type }.
        """
        media_dir = Path("media") / str(nav_id)
        media_dir.mkdir(parents=True, exist_ok=True)

        assets: List[Dict[str, str]] = []

        for filepath in sorted(media_dir.rglob('*')):
            if not filepath.is_file():
                continue

            ext = filepath.suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']:
                continue

            rel = filepath.relative_to(media_dir).as_posix()

            assets.append({
                "src": f"{MEDIA_URL}/{nav_id}/{rel}",
                "name": filepath.name,
                "type": "image",
            })

        return assets

    # ========================================
    # UPLOAD ASSETS — media/<nav_id>/
    # ========================================

    @staticmethod
    async def upload_assets(
        files: List[UploadFile],
        nav_id: int,
    ) -> List[str]:
        """
        Save uploaded files to media/<nav_id>/.

        Each nav instance owns its own media folder — assets are
        isolated per nav, not per module.

        Special names (favicon.ico, robots.txt, sitemap.xml) — kept as-is.
        Other files — get a random 8-hex suffix.

        Returns list of URLs of uploaded files.
        """
        media_dir = Path("media") / str(nav_id)
        media_dir.mkdir(parents=True, exist_ok=True)

        uploaded_urls: List[str] = []

        for uploaded_file in files:
            original_name = uploaded_file.filename or "file"
            clean_name = re.sub(r'[^a-zA-Z0-9_.\-]', '_', original_name)

            if clean_name in SPECIAL_NAMES:
                final_name = clean_name
            else:
                name, ext = os.path.splitext(clean_name)
                suffix = uuid.uuid4().hex[:8]
                final_name = f"{name}_{suffix}{ext}"

            save_path = media_dir / final_name

            with open(save_path, "wb") as buffer:
                while True:
                    chunk = await uploaded_file.read(1024 * 64)
                    if not chunk:
                        break
                    buffer.write(chunk)

            await uploaded_file.close()

            uploaded_urls.append(f"{MEDIA_URL}/{nav_id}/{final_name}")

        return uploaded_urls


# ============================================
# HELPERS
# ============================================

def _write_page_css_file(page_id: int, css: Optional[str]) -> None:
    """
    Write the page's CSS to a static file under PAGES_CSS_DIR and
    return the URL — but we do not return it here; the public page
    builds the URL itself (see word/view.js → buildArticle).

    Non-fatal: if the write fails (permissions, disk full), the DB
    save is still valid — the public page will just miss the CSS
    until the next save.

    Empty CSS → no file written. Existing file is left on disk; it
    will simply not be requested by the public page (view.js falls
    back to the embedded <style> path).
    """
    if not css or not css.strip():
        return
    try:
        url = ensure_css_file(
            page_id=page_id,
            css=css,
            directory=PAGES_CSS_DIR,
            url_prefix=PAGES_CSS_URL,
        )
        if url:
            print(f"[Word] page CSS file written: {url}", flush=True)
    except Exception as e:
        print(f"[Word] failed to write page CSS file for page {page_id}: {e}", flush=True)


def _page_to_dict(page) -> Dict[str, Any]:
    """Serialize Page model to dict."""
    return {
        "id": page.id,
        "nav_id": page.nav_id,
        "datetime": page.datetime.isoformat() if page.datetime else None,
        "title": page.title,
        "description": page.description,
        "logo": page.logo,
        "content": page.content,
        "content_json": page.content_json,
        "css": page.css,
        "is_active": page.is_active,
        "is_delete": page.is_delete,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "rss_yandex_id": page.rss_yandex_id,
        "is_template": int(page.is_template) if page.is_template is not None else 0,
        "template_id": page.template_id,
    }


async def _is_duplicate_snapshot(
    session,
    page_id: int,
    html: str,
    content_json: Optional[str],
    css: Optional[str],
) -> bool:
    """
    Return True if the LAST snapshot for this page has identical
    html AND content_json AND css — to skip writing duplicates.
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