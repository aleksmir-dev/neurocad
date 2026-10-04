# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

URL schema:
    GET /page/<nav_id>/<date>/<time>   — single page
    GET /pages                         — catalog (list of pages)

Pages are scoped to a nav instance (Page.nav_id). The nav_id is part
of the single-page URL, so the same <date>/<time> pair can exist in
different nav instances without collision. The catalog route uses a
query parameter (?nav_id=) instead, because /pages is a single
stable URL.

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
from .service import (
    CoreEngineLibPagesPublicService,
    PAGES_CSS_DIR,
    PAGES_CSS_URL,
)
from .schema import CoreEngineLibPagesPublicItem


# Mounted by parent router (utils/routes.py) without extra prefix,
# so the final URL is /page/<nav_id>/<date>/<time>.
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
# PAGE BY DATETIME
# ============================================

@router.get("/{nav_id}/{date}/{time}", response_class=HTMLResponse)
async def render_page_public(
    nav_id: int,
    date: str,
    time: str,
    request: Request,
) -> HTMLResponse:
    """
    Render a page by nav_id + date/time.

    URL:
        GET /page/<nav_id>/20260919/023649
    """
    page = await CoreEngineLibPagesPublicService.get_by_datetime(
        date, time, nav_id=nav_id
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
        description="Nav instance ID. If omitted, the first non-deleted nav is used.",
    ),
) -> HTMLResponse:
    """
    Render the public catalog of a nav's pages.

    URL:
        GET /pages
        GET /pages?nav_id=5

    The catalog lists every active, non-deleted page of the nav,
    newest first. No pagination yet — up to PUBLIC_CATALOG_LIMIT
    items in one response. Same lazy tariff check as a single page:
    if the owner's tariff blocks rendering, the guest sees the
    "Страница недоступна" placeholder.

    The page title (both <title> and the H1 in the template) comes
    from Nav.name. If Nav.name is empty, falls back to
    "Каталог статей".

    No admin UI, no JS engine — plain HTML rendered from a Jinja
    template, same pattern as the single-page public route.
    """
    # Resolve the nav: explicit ?nav_id= wins, otherwise the first
    # non-deleted nav in the DB (same fallback as utils/routes.py
    # uses for "/").
    if nav_id is None:
        nav_id = await _resolve_first_nav_id()
    if nav_id is None:
        raise HTTPException(status_code=404, detail="No nav found")

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
    (/page/<nav_id>/<YYYYMMDD>/<HHMMSS>) — see
    _page_to_list_item in the service. The template just prints it.
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

    Used only for the lazy tariff check. Does not raise on missing nav —
    the caller treats None as "cannot check, let the page through".
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


async def _resolve_first_nav_id() -> Optional[int]:
    """
    Return the first non-deleted nav id (ORDER BY id ASC), or None.

    Fallback for /pages without an explicit ?nav_id=. Same logic as
    the "/" handler in utils/routes.py — the visitor sees the oldest
    nav, which for a single-user setup is the owner's catalog.
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