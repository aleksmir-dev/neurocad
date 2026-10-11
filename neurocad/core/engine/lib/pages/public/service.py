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

Folder mode
-----------
The public catalog (/pages) is hierarchical, just like the admin
one. Two new concepts:

  - `get_list(nav_id, parent_id)` — items that live in one folder
    (folders + pages), with `children_count` filled for folders.
  - `get_folder_chain(nav_id, path_ids)` — a validated path from
    the root to the current folder, used to render breadcrumbs.

A cookie `nc_folder_path` (set by the route) carries the path as
a dot-separated string of folder ids, e.g. "12.45". The route
parses it, validates it via `resolve_folder_path`, and falls back
to the root if anything is off (invalid id, deleted folder,
folder from another nav, broken nesting).

The root breadcrumb carries `/pages?root=1` — not the bare
`/pages`. The bare `/pages` is ambiguous: it means "the folder I
was last in" (per the cookie), so a visitor deep in the tree has
no reliable way to reach the actual root. `?root=1` is an
explicit "show the root and forget the cookie" flag, handled in
route.py.

Templates
---------
A template (is_template=1) is a service page — a layout shell for
other pages, not a catalog entry. It is deliberately HIDDEN from
the public catalog (`get_list` filters is_template == 0). It is
NOT hidden from its own public URL: `/page/<date>/<time>` on the
template still works, so the owner can preview the shell in
isolation. Child pages that inherit from the template keep
working the same way as before — see get_by_id / get_template_css,
which are filtered by is_active (a template with is_active=0
renders children without it — this is a deliberate feature).

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
  - Template CSS: if a page inherits from a base template
    (page.template_id is set), the template's CSS is ALSO loaded
    and served as its own static file (<template_id>.css). The
    public route injects it BEFORE the page's own CSS, so page
    styles can override the shared layout. See get_template_css().

Namespace: CoreEngineLibPagesPublicService
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from sqlalchemy import func, select

from .....models.base import Page
from .....models.nav import Nav
from ......utils.sqlite import get_db_sqlite
from ......utils.css import split_style_from_html
from .schema import (
    CoreEngineLibPagesPublicItem,
    CoreEngineLibPagesPublicItemListItem,
    CoreEngineLibPagesPublicCrumb,
    CARD_TYPE_PAGE,
    CARD_TYPE_FOLDER,
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

def _page_url(page_dt: Optional[datetime]) -> str:
    """
    Public URL of a single page:

        /page/<YYYYMMDD>/<HHMMSS>

    NO nav_id — the public URL is host-based: the request Host
    resolves to a user, and the page is looked up within that
    user's navs. See route.py.

    If `page_dt` is missing (should not happen for pages: it is
    always set), falls back to /pages instead of 500.
    """
    if page_dt is None:
        return "/pages"
    return (
        f"/page/"
        f"{page_dt.strftime('%Y%m%d')}/"
        f"{page_dt.strftime('%H%M%S')}"
    )


def _folder_url(folder_id: int) -> str:
    """
    Public URL of a folder inside the catalog:

        /pages/<id>

    See route.py — the /pages route accepts an optional numeric
    segment after the prefix. Trailing slash is normalized to
    the no-slash form by a 301 redirect on the route side.
    """
    return f"/pages/{folder_id}"


def _root_url() -> str:
    """
    Public URL of the catalog ROOT.

    Not the bare `/pages`: that URL is ambiguous — its meaning
    depends on the `nc_folder_path` cookie ("the folder I was
    last in"). A visitor deep in the tree cannot ask for the root
    by clicking a link to `/pages`, because the cookie would pull
    them right back into the same folder.

    `?root=1` is an explicit "show the root" flag. The route
    handles it before consulting the cookie, and clears the
    cookie on the way out — so the next bare `/pages` visit
    also opens the root, as the visitor now expects.
    """
    return "/pages?root=1"


def _resolve_card_url(page: Page) -> str:
    """
    URL a catalog card should point at.

    Priority:
      1. For a folder — always /pages/<id>. The external `url`
         field is ignored (folders cannot be link cards).
      2. For a page — page.url, if set and not blank. The page is
         a link card pointing at an external site. Returned as-is.
      3. Otherwise — /page/<YYYYMMDD>/<HHMMSS>.

    Whitespace-only values are ignored so a cleared url field
    behaves exactly like NULL.
    """
    if page.card_type == CARD_TYPE_FOLDER:
        return _folder_url(page.id)
    if isinstance(page.url, str) and page.url.strip():
        return page.url.strip()
    return _page_url(page.datetime)


class CoreEngineLibPagesPublicService:
    """Read-only service for public page rendering."""

    # ========================================
    # LIST (for the /pages catalog)
    # ========================================

    @staticmethod
    async def get_list(
        nav_id: int,
        parent_id: Optional[int] = None,
        limit: int = 100,
    ) -> List[CoreEngineLibPagesPublicItemListItem]:
        """
        List active, non-deleted items of a nav that live in
        `parent_id` — for the public /pages catalog.

        `parent_id` semantics:
          - None → the root level (parent_id IS NULL);
          - <id> → the children of that folder.

        Templates (is_template=1) are EXCLUDED from the catalog.
        A template is a layout shell for other pages, not a
        catalog entry — the owner previews it via its own
        /page/<date>/<time> URL, but a visitor browsing /pages
        should never see it. If templates were listed, a folder
        could also show a stale children_count (the counter is
        computed with the same filter — see below).

        Order: folders first, then pages. Inside each group:
          - folders: sort_order ASC, then title ASC;
          - pages:   sort_order ASC, then datetime DESC, id DESC.
        (Same ordering as the admin catalog — one consistent
        visual language between the admin and the public site.)

        `children_count` is filled for folders — one extra
        grouped query for all folders on the page.

        Each item's `url` is resolved via _resolve_card_url:
          - folder → /pages/<id>;
          - page with external `url` → that URL;
          - page without → /page/<date>/<time>.

        No pagination yet: up to `limit` items in one response.
        Default 100 is generous enough for a personal catalog.
        """
        items: List[CoreEngineLibPagesPublicItemListItem] = []

        async for session in get_db_sqlite():
            base_stmt = select(Page).where(
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.is_active == 1,
                # Templates are service pages — never listed.
                Page.is_template == 0,
            )

            if parent_id is None:
                base_stmt = base_stmt.where(Page.parent_id.is_(None))
            else:
                base_stmt = base_stmt.where(Page.parent_id == parent_id)

            stmt = (
                base_stmt
                .order_by(
                    # Folders first (True sorts after False → DESC)
                    (Page.card_type == CARD_TYPE_FOLDER).desc(),
                    Page.sort_order.asc(),
                    Page.datetime.desc(),
                    Page.id.desc(),
                )
                .limit(limit)
            )
            rows = (await session.execute(stmt)).scalars().all()

            # children_count for folders on this page — one query.
            # The same is_template filter is applied so the counter
            # matches what the visitor actually sees in the folder
            # (a hidden template must not inflate the number).
            folder_ids = [
                p.id for p in rows if p.card_type == CARD_TYPE_FOLDER
            ]
            children_map: Dict[int, int] = {}
            if folder_ids:
                cnt_stmt = (
                    select(Page.parent_id, func.count(Page.id))
                    .where(
                        Page.parent_id.in_(folder_ids),
                        Page.is_delete == 0,
                        Page.is_active == 1,
                        Page.is_template == 0,
                    )
                    .group_by(Page.parent_id)
                )
                cnt_rows = (await session.execute(cnt_stmt)).all()
                children_map = {
                    pid: cnt for pid, cnt in cnt_rows if pid is not None
                }

            for page in rows:
                items.append(
                    CoreEngineLibPagesPublicService._page_to_list_item(
                        page,
                        children_count=(
                            children_map.get(page.id, 0)
                            if page.card_type == CARD_TYPE_FOLDER
                            else None
                        ),
                    )
                )

            break

        return items

    # ========================================
    # FOLDER PATH — VALIDATION
    # ========================================

    @staticmethod
    async def resolve_folder_path(
        nav_id: int,
        path_ids: Sequence[int],
    ) -> List[int]:
        """
        Validate a candidate folder path against the DB.

        `path_ids` — a list of folder ids, from the root to the
        current folder (as parsed from the cookie or from a URL
        segment). The list may be empty (root) or contain ids that
        are stale / from another nav / not actually a folder /
        not nested correctly.

        Validation rules — each id must:

          1. exist as a Page with is_delete == 0;
          2. be a folder (card_type == "folder");
          3. belong to the given nav_id;
          4. be a descendant of the previous id in the list
             (parent_id == previous id), with the first id
             having parent_id IS NULL.

        Returns the longest VALID prefix of `path_ids`:
          - if all ids are valid → the whole list;
          - if id[0] is bad → an empty list (root);
          - if id[0..k] are valid and id[k+1] is bad → the first
            k+1 ids.

        Never raises. A broken cookie (or a hostile client) simply
        falls back to the root — the visitor sees the top of the
        catalog, not an error page.
        """
        if not path_ids:
            return []

        valid: List[int] = []
        expected_parent: Optional[int] = None

        async for session in get_db_sqlite():
            for candidate in path_ids:
                stmt = select(Page).where(
                    Page.id == candidate,
                    Page.nav_id == nav_id,
                    Page.is_delete == 0,
                    Page.card_type == CARD_TYPE_FOLDER,
                )
                page = (await session.execute(stmt)).scalar_one_or_none()
                if page is None:
                    break

                # Root check for the first element; parent check for
                # the rest. Both compare against the previous step.
                actual_parent = page.parent_id
                if actual_parent != expected_parent:
                    break

                valid.append(candidate)
                expected_parent = candidate

            break

        return valid

    # ========================================
    # FOLDER PATH — BREADCRUMBS
    # ========================================

    @staticmethod
    async def get_folder_chain(
        nav_id: int,
        path_ids: Sequence[int],
    ) -> List[CoreEngineLibPagesPublicCrumb]:
        """
        Build breadcrumbs for a (already validated) folder path.

        `path_ids` — a list of folder ids from the root to the
        current folder. Must be the result of resolve_folder_path
        (already checked against the DB). This method does NOT
        re-validate — it just loads the titles and builds crumbs.

        Returns a list of crumbs, ALWAYS starting with the root:

            [ {id: None, title: "Все", url: "/pages?root=1"},
              {id: 12,  title: "Оборудование", url: "/pages/12"},
              {id: 45,  title: "Ноутбуки",     url: "/pages/45"} ]

        The root crumb's URL is `/pages?root=1`, not the bare
        `/pages`. See _root_url() for the rationale — the bare
        URL is ambiguous when the cookie names a folder.

        The caller (route) may render the last crumb as plain text
        instead of a link — it is the current folder.

        If `path_ids` is empty, returns a single-crumb list with
        only the root — so the template can render
        "Все" unconditionally when breadcrumbs are used.

        If a folder id from `path_ids` is missing in the DB (raced
        with a delete, for example), it is silently skipped. The
        caller already validated the path — this is defense
        against a very unlikely race, not the primary guard.
        """
        crumbs: List[CoreEngineLibPagesPublicCrumb] = [
            CoreEngineLibPagesPublicCrumb(
                id=None,
                title="Все",
                url=_root_url(),
            )
        ]

        if not path_ids:
            return crumbs

        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id.in_(list(path_ids)),
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.card_type == CARD_TYPE_FOLDER,
            )
            rows = (await session.execute(stmt)).scalars().all()
            by_id = {p.id: p for p in rows}

            for fid in path_ids:
                folder = by_id.get(fid)
                if folder is None:
                    continue
                crumbs.append(
                    CoreEngineLibPagesPublicCrumb(
                        id=folder.id,
                        title=folder.title or f"Папка {folder.id}",
                        url=_folder_url(folder.id),
                    )
                )

            break

        return crumbs

    # ========================================
    # FOLDER — LOAD ONE
    # ========================================

    @staticmethod
    async def get_folder_by_id(
        folder_id: int,
        nav_id: int,
    ) -> Optional[Page]:
        """
        Load a single folder by id.

        Used by the route to check that a URL segment like
        /pages/<id> really points at a folder of the current nav,
        before deciding what to render.

        Returns the ORM object (Page) or None. The route uses
        `folder.id` / `folder.title` only — this is not a public
        payload; it does not go through the schema.
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == folder_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.is_active == 1,
                Page.card_type == CARD_TYPE_FOLDER,
            )
            page = (await session.execute(stmt)).scalar_one_or_none()
            return page

        return None

    # ========================================
    # MAIN PAGE
    # ========================================

    @staticmethod
    async def get_main_page(
        nav_id: int,
    ) -> Optional[CoreEngineLibPagesPublicItem]:
        """
        Get the main page of a nav instance.

        Only card_type='page' is eligible — folders are never the
        "main page" of a site. Currently: the first active page
        (ORDER BY id ASC). Later: configurable via is_main flag.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(Page)
                .where(
                    Page.nav_id == nav_id,
                    Page.is_delete == 0,
                    Page.is_active == 1,
                    Page.card_type == CARD_TYPE_PAGE,
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

        Only returns active, non-deleted pages (card_type='page').
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
                Page.card_type == CARD_TYPE_PAGE,
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

        Only active, non-deleted pages (card_type='page') are
        returned.

        If two navs of the same user contain a page with the same
        <date>/<time> (rare but possible — datetime is user-picked),
        the one with the lowest nav_id wins. Deterministic.
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
                    Page.card_type == CARD_TYPE_PAGE,
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
        from a dev host (localhost, 127.0.0.1, [::1]).

        Only active, non-deleted pages (card_type='page') are
        returned.
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
                    Page.card_type == CARD_TYPE_PAGE,
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

        Used to load the base template page when rendering a child
        page. Only returns active, non-deleted pages
        (card_type='page').

        The is_active filter here is INTENTIONAL and unchanged:
        if the owner has unpublished the template (is_active=0),
        child pages render WITHOUT it. This is a deliberate
        feature — "turn the shell off, children fall back to
        plain content".
        """
        async for session in get_db_sqlite():
            stmt = select(Page).where(
                Page.id == page_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.is_active == 1,
                Page.card_type == CARD_TYPE_PAGE,
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if not page:
                return None

            return CoreEngineLibPagesPublicService._page_to_public(page)

        return None

    # ========================================
    # TEMPLATE CSS
    # ========================================

    @staticmethod
    async def get_template_css(
        template_id: int,
        nav_id: int,
    ) -> Optional[str]:
        """
        Load the CSS of a base template page.

        Returns the template's `css` field, or None if:
          - the template does not exist;
          - it belongs to a different nav;
          - it is deleted / inactive;
          - it has no CSS.

        Used by the public route to inject the template's CSS
        BEFORE the page's own CSS, so the page styles can override
        the shared layout at equal specificity.

        The is_active filter here is INTENTIONAL and unchanged —
        same rule as get_by_id: unpublished template → its CSS is
        not injected. The child page falls back to its own CSS
        only, so "turn the shell off" also turns off the shell's
        styles, consistently.

        Deliberately does NOT go through `get_by_id` / `_page_to_public`:
          - we only need `css`, not content / datetime / logo;
          - the template may have a different `card_type` than
            CARD_TYPE_PAGE, and get_by_id filters on that;
          - template CSS may be NULL while content is set — we
            return None in that case, and the caller simply skips
            the <link> for the template.
        """
        async for session in get_db_sqlite():
            stmt = select(Page.css).where(
                Page.id == template_id,
                Page.nav_id == nav_id,
                Page.is_delete == 0,
                Page.is_active == 1,
            )
            result = await session.execute(stmt)
            css = result.scalar_one_or_none()
            return css
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

        This method is only called for card_type='page' — all
        callers filter by it. Folders have no content and never
        reach this path.
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
            card_type=page.card_type or CARD_TYPE_PAGE,
            parent_id=page.parent_id,
        )

    @staticmethod
    def _page_to_list_item(
        page: Page,
        children_count: Optional[int] = None,
    ) -> CoreEngineLibPagesPublicItemListItem:
        """
        Convert Page ORM object to the list-item schema used by the
        /pages catalog.

        Unlike _page_to_public, this does NOT touch content or css —
        the catalog only needs the card fields (title, description,
        logo, datetime) plus a ready URL. Keeping the two converters
        separate makes it obvious at a glance which fields each
        consumer depends on.

        `url` is resolved via _resolve_card_url:
          - for a folder → /pages/<id>;
          - for a page with external `url` → that URL;
          - for a regular page → /page/<date>/<time>.

        `children_count` is passed only for folders; None for
        pages. See get_list().
        """
        return CoreEngineLibPagesPublicItemListItem(
            id=page.id,
            nav_id=page.nav_id,
            datetime=page.datetime,
            title=page.title or "",
            description=page.description,
            logo=page.logo,
            url=_resolve_card_url(page),
            card_type=page.card_type or CARD_TYPE_PAGE,
            parent_id=page.parent_id,
            children_count=children_count,
        )