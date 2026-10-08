# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

URL schema:
    GET /page/<date>/<time>   — single page
    GET /pages                — catalog (root or cookie folder)
    GET /pages/<folder_id>    — catalog inside a specific folder

Public URLs are HOST-based: the user is resolved from the request
Host (subdomain <login>.<APP_DOMAIN> or a registered custom domain),
and the page / catalog is looked up within that user's navs. There
is NO nav_id in the URL — the nav is a backend concept and never
appears in a public address.

  - demo.neurocad.ru/page/20260927/152812  → page of demo's nav;
  - demo.neurocad.ru/pages                 → catalog of demo's nav;
  - user1.neurocad.ru/page/20260927/152812 → 404 (page not user1's);
  - neurocad.ru/page/20260927/152812       → admin's page (once the
                                             platform root is bound
                                             to admin via users.domain).

Admin-side URLs (editor, admin catalog) keep their nav_id — the
admin panel is multi-tenant and its host is shared, so nav_id is
the only way to know which nav a page belongs to. This module is
public-only and never sees nav_id in the URL.

Host ownership check:
    Every public page and the catalog are scoped to the OWNER of
    the request Host. Without this check, ANY subdomain of
    APP_DOMAIN — or the bare APP_DOMAIN itself — would happily
    serve any nav from the DB, producing duplicate content across
    domains (bad for SEO) and leaking pages across users.

    Rule:
      - Host is a dev host (localhost, 127.0.0.1, [::1])
        → any nav allowed (local development);
      - Host resolves to a user → only that user's navs are served;
      - Host does not resolve to a user (bare APP_DOMAIN with no
        owner, www., random domain, unknown subdomain) → 404.

    The 404 (not 403) is deliberate: leaking "this page exists but
    is not yours" is worse than pretending it does not exist.
    Crawlers and casual visitors see the same thing either way.

Catalog title:
    /pages uses Nav.name as the page title and the H1 in the
    template. If Nav.name is empty or the nav is missing, falls
    back to "Каталог статей". Nav.name is edited from the admin
    catalog via PUT /core/engine/lib/pages/nav-name.

Folder mode
-----------
The public catalog (/pages) is hierarchical, just like the admin
one. The current folder is resolved from one of three sources:

  - the URL segment: /pages/<id>  (explicit, source of truth);
  - the query flag `?root=1` — explicit "show the root and forget
    the current folder";
  - the cookie `nc_folder_path`: "12.45" — a dot-separated path
    of folder ids from the root to the current folder (fallback
    when the URL has no segment and no `?root=1`).

Precedence:
  1. `?root=1` — always wins, shows the root, clears the cookie.
  2. `/pages/<id>` — explicit folder, shows that folder.
  3. `/pages` alone — the cookie path is consulted.

The `?root=1` flag exists because `/pages` alone is ambiguous: it
means "the folder I was last in" (per the cookie). Without an
explicit marker, a visitor who is deep in the tree has no way to
ask for the root — clicking a "Все" crumb would land on the same
folder they are already in. `?root=1` says "I really mean the
root, forget the cookie".

Cookie validation is done in the service (resolve_folder_path):
a stale / hostile / cross-nav cookie is silently ignored and the
visitor lands on the root, never on an error page.

Breadcrumbs are built server-side (service.get_folder_chain) and
passed to the template as `crumbs`. The template renders the last
crumb as plain text (current folder), the rest as links. The root
crumb carries `/pages?root=1` so it always resolves to the root,
regardless of the current cookie state.

Lazy tariff check:
    Before rendering (both single page and catalog), the owner's
    tariff is checked via BalanceChecked.page_renderable(user_id).
    If the owner is on the free tariff and has more pages than
    limit_pages, the guest sees a "Страница недоступна" placeholder
    (HTTP 200) — not a 404.

Body wrapper cleanup:
    GrapesJS sometimes exports page content wrapped in
    <body>...</body> (e.g. when saved via getProjectData, or for
    pages authored in an older editor version). On the public page
    we are already inside <body>, so a nested <body> is invalid
    HTML and hurts SEO (W3C / Google / Yandex validators flag it).

    _strip_body_wrapper() removes the <body> and </body> tags on
    the fly, at render time. Content is preserved. The DB is NOT
    touched — the editor keeps working with its original format.

Page CSS is served as a static file under this module's namespace:
    /static/core/engine/lib/pages/public/pages/<id>.css?v=<hash>
Generated on demand from page.css (see neurocad/utils/css.py).
For legacy pages (CSS embedded in content as <style>) the CSS is
extracted by the service before rendering.

Namespace: CoreEngineLibPagesPublic*
"""

import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from bs4 import BeautifulSoup
from sqlalchemy import select

from neurocad.utils.templates import templates
from neurocad.utils.css import ensure_css_file
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.nav import Nav
from neurocad.core.models.base import Page
from neurocad.core.engine.lib.balance.checked import BalanceChecked

# Host → user resolution. Shared with utils/routes.py so that
# "/" handlers and public page handlers apply exactly the same
# rules. See neurocad/utils/hosts.py.
from neurocad.utils.hosts import is_dev_host, user_id_from_host

from .service import (
    CoreEngineLibPagesPublicService,
    PAGES_CSS_DIR,
    PAGES_CSS_URL,
)
from .schema import (
    CoreEngineLibPagesPublicItem,
    CoreEngineLibPagesPublicCrumb,
    CARD_TYPE_FOLDER,
)


# Mounted by parent router (utils/routes.py) without extra prefix,
# so the final URL is /page/<date>/<time>.
router = APIRouter(prefix="/page", tags=["core/engine/lib/pages/public"])


# Mounted without a prefix — the final URLs are /pages and
# /pages/<folder_id>. Kept as a separate router because `router`
# above is /page-only and FastAPI does not allow a router to have
# two different prefixes.
router_pages = APIRouter(tags=["core/engine/lib/pages/public"])


# ============================================
# COOKIE — CURRENT FOLDER PATH
# ============================================

#: Cookie that carries the current folder path.
#:
#: Value: dot-separated folder ids, root → current, e.g. "12.45".
#: Empty / missing → the root of the catalog.
#:
#: Not HttpOnly on purpose: the public JS reads it to mirror the
#: value into localStorage (see pages-public.js). It carries no
#: secret — just a folder path — so exposing it to JS is safe.
_FOLDER_COOKIE = "nc_folder_path"

#: One year. A folder path is stable UX state, not a session token.
_FOLDER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

#: Default page size for the public catalog. Kept as a module
#: constant so a future paginated version has one place to change.
PUBLIC_CATALOG_LIMIT = 100

#: Fallback title when Nav.name is empty or the nav is missing.
PUBLIC_CATALOG_DEFAULT_TITLE = "Каталог статей"


def _parse_folder_cookie(raw: Optional[str]) -> List[int]:
    """
    Parse the cookie value into a list of folder ids.

    "12.45"  → [12, 45]
    "" / None → []
    "12.abc" → []  (any bad segment invalidates the whole path —
                     we do not try to salvage a prefix here; the
                     service's resolve_folder_path does the
                     authoritative validation anyway)
    """
    if not raw:
        return []
    result: List[int] = []
    for part in raw.split("."):
        part = part.strip()
        if not part:
            return []
        try:
            result.append(int(part))
        except ValueError:
            return []
    return result


def _serialize_folder_cookie(path_ids: List[int]) -> str:
    """[12, 45] → '12.45'. [] → '' (cookie is cleared)."""
    return ".".join(str(i) for i in path_ids)


def _set_folder_cookie(response: HTMLResponse, path_ids: List[int]) -> None:
    """
    Write the current folder path into the response cookie.

    Called on every /pages render — so the next bare /pages visit
    opens the same folder. If `path_ids` is empty the cookie is
    cleared (Max-Age=0) rather than left with a stale value.
    """
    value = _serialize_folder_cookie(path_ids)
    if value:
        response.set_cookie(
            key=_FOLDER_COOKIE,
            value=value,
            max_age=_FOLDER_COOKIE_MAX_AGE,
            path="/",
            samesite="lax",
        )
    else:
        # Empty path = root. Clear the cookie so a stale value
        # does not resurrect an old folder on the next visit.
        response.delete_cookie(key=_FOLDER_COOKIE, path="/")


# ============================================
# BODY WRAPPER CLEANUP
# ============================================

#: Matches an opening <body ...> tag (with any attributes).
_BODY_OPEN_RE = re.compile(r"<body\b[^>]*>", re.IGNORECASE)

#: Matches a closing </body> tag (optional whitespace).
_BODY_CLOSE_RE = re.compile(r"</body\s*>", re.IGNORECASE)


def _strip_body_wrapper(html: str) -> str:
    """
    Remove a <body>...</body> wrapper from an HTML fragment.

    GrapesJS may export page content wrapped in <body>...</body>
    (e.g. via getProjectData, or for pages authored in an older
    editor version). On the public page we are already inside a
    real <body>, so a nested <body> is invalid HTML — W3C, Google
    and Yandex validators flag it.

    This function removes the tags but keeps the content. It runs
    at render time only — the DB and the editor are NOT touched.

    Attributes on <body> (class, style, data-*) are dropped. In
    practice, body-level styling is applied through the CSS rule
    `body { ... }` (kept in page.css) — that rule targets the real
    <body> of the public page, so styles are preserved. Inline
    style="..." on <body> is rare and would be lost; if that
    becomes an issue, switch to a <div class="page-body-wrapper">
    rewrite instead of a strip.
    """
    if not html:
        return html
    html = _BODY_OPEN_RE.sub("", html)
    html = _BODY_CLOSE_RE.sub("", html)
    return html


# ============================================
# HOST OWNERSHIP CHECK
# ============================================

async def _enforce_host_owner(
    request: Request,
    nav_id: int,
) -> None:
    """
    Ensure the request Host may serve pages of the given nav.

    Raises HTTPException(404) if the Host is not the nav owner's.

    Called AFTER the nav has been resolved — either from the Host
    itself (public routes) or from an explicit ?nav_id= (legacy /
    admin-provided links). The check is the last line of defence:
    even if a nav_id somehow got into the request, only the host
    that owns that nav may see it.

    Rules:
      - Dev host (localhost, 127.0.0.1, [::1]) → allow any nav_id.
        Local development has no APP_DOMAIN and no user subdomains.
      - Host resolves to a user → that user must own the nav.
      - Host does not resolve to a user → 404.

    The 404 (not 403) is deliberate: leaking "this page exists but
    is not yours" is worse than pretending it does not exist.
    Crawlers and casual visitors see the same thing either way.

    This function is the single entry point for the rule — the
    public routes call it once, after resolving the nav. Any future
    public route (e.g. /feed.xml) should do the same.
    """
    host = request.headers.get("host")

    # ---- 1. Dev hosts — skip the check ----
    if is_dev_host(host):
        return

    # ---- 2. Resolve Host to a user ----
    host_user_id = await user_id_from_host(host)
    if host_user_id is None:
        # Bare APP_DOMAIN with no owner, www., random domain,
        # unknown subdomain. Nothing personal is served here.
        raise HTTPException(status_code=404, detail="Page not found")

    # ---- 3. Nav must belong to the Host user ----
    nav_owner_id = await _resolve_nav_owner(nav_id)
    if nav_owner_id is None or nav_owner_id != host_user_id:
        raise HTTPException(status_code=404, detail="Page not found")


# ============================================
# PAGE BY DATETIME
# ============================================

@router.get("/{date}/{time}", response_class=HTMLResponse)
async def render_page_public(
    date: str,
    time: str,
    request: Request,
) -> HTMLResponse:
    """
    Render a page by date/time — resolved through the request Host.

    URL:
        GET /page/<date>/<time>
        GET /page/20260919/023649

    There is NO nav_id in the URL. The page is looked up within
    the navs of the user that the Host resolves to:
      - <login>.<APP_DOMAIN>  → that user's navs;
      - <custom-domain>       → that user's navs;
      - dev host              → first nav in the DB (dev convenience);
      - anything else         → 404.

    Host ownership is enforced by _enforce_host_owner() before any
    page is served: a page reachable on demo.neurocad.ru cannot be
    reached through user1.neurocad.ru, so content is not duplicated
    across user domains (SEO) and not leaked between users.

    A page with the same <date>/<time> may exist in more than one
    nav. Within one Host (one owner) the collision is impossible
    in practice: datetime is chosen by the user, and both pages
    would belong to the same person — the first match wins. Across
    different Hosts, only the owner's page is visible.
    """
    host = request.headers.get("host")

    # ---- Dev host: search across all navs (dev convenience) ----
    if is_dev_host(host):
        page = await CoreEngineLibPagesPublicService.get_by_datetime_any_nav(
            date, time
        )
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")
        return await _render_public_page(request, page)

    # ---- Regular host: resolve user, then search within their navs ----
    host_user_id = await user_id_from_host(host)
    if host_user_id is None:
        raise HTTPException(status_code=404, detail="Page not found")

    page = await CoreEngineLibPagesPublicService.get_by_datetime_for_user(
        date, time, user_id=host_user_id
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return await _render_public_page(request, page)


# ============================================
# CATALOG — /pages (root, cookie folder, or ?root=1)
# ============================================

@router_pages.get("/pages", response_class=HTMLResponse)
async def render_pages_catalog_root(
    request: Request,
    nav_id: Optional[int] = Query(
        None,
        description=(
            "Nav instance ID (optional). Kept for backward compatibility "
            "with old links; ignored by the public UI, which resolves "
            "the nav from the request Host."
        ),
    ),
    root: Optional[int] = Query(
        None,
        description=(
            "Explicitly render the catalog root and clear the current "
            "folder cookie. Used by the 'Все' breadcrumb so a visitor "
            "deep in the folder tree has a reliable way back to the "
            "top, regardless of the nc_folder_path cookie."
        ),
    ),
) -> HTMLResponse:
    """
    Render the public catalog — root, the folder stored in the
    `nc_folder_path` cookie, or an explicit root via `?root=1`.

    URL:
        GET /pages                — root or cookie folder
        GET /pages?root=1         — forced root (clears the cookie)
        GET /pages?nav_id=5       — legacy (see below)

    Folder resolution:
      - `?root=1` — highest precedence: show the root, ignore the
        cookie, and clear it on the way out. This is what the
        "Все" breadcrumb points at, so clicking it always lands on
        the top of the catalog even when the cookie still names a
        folder deep in the tree.
      - No `?root=1`, no URL segment → the cookie is consulted.
        A bad cookie (stale id, deleted folder, cross-nav id,
        broken nesting) is silently ignored — the visitor sees the
        root, never an error page.
      - After resolution, the cookie is rewritten to match (so a
        stale cookie is replaced, not just ignored).

    Nav resolution order:
      1. Explicit ?nav_id= — kept for backward compatibility with
         links generated before the public URL scheme moved to
         host-based resolution. The host check below will reject
         a foreign nav_id.
      2. Otherwise — resolve from the request Host:
         - <login>.<APP_DOMAIN>  → that user's first nav;
         - <custom-domain>       → that user's first nav;
         - dev host              → first nav in the DB;
         - unknown host          → first nav in the DB, then the
                                   host check rejects it.

    Host ownership: after the nav is resolved, the same
    _enforce_host_owner check applies.
    """
    # ---- 1. Resolve nav_id (explicit or via Host) ----
    nav_id = await _resolve_nav_id_for_catalog(request, nav_id)
    if nav_id is None:
        raise HTTPException(status_code=404, detail="No nav found")

    # ---- 2. Host ownership check ----
    await _enforce_host_owner(request, nav_id)

    # ---- 3. Resolve folder path ----
    if root:
        # Explicit "show the root". Ignore the cookie so a stale
        # path does not pull the visitor back into a folder, and
        # let _render_pages_catalog clear the cookie below.
        path_ids: List[int] = []
    else:
        cookie_path = _parse_folder_cookie(
            request.cookies.get(_FOLDER_COOKIE)
        )
        path_ids = await CoreEngineLibPagesPublicService.resolve_folder_path(
            nav_id, cookie_path
        )

    return await _render_pages_catalog(request, nav_id, path_ids)


# ============================================
# CATALOG — /pages/<folder_id>
# ============================================

@router_pages.get("/pages/{folder_id}", response_class=HTMLResponse)
async def render_pages_catalog_folder(
    folder_id: int,
    request: Request,
) -> HTMLResponse:
    """
    Render the public catalog inside a specific folder.

    URL:
        GET /pages/<folder_id>
        GET /pages/12

    This is the explicit, SEO-friendly form: each folder has its
    own URL, and the folder id is what the template uses for its
    breadcrumb links. The URL is the source of truth when present —
    the cookie is ignored here, and rewritten afterwards to match
    the URL (so a bare /pages visit right after this one opens the
    same folder).

    If `folder_id` is not a valid folder of the current nav (wrong
    id, deleted folder, folder from another nav, or the id of a
    regular page) → 404. Unlike the cookie path, a bad URL segment
    is not silently swallowed: it means a broken / stale link, and
    the correct signal is "not found", not "redirect to root".
    """
    # ---- 1. Resolve nav_id from Host ----
    nav_id = await _resolve_nav_id_for_catalog(request, None)
    if nav_id is None:
        raise HTTPException(status_code=404, detail="No nav found")

    # ---- 2. Host ownership check ----
    await _enforce_host_owner(request, nav_id)

    # ---- 3. Validate the folder id ----
    folder = await CoreEngineLibPagesPublicService.get_folder_by_id(
        folder_id, nav_id
    )
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    # ---- 4. Build the folder path from the root ----
    # The URL only carries the leaf folder id, not the full chain.
    # resolve_folder_path with a single id returns [id] if id is a
    # valid root-level folder, or [] otherwise. But our folders may
    # be nested, so we need the full chain — walk parent_id up.
    path_ids = await _build_folder_path(nav_id, folder.id)

    return await _render_pages_catalog(request, nav_id, path_ids)


# ============================================
# CATALOG RENDER HELPER
# ============================================

async def _render_pages_catalog(
    request: Request,
    nav_id: int,
    path_ids: List[int],
) -> HTMLResponse:
    """
    Build and render the /pages catalog for a given folder path.

    Steps:
      1. Same lazy tariff check as a single page: if the owner's
         tariff blocks rendering, return the placeholder.
      2. Load the children of the current folder (folders + pages)
         via CoreEngineLibPagesPublicService.get_list().
      3. Build breadcrumbs via get_folder_chain().
      4. Render public/pages.html with the list, the crumbs and
         the catalog title taken from Nav.name.
      5. Rewrite the cookie to match `path_ids` — so the next bare
         /pages visit opens the same folder. When `path_ids` is
         empty (root, including the explicit `?root=1` case), the
         cookie is cleared.

    Each item already carries a ready `url`:
      - folder → /pages/<id>;
      - page   → /page/<YYYYMMDD>/<HHMMSS> or an external URL.
    The template just prints it.
    """
    # ==== LAZY TARIFF CHECK ====
    user_id = await _resolve_nav_owner(nav_id)
    if user_id is not None:
        allowed = await BalanceChecked.page_renderable(
            user_id, log=getattr(request.app.state, "log", None)
        )
        if not allowed:
            response = _render_unavailable(request)
            _set_folder_cookie(response, [])
            return response

    # ==== ITEMS ====
    # Current folder = last id in path_ids (None = root).
    current_folder_id: Optional[int] = path_ids[-1] if path_ids else None

    items = await CoreEngineLibPagesPublicService.get_list(
        nav_id,
        parent_id=current_folder_id,
        limit=PUBLIC_CATALOG_LIMIT,
    )

    # ==== BREADCRUMBS ====
    crumbs: List[CoreEngineLibPagesPublicCrumb] = (
        await CoreEngineLibPagesPublicService.get_folder_chain(
            nav_id, path_ids
        )
    )

    # ==== TITLE ====
    # Заголовок каталога — Nav.name. Редактируется из админки
    # через PUT /core/engine/lib/pages/nav-name. Если name пуст
    # или nav отсутствует — общий фолбэк.
    nav_name = await _resolve_nav_name(nav_id)
    title = (nav_name or "").strip() or PUBLIC_CATALOG_DEFAULT_TITLE

    # Если мы в папке — добавляем её имя в <title> для SEO/UX.
    if current_folder_id is not None and len(crumbs) > 1:
        folder_title = crumbs[-1].title
        if folder_title:
            title = f"{folder_title} — {title}"

    response = templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/pages.html",
        context={
            "title": title,
            "description": "",
            "items": items,
            "crumbs": crumbs,
            "current_folder_id": current_folder_id,
            "nav_id": nav_id,
            "total": len(items),
        },
    )
    _set_folder_cookie(response, path_ids)
    return response


# ============================================
# NAV RESOLUTION HELPERS
# ============================================

async def _resolve_nav_id_for_catalog(
    request: Request,
    explicit_nav_id: Optional[int],
) -> Optional[int]:
    """
    Resolve the nav id for /pages.

    Order:
      1. Explicit ?nav_id= — legacy, validated later by the host
         check.
      2. Otherwise — from the Host:
         - dev host        → first nav in the DB;
         - user host       → that user's first nav;
         - unknown host    → first nav in the DB (the host check
                             will reject it right after).
    """
    if explicit_nav_id is not None:
        return explicit_nav_id

    host = request.headers.get("host")

    if is_dev_host(host):
        return await _resolve_first_nav_id()

    host_user_id = await user_id_from_host(host)
    if host_user_id is not None:
        return await _resolve_first_nav_id_for_user(host_user_id)

    # Unknown host — fall back to the first nav in the DB. The
    # caller's _enforce_host_owner will reject it (the host does
    # not resolve to that nav's owner). Returning None here would
    # turn an unknown host into a 404 with a different message;
    # "No nav found" and "Page not found" are both 404, but the
    # latter is what a probe should see.
    return await _resolve_first_nav_id()


async def _build_folder_path(
    nav_id: int,
    leaf_folder_id: int,
) -> List[int]:
    """
    Walk the parent_id chain from a leaf folder up to the root,
    then reverse it → [root, ..., leaf].

    Used by /pages/<folder_id>: the URL only has the leaf id, but
    breadcrumbs and the cookie need the full chain.

    Stops at a missing parent, a cycle, or a folder whose nav_id
    does not match `nav_id` (defensive — should not happen if the
    leaf was validated by get_folder_by_id).

    If the chain is broken above the leaf, returns the longest
    valid suffix ending at the leaf (i.e. what could be walked).
    In the worst case (leaf's parent is missing) returns [leaf].
    """
    chain: List[int] = []
    current: Optional[int] = leaf_folder_id
    seen: set = set()

    while current is not None and current not in seen:
        seen.add(current)
        row = await _load_folder_row(nav_id, current)
        if row is None:
            break
        chain.append(current)
        current = row[1]  # parent_id

    chain.reverse()
    return chain


async def _load_folder_row(
    nav_id: int,
    folder_id: int,
):
    """
    Load (id, parent_id) for a folder, or None.

    Only returns rows that are folders of the given nav and are
    not deleted / not disabled. Kept small and separate so
    _build_folder_path stays readable.
    """
    async for session in get_db_sqlite():
        stmt = select(Page.id, Page.parent_id).where(
            Page.id == folder_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
            Page.is_active == 1,
            Page.card_type == CARD_TYPE_FOLDER,
        )
        result = await session.execute(stmt)
        return result.one_or_none()
    return None


# ============================================
# RENDER HELPER (SINGLE PAGE) — unchanged
# ============================================

async def _render_public_page(
    request: Request,
    page: CoreEngineLibPagesPublicItem,
) -> HTMLResponse:
    """
    Render public page template with content from DB.

    Before rendering, checks the owner's tariff via
    BalanceChecked.page_renderable(user_id). If blocked — returns
    the "Страница недоступна" placeholder (HTTP 200).

    If page has template_id — loads the base template page and inserts
    page content into [data-slot="content"] of the template.

    Page CSS is written to
        static/core/engine/lib/pages/public/pages/<id>.css
    (if not already there with the same content) and passed to the
    template as page_css_url.
    """
    # ==== LAZY TARIFF CHECK ====
    user_id = await _resolve_nav_owner(page.nav_id)
    if user_id is not None:
        allowed = await BalanceChecked.page_renderable(
            user_id, log=getattr(request.app.state, "log", None)
        )
        if not allowed:
            return _render_unavailable(request)

    # Format datetime for display
    dt_display = None
    if page.datetime:
        try:
            if isinstance(page.datetime, str):
                dt = datetime.fromisoformat(page.datetime)
            else:
                dt = page.datetime
            dt_display = dt.strftime("%d.%m.%Y %H:%M")
        except Exception:
            dt_display = str(page.datetime)

    # Apply base template if set
    final_content = await _resolve_content(page)

    # Page CSS — write derivative file (if needed) and get URL with ?v=<hash>.
    page_css_url = ensure_css_file(
        page.id,
        page.css,
        directory=PAGES_CSS_DIR,
        url_prefix=PAGES_CSS_URL,
    )

    return templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/public.html",
        context={
            "title": page.title or "Без названия",
            "description": page.description or "",
            "content": final_content,
            "datetime": dt_display,
            "logo": page.logo,
            "nav_id": page.nav_id,
            "page_css_url": page_css_url,
        },
    )


# ============================================
# UNAVAILABLE PLACEHOLDER — unchanged
# ============================================

def _render_unavailable(request: Request) -> HTMLResponse:
    """
    Render the "Страница недоступна" placeholder (HTTP 200).
    """
    html = """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Страница недоступна</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1e293b;
        }
        .wrap {
            min-height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
        }
        .card {
            max-width: 480px;
            text-align: center;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 40px 32px;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        }
        .icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
        .title {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 8px;
        }
        .text {
            font-size: 14px;
            color: #64748b;
            margin: 0;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <div class="icon">🔒</div>
            <h1 class="title">Страница недоступна</h1>
            <p class="text">
                Владелец сайта временно не может показывать эту страницу.
                Попробуйте зайти позже.
            </p>
        </div>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


# ============================================
# TEMPLATE APPLICATION — unchanged
# ============================================

async def _resolve_content(page: CoreEngineLibPagesPublicItem) -> str:
    """
    Build the final HTML for the page.

    If page.template_id is set:
      1. Load the base template page (within the same nav).
      2. Insert page.content into [data-slot="content"] of the template.
      3. Return the combined HTML.

    Otherwise — return page.content as-is.

    In all cases, a stray <body>...</body> wrapper (produced by
    GrapesJS export in some paths) is stripped before returning.
    """
    page_content = page.content or "<p>Пустая страница</p>"

    if not page.template_id:
        return _strip_body_wrapper(page_content)

    template = await CoreEngineLibPagesPublicService.get_by_id(
        page.template_id, nav_id=page.nav_id
    )
    if not template or not template.content:
        return _strip_body_wrapper(page_content)

    combined = _apply_template(template.content, page_content)
    return _strip_body_wrapper(combined)


def _apply_template(template_html: str, content_html: str) -> str:
    """
    Insert content_html into the [data-slot="content"] of template_html.
    """
    soup = BeautifulSoup(template_html, "html.parser")
    slot = soup.find(attrs={"data-slot": "content"})

    if not slot:
        return template_html

    slot.clear()
    slot.append(BeautifulSoup(content_html, "html.parser"))

    return str(soup)


# ============================================
# NAV OWNER / NAV RESOLUTION — unchanged
# ============================================

async def _resolve_nav_owner(nav_id: int) -> Optional[int]:
    """
    Return the user_id of the nav's owner, or None.
    """
    async for session in get_db_sqlite():
        stmt = select(Nav.user_id).where(
            Nav.id == nav_id,
            Nav.is_delete.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


async def _resolve_nav_name(nav_id: int) -> Optional[str]:
    """
    Return Nav.name for the given nav, or None.
    """
    async for session in get_db_sqlite():
        stmt = select(Nav.name).where(
            Nav.id == nav_id,
            Nav.is_delete.is_(False),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


async def _resolve_first_nav_id_for_user(user_id: int) -> Optional[int]:
    """
    Return the first non-deleted nav id of the given user
    (ORDER BY id ASC), or None.
    """
    async for session in get_db_sqlite():
        stmt = (
            select(Nav.id)
            .where(Nav.user_id == user_id, Nav.is_delete.is_(False))
            .order_by(Nav.id.asc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None


async def _resolve_first_nav_id() -> Optional[int]:
    """
    Return the first non-deleted nav id (ORDER BY id ASC), or None.
    """
    async for session in get_db_sqlite():
        stmt = (
            select(Nav.id)
            .where(Nav.is_delete.is_(False))
            .order_by(Nav.id.asc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None