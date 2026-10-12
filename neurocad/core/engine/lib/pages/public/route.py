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

Host ownership:
    Every public page and the catalog are scoped to the OWNER of
    the request Host — see hosts.enforce_host_owner(). The 404 (not
    403) is deliberate: leaking "this page exists but is not yours"
    is worse than pretending it does not exist.

Catalog title:
    /pages uses Nav.name as the page title and the H1 in the
    template. If Nav.name is empty or the nav is missing, falls
    back to "Каталог статей". Nav.name is edited from the admin
    catalog via PUT /core/engine/lib/pages/nav-name.

Folder mode:
    The public catalog (/pages) is hierarchical. The current
    folder is resolved from one of three sources:

      - the URL segment: /pages/<id>  (explicit, source of truth);
      - the query flag `?root=1` — explicit "show the root and
        forget the current folder";
      - the cookie `nc_folder_path` — dot-separated path from the
        root to the current folder (fallback when the URL has no
        segment and no `?root=1`).

    Precedence: `?root=1` → `/pages/<id>` → cookie. See cookies.py
    for the cookie side and paths.py for the parent-chain walk.

Layout of this package
----------------------
    route.py     — this file: URLs and their handlers.
    render.py    — rendering helpers (page / catalog / placeholder).
    cookies.py   — cookie for the current folder path.
    html.py      — strip_body_wrapper, apply_template.
    hosts.py     — host ownership + nav resolution.
    paths.py     — folder-path walk (build_folder_path).

Everything else (reading pages, folder lists, breadcrumbs) lives
in service.py. The route layer just declares URLs, resolves the
request Host to a nav / page / folder path, and hands the result
to a render helper.

Namespace: CoreEngineLibPagesPublic*
"""

from typing import List, Optional

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse

from neurocad.utils.hosts import is_dev_host, user_id_from_host

from .service import CoreEngineLibPagesPublicService

from .cookies import (
    FOLDER_COOKIE,
    parse_folder_cookie,
)
from .hosts import (
    enforce_host_owner,
    resolve_first_nav_id,
    resolve_first_nav_id_for_user,
)
from .paths import build_folder_path
from .render import (
    render_pages_catalog,
    render_public_page,
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
# NAV RESOLUTION — for /pages
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

    Kept in route.py (not hosts.py) because it consults the
    request directly — the ?nav_id= query param and the Host
    header. The pieces it delegates to (first nav of a user, first
    nav in the DB) are in hosts.py, where they are reused by the
    single-page route too.
    """
    if explicit_nav_id is not None:
        return explicit_nav_id

    host = request.headers.get("host")

    if is_dev_host(host):
        return await resolve_first_nav_id()

    host_user_id = await user_id_from_host(host)
    if host_user_id is not None:
        return await resolve_first_nav_id_for_user(host_user_id)

    # Unknown host — fall back to the first nav in the DB. The
    # caller's enforce_host_owner will reject it (the host does
    # not resolve to that nav's owner). Returning None here would
    # turn an unknown host into a 404 with a different message;
    # "No nav found" and "Page not found" are both 404, but the
    # latter is what a probe should see.
    return await resolve_first_nav_id()


# ============================================
# PAGE BY DATETIME
# ============================================

@router.get("/{date}/{time}", response_class=HTMLResponse)
async def render_page_public_route(
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

    Host ownership is enforced by hosts.enforce_host_owner() before
    any page is served: a page reachable on demo.neurocad.ru cannot
    be reached through user1.neurocad.ru, so content is not
    duplicated across user domains (SEO) and not leaked between
    users.

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
        return await render_public_page(request, page)

    # ---- Regular host: resolve user, then search within their navs ----
    host_user_id = await user_id_from_host(host)
    if host_user_id is None:
        raise HTTPException(status_code=404, detail="Page not found")

    page = await CoreEngineLibPagesPublicService.get_by_datetime_for_user(
        date, time, user_id=host_user_id
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return await render_public_page(request, page)


# ============================================
# CATALOG — /pages (root, cookie folder, or ?root=1)
# ============================================

@router_pages.get("/pages", response_class=HTMLResponse)
async def render_pages_catalog_root_route(
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
        stale cookie is replaced, not just ignored) — see
        render.render_pages_catalog.

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
    hosts.enforce_host_owner check applies.
    """
    # ---- 1. Resolve nav_id (explicit or via Host) ----
    nav_id = await _resolve_nav_id_for_catalog(request, nav_id)
    if nav_id is None:
        raise HTTPException(status_code=404, detail="No nav found")

    # ---- 2. Host ownership check ----
    await enforce_host_owner(request, nav_id)

    # ---- 3. Resolve folder path ----
    if root:
        # Explicit "show the root". Ignore the cookie so a stale
        # path does not pull the visitor back into a folder, and
        # let render_pages_catalog clear the cookie below.
        path_ids: List[int] = []
    else:
        cookie_path = parse_folder_cookie(
            request.cookies.get(FOLDER_COOKIE)
        )
        path_ids = await CoreEngineLibPagesPublicService.resolve_folder_path(
            nav_id, cookie_path
        )

    return await render_pages_catalog(request, nav_id, path_ids)


# ============================================
# CATALOG — /pages/<folder_id>
# ============================================

@router_pages.get("/pages/{folder_id}", response_class=HTMLResponse)
async def render_pages_catalog_folder_route(
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
    await enforce_host_owner(request, nav_id)

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
    path_ids = await build_folder_path(nav_id, folder.id)

    return await render_pages_catalog(request, nav_id, path_ids)