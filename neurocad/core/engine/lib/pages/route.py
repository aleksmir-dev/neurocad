# neurocad/core/engine/lib/pages/route.py

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.checked import BalanceChecked
from .service import CoreEngineLibPagesService
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
)

router = APIRouter(prefix="/pages", tags=["core/engine/lib/pages"])


# ========================================
# NAV NAME — REQUEST SCHEMA
# ========================================
#
# Небольшая локальная схема для PUT /nav-name. Живёт рядом с
# роутом, потому что больше нигде не используется. Если когда-
# нибудь понадобится где-то ещё — переедет в schema.py.

class CoreEngineLibPagesNavNameSetRequest(BaseModel):
    """Body for PUT /pages/nav-name — new Nav.name value."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Новый заголовок каталога (Nav.name)",
    )


# ========================================
# NAV RESOLUTION
# ========================================

async def _resolve_nav_id(
    request: Request,
    explicit_nav_id: Optional[int],
    current_user: Optional[dict] = None,
) -> int:
    """
    Resolve the nav instance for the current request.

    Priority:
      1. Explicit nav_id — used ONLY if it belongs to the current
         user (or the user is a superadmin). If it does not belong
         to the user, we silently fall back to the user's own nav.
         This keeps the UX clean: no 403s, no error pages, the user
         always sees their own catalog.
      2. First nav of the current user (ORDER BY id ASC, is_delete=0).

    Raises:
        401 if there is no authenticated user.
        404 if the current user has no nav at all.
    """
    if current_user is None:
        current_user = await get_current_user(request)

    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    is_superadmin = (
        current_user.get("is_superadmin") is True
        or current_user.get("is_superadmin") == 1
        or current_user.get("is_superadmin") == "1"
    )

    async for session in get_db_sqlite():
        # ---- 1. Explicit nav_id — accept only if it belongs to the user ----
        if explicit_nav_id is not None:
            if is_superadmin:
                return explicit_nav_id

            stmt = select(Nav).where(
                Nav.id == explicit_nav_id,
                Nav.user_id == user_id,
                Nav.is_delete == False,
            )
            nav = (await session.execute(stmt)).scalar_one_or_none()
            if nav is not None:
                return nav.id

            # Foreign nav — silently fall through to the user's own nav.

        # ---- 2. Fallback: current user's first nav ----
        stmt = (
            select(Nav)
            .where(Nav.user_id == user_id, Nav.is_delete == False)
            .order_by(Nav.id.asc())
            .limit(1)
        )
        nav = (await session.execute(stmt)).scalar_one_or_none()
        if not nav:
            raise HTTPException(
                status_code=404,
                detail="No nav found for the current user",
            )
        return nav.id

    raise HTTPException(status_code=500, detail="DB error")


# ========================================
# NAV NAME — READ
# ========================================

@router.get("/nav-name")
async def get_nav_name(
    request: Request,
    nav_id: Optional[int] = Query(
        None,
        description="Nav instance ID (optional; defaults to the user's first nav)",
    ),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Read Nav.name of the current (or explicitly selected) nav.

    Used by the "Заголовок" modal in the article catalog: opens
    with the current title prefilled, so the user can edit it in
    place without knowing which nav owns the catalog.

    Any authenticated user with access to the nav. If nav_id does
    not belong to the user, _resolve_nav_id silently falls back to
    the user's own nav.

    Response:
        { "success": true, "data": { "nav_id": 5, "name": "..." } }
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    async for session in get_db_sqlite():
        stmt = select(Nav.name).where(
            Nav.id == resolved_nav_id,
            Nav.is_delete == False,
        )
        name = (await session.execute(stmt)).scalar_one_or_none()

        return JSONResponse({
            "success": True,
            "data": {
                "nav_id": resolved_nav_id,
                "name": name or "",
            },
        })

    raise HTTPException(status_code=500, detail="DB error")


# ========================================
# NAV NAME — WRITE
# ========================================

@router.put("/nav-name")
async def set_nav_name(
    data: CoreEngineLibPagesNavNameSetRequest,
    request: Request,
    nav_id: Optional[int] = Query(
        None,
        description="Nav instance ID (optional; defaults to the user's first nav)",
    ),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Update Nav.name of the current (or explicitly selected) nav.

    Used by the "Заголовок" modal in the article catalog. The new
    name is used as the title of the public /pages catalog.

    Validation:
      - name is stripped of leading/trailing whitespace;
      - empty after stripping → 400 (Pydantic already rejects empty
        strings, but the strip-then-check catches "   " inputs);
      - max length 128 enforced by the Pydantic schema.

    Response:
        { "success": true, "data": { "nav_id": 5, "name": "..." } }
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    new_name = data.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Пустое название")

    async for session in get_db_sqlite():
        stmt = select(Nav).where(
            Nav.id == resolved_nav_id,
            Nav.is_delete == False,
        )
        nav = (await session.execute(stmt)).scalar_one_or_none()
        if not nav:
            raise HTTPException(status_code=404, detail="Nav not found")

        nav.name = new_name
        await session.commit()

        return JSONResponse({
            "success": True,
            "data": {
                "nav_id": resolved_nav_id,
                "name": new_name,
            },
        })

    raise HTTPException(status_code=500, detail="DB error")


# ========================================
# LIST
# ========================================

@router.get("/list")
async def get_pages_list(
    request: Request,
    nav_id: Optional[int] = Query(
        None,
        description="Nav instance ID (optional; defaults to the user's first nav)",
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Page size"),
    is_active: Optional[int] = Query(None, description="Filter: 1 — active, 0 — inactive"),
    is_template: Optional[int] = Query(None, description="Filter: 1 — templates only, 0 — regular only"),
) -> JSONResponse:
    """Get a paginated list of articles. Public endpoint."""
    resolved_nav_id = await _resolve_nav_id(request, nav_id)

    result = await CoreEngineLibPagesService.get_list(
        nav_id=resolved_nav_id,
        page=page,
        limit=limit,
        is_active=is_active,
        is_template=is_template,
    )

    return JSONResponse({
        "success": True,
        "data": result["items"],
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
    })


# ========================================
# MY LIST — для редактора (выбор ссылки)
# ========================================
#
# ВАЖНО: этот роут ДОЛЖЕН быть объявлен ДО /item/{item_id}.
# FastAPI матчит роуты в порядке добавления; иначе /my-list
# будет интерпретирован как item_id="my-list" и упадёт валидация.

@router.get("/my-list")
async def get_my_pages_list(
    request: Request,
    exclude_page_id: Optional[int] = Query(
        None,
        description="Исключить страницу из списка (нельзя ссылаться на себя)",
    ),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Список страниц текущего пользователя — для выбора ссылки
    в редакторе (trait page-link).

    Возвращает только активные, неудалённые, не-шаблонные страницы
    всех nav текущего юзера. Каждая с готовым URL вида
    /page/<nav_id>/<YYYYMMDD>/<HHMMSS>.

    Any authenticated user.
    """
    user_id = current_user.get("id")
    items = await CoreEngineLibPagesService.list_for_user(
        user_id,
        exclude_page_id=exclude_page_id,
    )
    return JSONResponse({
        "success": True,
        "data": items,
    })


# ========================================
# ONE ITEM BY ID
# ========================================

@router.get("/item/{item_id}")
async def get_page_item(
    item_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """Get one article by ID. Public endpoint."""
    resolved_nav_id = await _resolve_nav_id(request, nav_id)

    item = await CoreEngineLibPagesService.get_item(item_id, nav_id=resolved_nav_id)

    if not item:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# ONE ITEM BY DATETIME
# ========================================

@router.get("/bydatetime/{date}/{time}")
async def get_page_by_datetime(
    date: str,
    time: str,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """
    Get one article by date and time.

    Example: /core/engine/lib/pages/bydatetime/20260914/153910

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    Public endpoint.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id)

    item = await CoreEngineLibPagesService.get_by_datetime(
        date, time, nav_id=resolved_nav_id
    )

    if not item:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# CREATE
# ========================================

@router.post("/item")
async def create_page_item(
    data: CoreEngineLibPagesItemCreate,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Create a new article. Any authenticated user.

    Before creating — checks the page limit via BalanceChecked
    (lazy, based on the owner's tariff).

    On limit exceeded → 403 with detail 'pages_exhausted'.
    """
    # get_current_user raises 401 for guests — no extra permission check needed.
    user_id = current_user.get("id")
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    # Pre-check: is the user allowed to create a new page?
    bal, err, current_pages = await BalanceChecked.page_allowed(
        user_id, log=request.app.state.log
    )
    if err:
        raise HTTPException(status_code=403, detail=err)

    item = await CoreEngineLibPagesService.create_item(data, nav_id=resolved_nav_id)

    if not item:
        raise HTTPException(status_code=400, detail="Failed to create article")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# UPDATE
# ========================================

@router.put("/item/{item_id}")
async def update_page_item(
    item_id: int,
    data: CoreEngineLibPagesItemUpdate,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update an article. Any authenticated user."""
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    item = await CoreEngineLibPagesService.update_item(
        item_id, data, nav_id=resolved_nav_id
    )

    if not item:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# DELETE (SOFT)
# ========================================

@router.delete("/item/{item_id}")
async def delete_page_item(
    item_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Soft-delete an article. Any authenticated user."""
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    result = await CoreEngineLibPagesService.delete_item(
        item_id, nav_id=resolved_nav_id
    )

    if not result:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse({
        "success": True,
        "message": "Article deleted",
    })


# ========================================
# RESTORE
# ========================================

@router.post("/item/{item_id}/restore")
async def restore_page_item(
    item_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Restore a soft-deleted article. Any authenticated user."""
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    result = await CoreEngineLibPagesService.restore_item(
        item_id, nav_id=resolved_nav_id
    )

    if not result:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse({
        "success": True,
        "message": "Article restored",
    })