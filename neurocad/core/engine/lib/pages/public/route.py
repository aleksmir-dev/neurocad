# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

URL schema:
    GET /page/<nav_id>/<date>/<time>

Pages are scoped to a nav instance (Page.nav_id). The nav_id is part
of the URL, so the same <date>/<time> pair can exist in different
nav instances without collision.

Lazy tariff check:
    Before rendering, the owner's tariff is checked via
    BalanceChecked.page_renderable(user_id). If the owner is on the
    free tariff and has more pages than limit_pages, the guest sees
    a "Страница недоступна" placeholder (HTTP 200) — not a 404.

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

from fastapi import APIRouter, Request, HTTPException
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
# RENDER HELPER
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
# NAV OWNER
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