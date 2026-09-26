# neurocad/core/engine/lib/pages/public/service.py

"""
Public pages service.

Read-only access to Page records for public HTML rendering.
No admin fields (content_json, is_active, is_delete, etc.).

CSS handling:
  - Page.css is the source of truth for the page's content CSS.
    It is assembled at save time by word/css_builder.py:
        content.css + used blocks/*.css + used fx/*.css + custom CSS
    and frozen into Page.css. The public page loads ONLY this file
    (plus the wrapper public.css) — it does not scan the editor
    directory for CSS anymore.
  - For legacy pages (css is NULL, CSS embedded in content as <style>)
    the CSS is extracted on the fly via split_style_from_html.
    This is read-only — nothing is written back to the DB here.
  - Derivative CSS files of pages are written under this module's
    namespace (PAGES_CSS_DIR / PAGES_CSS_URL) — see the constants
    below. The utility ensure_css_file() takes both as parameters
    and stays module-agnostic.

Namespace: CoreEngineLibPagesPublicService
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy import select

from .....models.base import Page
from .....models.module import Module
from ......utils.sqlite import get_db_sqlite
from ......utils.css import split_style_from_html
from .schema import CoreEngineLibPagesPublicItem


# Default module name for public pages
DEFAULT_MODULE = "default"


# ============================================
# PATHS — this module's static namespace
# ============================================

# Module static root — on disk and in URL. Default Nginx maps
# URL → filesystem 1:1, so no rewrites are needed.
#
#   disk: static/core/engine/lib/pages/public/...
#   URL:  /static/core/engine/lib/pages/public/...
#
_MODULE_STATIC_DIR = (
    Path("static") / "core" / "engine" / "lib" / "pages" / "public"
)
_MODULE_STATIC_URL = "/static/core/engine/lib/pages/public"

# Derivative CSS files of pages (one per page, <page_id>.css).
# Written on demand by ensure_css_file(), served by Nginx directly.
PAGES_CSS_DIR = _MODULE_STATIC_DIR / "pages"
PAGES_CSS_URL = _MODULE_STATIC_URL + "/pages"


class CoreEngineLibPagesPublicService:
    """Read-only service for public page rendering."""

    # ========================================
    # MAIN PAGE
    # ========================================

    @staticmethod
    async def get_main_page(
        module_name: str = DEFAULT_MODULE,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Get the main page of a module.

        Currently: the first active page (ORDER BY id ASC).
        Later: configurable via is_main flag or module.json.
        """
        async for session in get_db_sqlite():
            # Resolve module
            module = await CoreEngineLibPagesPublicService._resolve_module(
                session, module_name
            )
            if not module:
                return None

            # Find first active page
            stmt = (
                select(Page)
                .where(
                    Page.mod_id == module.id,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                .order_by(Page.id.asc())
                .limit(1)
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # PAGE BY DATETIME
    # ========================================

    @staticmethod
    async def get_by_datetime(
        date: str,
        time: str,
        module_name: str = DEFAULT_MODULE,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find page by date/time within a module.

        date = "20260914" (YYYYMMDD)
        time = "153910"   (HHMMSS)

        datetime in DB has microseconds (15:39:10.666406),
        so we search in range [dt_start, dt_start + 1 sec).

        Only returns active, non-deleted pages.
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError:
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            # Resolve module
            module = await CoreEngineLibPagesPublicService._resolve_module(
                session, module_name
            )
            if not module:
                return None

            # Find page
            stmt = select(Page).where(
                Page.mod_id == module.id,
                Page.datetime >= dt_start,
                Page.datetime < dt_end,
                Page.is_delete == 0,
                Page.is_active == 1,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # PAGE BY ID
    # ========================================

    @staticmethod
    async def get_by_id(
        page_id: int,
        module_name: str = DEFAULT_MODULE,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find page by ID within a module.

        Used to load the base template page when rendering a child page.
        Only returns active, non-deleted pages.
        """
        async for session in get_db_sqlite():
            # Resolve module
            module = await CoreEngineLibPagesPublicService._resolve_module(
                session, module_name
            )
            if not module:
                return None

            # Find page
            stmt = select(Page).where(
                Page.id == page_id,
                Page.mod_id == module.id,
                Page.is_delete == 0,
                Page.is_active == 1,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # HELPERS
    # ========================================

    @staticmethod
    async def _resolve_module(session, module_name: str) -> Optional[Module]:
        """Resolve Module by name (active, non-deleted)."""
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    def _page_to_public(page: Page) -> CoreEngineLibPagesPublicItem:
        """
        Convert Page ORM object to public schema.

        CSS resolution:
          - New pages: page.css is set → use it as-is.
          - Legacy pages: page.css is NULL, but content may contain
            embedded <style> blocks. Extract them on the fly so the
            public page gets CSS through the same path (css field +
            <link>) as new pages.

        NOTE: extraction is read-only — nothing is written back to
        the DB here. The page.css field is only persisted when the
        page is saved from the editor.
        """
        content = page.content
        css = page.css

        if not css and content and "<style" in content.lower():
            css, content = split_style_from_html(content)

        return CoreEngineLibPagesPublicItem(
            id=page.id,
            mod_id=page.mod_id,
            datetime=page.datetime,
            title=page.title,
            description=page.description,
            logo=page.logo,
            content=content,
            css=css,
            template_id=page.template_id,
        )