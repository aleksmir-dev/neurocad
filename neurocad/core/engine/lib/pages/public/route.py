# neurocad/core/engine/lib/pages/public/route.py

"""
Public pages routes.

Clean HTML rendering — no admin UI, no JS engine.
Uses base template + CSS from /static, content from DB.

Namespace: CoreEngineLibPagesPublic*
"""

from datetime import datetime

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse

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

    return _render_public_page(request, page)


# ============================================
# RENDER HELPER
# ============================================

def _render_public_page(
    request: Request,
    page: CoreEngineLibPagesPublicItem,
) -> HTMLResponse:
    """
    Render public page template with content from DB.

    Base CSS is loaded from /static (shared with admin).
    No engine.js, no renderer.js, no admin toolbar.
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

    return templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/public.html",
        context={
            "title": page.title or "Без названия",
            "description": page.description or "",
            "content": page.content or "<p>Пустая страница</p>",
            "datetime": dt_display,
            "logo": page.logo,
            "module_name": "default",
        },
    )