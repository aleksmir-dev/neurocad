# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

Namespace: CoreEngineLibPagesPublic*
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from bs4 import BeautifulSoup

from neurocad.utils.templates import templates
from .service import CoreEngineLibPagesPublicService
from .schema import CoreEngineLibPagesPublicItem


# No prefix — mounted by parent router (lib/route.py)
router = APIRouter(prefix="/page", tags=["/page"])


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
    Render a page by date/time.

    URL:
        GET /pages/20260919/023649
    """
    page = await CoreEngineLibPagesPublicService.get_by_datetime(date, time)
    if not page:
        raise HTTPException(status_code=404, detail="Страница не найдена")

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

    Base CSS is loaded from /static (shared with admin).
    No engine.js, no renderer.js, no admin toolbar.

    If page has template_id — loads the base template page and inserts
    page content into [data-slot="content"] of the template.
    """
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

    # Block CSS — scanned from the blocks directory by the service.
    # Same list is used by the editor (via JS manifest) and here,
    # so public page and editor render identically.
    block_css_urls = CoreEngineLibPagesPublicService.get_block_css_urls()

    return templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/public.html",
        context={
            "title": page.title or "Без названия",
            "description": page.description or "",
            "content": final_content,
            "datetime": dt_display,
            "logo": page.logo,
            "module_name": "default",
            "block_css_urls": block_css_urls,
        },
    )


# ============================================
# TEMPLATE APPLICATION
# ============================================

async def _resolve_content(page: CoreEngineLibPagesPublicItem) -> str:
    """
    Build the final HTML for the page.

    If page.template_id is set:
      1. Load the base template page.
      2. Insert page.content into [data-slot="content"] of the template.
      3. Return the combined HTML.

    Otherwise — return page.content as-is.

    If the template is missing or has no [data-slot="content"],
    returns the template HTML as-is (page content is skipped) —
    matches the JS behavior in editor/src/view.js.
    """
    page_content = page.content or "<p>Пустая страница</p>"

    # No template — return page content as-is
    if not page.template_id:
        return page_content

    # Load template page
    template = await CoreEngineLibPagesPublicService.get_by_id(page.template_id)
    if not template or not template.content:
        return page_content

    # Apply template — replace [data-slot="content"] with page content
    return _apply_template(template.content, page_content)


def _apply_template(template_html: str, content_html: str) -> str:
    """
    Insert content_html into the [data-slot="content"] of template_html.

    Uses BeautifulSoup — clean, no regex, no fragile string search.
    Preserves the slot element itself (only its inner HTML is replaced).

    If template has no slot — returns template as-is (page content skipped).
    This matches the behavior of applyTemplate() in the editor JS.
    """
    soup = BeautifulSoup(template_html, "html.parser")
    slot = soup.find(attrs={"data-slot": "content"})

    if not slot:
        # No slot — return template as-is (page content skipped)
        return template_html

    # Replace inner HTML of the slot, keep the slot element itself.
    # slot.clear() removes all children; then we append parsed content.
    slot.clear()
    slot.append(BeautifulSoup(content_html, "html.parser"))

    return str(soup)