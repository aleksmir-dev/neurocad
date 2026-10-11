# neurocad/core/engine/lib/word/service.py

"""
Word service — page content, history, and media.

Thin facade over the word/ modules. The actual logic lives in:

    - word/page.py       — read pages (get_by_datetime, get_by_id,
                           page_to_dict)
    - word/history.py    — snapshots (list, get, rollback, delete,
                           clear) + is_duplicate_snapshot
    - word/media.py      — media assets (list_assets, upload_assets)
    - word/creative.py   — data-creative-id patching
    - word/url.py        — public URL resolution
    - word/css.py        — page-CSS-file writer
    - word/css_builder.py — full-CSS builder

This module keeps:

    - save_content() — the write path. Entangled enough (media
      extraction, creative patching, CSS rebuild, snapshot,
      commit, CSS file write) that splitting it further would
      only hurt readability.
    - CoreEngineLibWordService — the class other modules import.
      Its static methods delegate to the modules above, so existing
      callers (`CoreEngineLibWordService.save_content(...)` etc.)
      keep working unchanged.
    - Re-exports of MEDIA_URL and SPECIAL_NAMES, so any old caller
      that did `from ..service import MEDIA_URL` still works.

CSS handling:
    The full page CSS is rebuilt from scratch on every save
    (content.css + used blocks/*.css + used fx/*.css + custom CSS)
    and frozen into Page.css. The public page loads only that file
    (plus the wrapper public.css) — it never scans the editor
    directory at runtime. Write side: word/css.py. Builder:
    word/css_builder.py.

Media handling (smart data-URI extraction):
    On save, `content` and `content_json` are passed through
    `editor.io.media.extract_from_html` / `extract_from_json`.
    Data-URIs larger than the per-URI threshold (50 KB) — or any
    URIs at all, if the page-wide sum exceeds 1 MB — are written
    to `media/<nav_id>/<uuid>.<ext>` and replaced with public URLs.
    Small icons (< 50 KB) stay inline, so pasting a tiny image via
    the editor is still possible.

Creative block patching:
    All logic lives in word/creative.py. This module just calls
    into it from save_content. Read-time patching happens inside
    word/page.py → page_to_dict and word/history.py →
    get_history_item. See creative.py for the full rationale.

Constants:
    `MEDIA_URL` and `SPECIAL_NAMES` live in word/constants.py.
    They are imported here — and re-exported — for backward
    compatibility.

Namespace: CoreEngineLibWord*
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import UploadFile

from sqlalchemy import select

from ....models.base import Page
from .....utils.sqlite import get_db_sqlite

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

# Creative-block patching — used by save_content (write path).
# Read-time patching lives in page.py / history.py.
from .creative import patch_creative_blocks

# Page-CSS-file writer — pure filesystem helper, no DB.
from .css import write_page_css_file

# Snapshot dedup check — used by save_content before adding a
# new PageHist row.
from .history import is_duplicate_snapshot

# Read-side and history-side live in their own modules. Imported
# here so that CoreEngineLibWordService can delegate to them
# without callers having to change their import paths.
from . import page as _page
from . import history as _history
from . import media as _media


# ============================================
# RE-EXPORT
# ============================================
# MEDIA_URL and SPECIAL_NAMES are imported from `.constants`
# above. They stay available as `service.MEDIA_URL` and
# `service.SPECIAL_NAMES`. Any module that previously imported
# them from `word.service` keeps working.


class CoreEngineLibWordService:
    """
    Service for page content and assets.

    Thin facade — the logic lives in word/page.py,
    word/history.py, and word/media.py. Static methods here
    delegate to those modules so callers don't need to change.
    """

    # ========================================
    # PAGE — READ
    # ========================================

    get_by_datetime = staticmethod(_page.get_by_datetime)
    get_by_id = staticmethod(_page.get_by_id)

    # ========================================
    # PAGE — SAVE
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
          1.5. Patch creative blocks — rewrite data-creative-id on
             every <section data-block="core-creative"> to the
             page's current active placement id. (see
             creative.patch_creative_blocks)
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

            # ===== 1.5. Patch creative blocks =====
            # Rewrite data-creative-id on every core-creative
            # section to the page's current active placement id.
            # See creative.py for the full rationale.
            if content:
                content = await patch_creative_blocks(
                    content, page.id, session
                )

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
                is_dup = await is_duplicate_snapshot(
                    session, page_id, old_html, old_json, old_css
                )
                if not is_dup:
                    from ....models.page_hist import PageHist  # local import
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
            write_page_css_file(page.id, page.css)

            return {
                "id": page.id,
                "title": page.title,
                "updated_at": page.updated_at.isoformat() if page.updated_at else None,
            }

        return None

    # ========================================
    # HISTORY
    # ========================================

    list_history = staticmethod(_history.list_history)
    get_history_item = staticmethod(_history.get_history_item)
    rollback = staticmethod(_history.rollback)
    delete_history_item = staticmethod(_history.delete_history_item)
    clear_history = staticmethod(_history.clear_history)

    # ========================================
    # MEDIA
    # ========================================

    list_assets = staticmethod(_media.list_assets)
    upload_assets = staticmethod(_media.upload_assets)