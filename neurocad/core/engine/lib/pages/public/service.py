# neurocad/core/engine/lib/pages/public/service.py

"""
Public pages service.

Read-only access to Page records for public HTML rendering.
No admin fields (content_json, etc.).

Scoping:
  Pages are scoped to a nav instance (Page.nav_id) — but nav_id is
  an INTERNAL concept and never appears in a public URL. Public
  routes resolve the user from the request Host and look up the
  page within that user's navs:

    get_by_datetime_for_user(date, time, user_id)  — regular hosts
    get_by_datetime_any_nav(date, time)            — dev hosts

  Both return the same CoreEngineLibPagesPublicItem shape, so the
  render path stays single.

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

Catalog:
  get_list() returns the active, non-deleted pages of a nav, sorted
  by datetime DESC. Used by the public /pages route to render a
  full catalog page without the admin UI. Each item carries a
  ready-to-use `url` (/page/<YYYYMMDD>/<HHMMSS>) so the template
  does not have to assemble it.

Namespace: CoreEngineLibPagesPublicService
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from sqlalchemy import select

from .....models.base import Page
from .....models.nav import Nav
from ......utils.sqlite import get_db_sqlite
from ......utils.css import split_style_from_html
from .schema import (
    CoreEngineLibPagesPublicItem,
    CoreEngineLibPagesPublicItemListItem,
)


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


# ============================================
# URL HELPERS (module-level)
# ============================================

def _public_url(page_dt: Optional[datetime]) -> str:
    """
    Build the public URL of a page:

        /page/<YYYYMMDD>/<HHMMSS>

    NO nav_id — the public URL is host-based: the request Host
    resolves to a user, and the page is looked up within that
    user's navs. See public/route.py.

    Used by the catalog list items so the template does not have
    to assemble the URL itself. Changing the format is a one-line
    change here and in the route.

    If `page_dt` is missing (should not happen: page.datetime is
    NOT NULL in the DB), falls back to /pages instead of 500.
    """
    if page_dt is None:
        return "/pages"
    return (
        f"/page/"
        f"{page_dt.strftime('%Y%m%d')}/"
        f"{page_dt.strftime('%H%M%S')}"
    )


class CoreEngineLibPagesPublicService:
    """Read-only service for public page rendering."""

    # ========================================
    # LIST (for the /pages catalog)
    # ========================================

    @staticmethod
    async def get_list(
        nav_id: int,
        limit: int = 100,
    ) -> List[CoreEngineLibPagesPublicItemListItem]:
        """
        List active, non-deleted pages of a nav — for the public
        /pages catalog.

        Order: datetime DESC, id DESC (newest first; id DESC breaks
        ties when two pages share the same datetime second — which
        can happen, since the editor lets the user pick the time).

        No pagination yet: up to `limit` items in one response.
        Default 100 is generous enough for a personal catalog;
        swap to a paginated query if this ever becomes a hot path.

        Only active, non-deleted pages are returned — same filter
        as get_by_datetime / get_by_id. That keeps the catalog
        consistent with what a visitor can actually open.
        """
        items: List[CoreEngineLibPagesPublicItemListItem] = []

        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .where(
                    Page.nav_id == nav_id,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                .order_by(Page.datetime.desc(), Page.id.desc())
                .limit(limit)
            )
            rows = (await session.execute(stmt)).scalars().all()

            for page in rows:
                items.append(
                    CoreEngineLibPagesPublicService._page_to_list_item(page)
                )

            break

        return items

    # ========================================
    # MAIN PAGE
    # ========================================

    @staticmethod
    async def get_main_page(
        nav_id: int,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Get the main page of a nav instance.

        Currently: the first active page (ORDER BY id ASC).
        Later: configurable via is_main flag.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .where(
                    Page.nav_id == nav_id,
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
    # PAGE BY DATETIME — nav-scoped (internal)
    # ========================================

    @staticmethod
    async def get_by_datetime(
        date: str,
        time: str,
        nav_id: int,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find page by date/time within a SPECIFIC nav.

        Kept for internal callers that already know the nav_id
        (e.g. the home-page selector, template resolution). The
        PUBLIC route does not use this — public lookups go through
        get_by_datetime_for_user / get_by_datetime_any_nav below,
        which never expose nav_id.

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
            stmt = select(Page).where(
                Page.nav_id == nav_id,
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
    # PAGE BY DATETIME — user-scoped (public route)
    # ========================================

    @staticmethod
    async def get_by_datetime_for_user(
        date: str,
        time: str,
        user_id: int,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find a page by date/time among ALL navs of the given user.

        This is the lookup used by the public /page/<date>/<time>
        route: the request Host resolves to a user_id, and the page
        is searched across every nav that user owns. There is no
        nav_id in the URL.

        Only active, non-deleted pages are returned.

        If two navs of the same user contain a page with the same
        <date>/<time> (rare but possible — datetime is user-picked),
        the one with the lowest nav_id wins. This is a deterministic
        tie-breaker, and in practice it never happens within a
        single user's content.
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError:
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .join(Nav, Nav.id == Page.nav_id)
                .where(
                    Nav.user_id == user_id,
                    Nav.is_delete.is_(False),
                    Page.datetime >= dt_start,
                    Page.datetime < dt_end,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                .order_by(Nav.id.asc(), Page.id.asc())
                .limit(1)
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # PAGE BY DATETIME — any nav (dev only)
    # ========================================

    @staticmethod
    async def get_by_datetime_any_nav(
        date: str,
        time: str,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find a page by date/time across ALL navs in the DB.

        DEV ONLY. Used by the public route when the request comes
        from a dev host (localhost, 127.0.0.1, [::1]) — during
        local development there is no APP_DOMAIN and no per-user
        host resolution, so the page is looked up globally.

        On prod this method is never reached: every real request
        has a Host that either resolves to a user (then
        get_by_datetime_for_user is used) or does not (then the
        route returns 404 without a DB call).

        Only active, non-deleted pages are returned.

        If two pages in different navs share the same <date>/<time>,
        the one with the lowest nav_id wins — deterministic.
        """
        try:
            dt_start = datetime.strptime(f"{date}{time}", "%Y%m%d%H%M%S")
        except ValueError:
            return None

        dt_end = dt_start + timedelta(seconds=1)

        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .join(Nav, Nav.id == Page.nav_id)
                .where(
                    Nav.is_delete.is_(False),
                    Page.datetime >= dt_start,
                    Page.datetime < dt_end,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                )
                .order_by(Nav.id.asc(), Page.id.asc())
                .limit(1)
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
        nav_id: int,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Find page by ID within a nav instance.

        Used to load the base template page when rendering a child page.
        Only returns active, non-deleted pages.
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.nav_id == nav_id,
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
            nav_id=page.nav_id,
            datetime=page.datetime,
            title=page.title,
            description=page.description,
            logo=page.logo,
            content=content,
            css=css,
            template_id=page.template_id,
        )

    @staticmethod
    def _page_to_list_item(
        page: Page,
    ) -> CoreEngineLibPagesPublicItemListItem:
        """
        Convert Page ORM object to the list-item schema used by the
        /pages catalog.

        Unlike _page_to_public, this does NOT touch content or css —
        the catalog only needs the card fields (title, description,
        logo, datetime) plus a ready URL. Keeping the two converters
        separate makes it obvious at a glance which fields each
        consumer depends on.
        """
        return CoreEngineLibPagesPublicItemListItem(
            id=page.id,
            nav_id=page.nav_id,
            datetime=page.datetime,
            title=page.title or "",
            description=page.description,
            logo=page.logo,
            url=_public_url(page.datetime),
        )