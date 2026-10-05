# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

URL schema:
    GET /page/<date>/<time>   — single page
    GET /pages                — catalog (list of pages)

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
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import HTMLResponse
from bs4 import BeautifulSoup
from sqlalchemy import select

from neurocad.utils.templates import templates
from neurocad.utils.css import ensure_css_file
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.nav import Nav
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
from .schema import CoreEngineLibPagesPublicItem


# Mounted by parent router (utils/routes.py) without extra prefix,
# so the final URL is /page/<date>/<time>.
router = APIRouter(prefix="/page", tags=["core/engine/lib/pages/public"])


# Mounted without a prefix — the final URL is /pages. Kept as a
# separate router because `router` above is /page-only and FastAPI
# does not allow a router to have two different prefixes.
router_pages = APIRouter(tags=["core/engine/lib/pages/public"])


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
# CATALOG (LIST OF PAGES)
# ============================================

@router_pages.get("/pages", response_class=HTMLResponse)
async def render_pages_catalog(
    request: Request,
    nav_id: Optional[int] = Query(
        None,
        description=(
            "Nav instance ID (optional). Kept for backward compatibility "
            "with old links; ignored by the public UI, which resolves "
            "the nav from the request Host."
        ),
    ),
) -> HTMLResponse:
    """
    Render the public catalog of a nav's pages.

    URL:
        GET /pages
        GET /pages?nav_id=5   (legacy — see below)

    The catalog lists every active, non-deleted page of the nav,
    newest first. No pagination yet — up to PUBLIC_CATALOG_LIMIT
    items in one response. Same lazy tariff check as a single page:
    if the owner's tariff blocks rendering, the guest sees the
    "Страница недоступна" placeholder.

    The page title (both <title> and the H1 in the template) comes
    from Nav.name. If Nav.name is empty, falls back to
    "Каталог статей".

    Nav resolution order:
      1. Explicit ?nav_id= — kept for backward compatibility with
         links that were generated before the public URL scheme
         moved to host-based resolution. The host check below will
         reject a foreign nav_id.
      2. Otherwise — resolve from the request Host:
         - <login>.<APP_DOMAIN>  → that user's first nav;
         - <custom-domain>       → that user's first nav;
         - dev host              → first nav in the DB;
         - unknown host          → first nav in the DB, then the
                                   host check rejects it.

    Host ownership: after the nav is resolved, the same
    _enforce_host_owner check applies. Without it, the catalog of
    any nav could be listed on any subdomain.
    """
    # ---- 1. Explicit ?nav_id= wins (legacy) ----
    if nav_id is None:
        # ---- 2. Resolve by Host ----
        host = request.headers.get("host")

        if is_dev_host(host):
            # Dev — no host scope. First nav in the DB is fine.
            nav_id = await _resolve_first_nav_id()
        else:
            host_user_id = await user_id_from_host(host)
            if host_user_id is None:
                raise HTTPException(status_code=404, detail="No nav found")
            nav_id = await _resolve_first_nav_id_for_user(host_user_id)

    if nav_id is None:
        raise HTTPException(status_code=404, detail="No nav found")

    # ---- 3. Host ownership check ----
    # Done AFTER nav resolution: an explicit ?nav_id= is validated
    # against the host; a host-derived nav_id is validated too, so
    # an unknown host that fell back to "first nav in the DB" is
    # still rejected (the owner of that nav is not the host).
    await _enforce_host_owner(request, nav_id)

    return await _render_pages_catalog(request, nav_id)


# ============================================
# CATALOG RENDER HELPER
# ============================================

#: Maximum number of items in the catalog. Kept as a module-level
#: constant so a future paginated version has one place to change.
PUBLIC_CATALOG_LIMIT = 100

#: Fallback title when Nav.name is empty or the nav is missing.
#: Kept as a constant so tests and (potentially) an admin UI can
#: reference the same string.
PUBLIC_CATALOG_DEFAULT_TITLE = "Каталог статей"


async def _render_pages_catalog(
    request: Request,
    nav_id: int,
) -> HTMLResponse:
    """
    Build and render the /pages catalog.

    Steps:
      1. Same lazy tariff check as a single page: if the owner's
         tariff blocks rendering, return the placeholder.
      2. Load up to PUBLIC_CATALOG_LIMIT active, non-deleted pages
         via CoreEngineLibPagesPublicService.get_list().
      3. Render public/pages.html with the list and the catalog
         title taken from Nav.name.

    Each item already carries a ready `url`
    (/page/<YYYYMMDD>/<HHMMSS>) — see _page_to_list_item in the
    service. The template just prints it.
    """
    # ==== LAZY TARIFF CHECK ====
    # Same rule as a single page: the catalog is only shown if the
    # owner's tariff allows rendering pages at all. Otherwise the
    # guest sees the placeholder instead of a list of titles.
    user_id = await _resolve_nav_owner(nav_id)
    if user_id is not None:
        allowed = await BalanceChecked.page_renderable(
            user_id, log=getattr(request.app.state, "log", None)
        )
        if not allowed:
            return _render_unavailable(request)

    items = await CoreEngineLibPagesPublicService.get_list(
        nav_id,
        limit=PUBLIC_CATALOG_LIMIT,
    )

    # Заголовок каталога — Nav.name. Редактируется из админки
    # через PUT /core/engine/lib/pages/nav-name. Если name пуст
    # или nav отсутствует — общий фолбэк, чтобы каталог никогда
    # не открывался без заголовка.
    nav_name = await _resolve_nav_name(nav_id)
    title = (nav_name or "").strip() or PUBLIC_CATALOG_DEFAULT_TITLE

    return templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/pages.html",
        context={
            "title": title,
            "description": "",
            "items": items,
            "nav_id": nav_id,
            "total": len(items),
        },
    )


# ============================================
# RENDER HELPER (SINGLE PAGE)
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
    # Find the owner of this nav (user_id) — needed to check the
    # owner's tariff and pages count.
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
    # Returns None if page.css is empty (legacy pages without CSS at all).
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
# UNAVAILABLE PLACEHOLDER
# ============================================

def _render_unavailable(request: Request) -> HTMLResponse:
    """
    Render the "Страница недоступна" placeholder (HTTP 200).

    Shown when the page owner is on the free tariff and has more
    pages than limit_pages (e.g. dropped from pro back to free).
    Used by both the single-page route and the /pages catalog.
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
# TEMPLATE APPLICATION
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
    GrapesJS export in some paths) is stripped before returning —
    see _strip_body_wrapper for the rationale.
    """
    page_content = page.content or "<p>Пустая страница</p>"

    # No template — return page content as-is (after body cleanup)
    if not page.template_id:
        return _strip_body_wrapper(page_content)

    # Load template page — same nav as the page itself, so a template
    # cannot cross nav boundaries.
    template = await CoreEngineLibPagesPublicService.get_by_id(
        page.template_id, nav_id=page.nav_id
    )
    if not template or not template.content:
        return _strip_body_wrapper(page_content)

    # Apply template — replace [data-slot="content"] with page content
    combined = _apply_template(template.content, page_content)
    return _strip_body_wrapper(combined)


def _apply_template(template_html: str, content_html: str) -> str:
    """
    Insert content_html into the [data-slot="content"] of template_html.

    Uses BeautifulSoup — clean, no regex, no fragile string search.
    Preserves the slot element itself (only its inner HTML is replaced).
    """
    soup = BeautifulSoup(template_html, "html.parser")
    slot = soup.find(attrs={"data-slot": "content"})

    if not slot:
        # No slot — return template as-is (page content skipped)
        return template_html

    # Replace inner HTML of the slot, keep the slot element itself.
    slot.clear()
    slot.append(BeautifulSoup(content_html, "html.parser"))

    return str(soup)


# ============================================
# NAV OWNER / NAV RESOLUTION
# ============================================

async def _resolve_nav_owner(nav_id: int) -> Optional[int]:
    """
    Return the user_id of the nav's owner, or None.

    Used by:
      - _enforce_host_owner() — to check nav ownership against Host;
      - _render_pages_catalog() / _render_public_page() — for the
        lazy tariff check.

    Does not raise on missing nav — the caller treats None as
    "cannot check, let the request through" for the tariff path,
    but as "not owned" for the host-check path.
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

    Used as the title of the /pages catalog (both <title> and the
    H1 in the template). Never raises on missing nav — the caller
    falls back to PUBLIC_CATALOG_DEFAULT_TITLE.

    Same nav-resolution guards as _resolve_nav_owner: only
    non-deleted navs are considered.
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

    Used by /pages when the request Host belongs to a user — the
    catalog then shows THAT user's articles, not the oldest nav
    in the DB. The DB-wide fallback (_resolve_first_nav_id) stays
    for hosts that do not belong to any user (dev host, unknown
    host) where "the first nav" is the most reasonable default.
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

    Used only as a fallback for hosts that do not resolve to a
    user (dev host, unknown host). For user hosts the catalog
    uses _resolve_first_nav_id_for_user() instead.
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