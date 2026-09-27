# app/core/engine/lib/pages/route.py

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from typing import Optional

from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from .service import CoreEngineLibPagesService
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
)

router = APIRouter(prefix="/pages", tags=["core/engine/lib/pages"])


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
      1. Explicit nav_id (from query / path) — used as-is.
      2. First nav of the current user (ORDER BY id ASC, is_delete=0).

    Raises:
        401 if there is no authenticated user and no explicit nav_id.
        404 if the current user has no nav at all.
    """
    if explicit_nav_id is not None:
        return explicit_nav_id

    # Use the already-resolved user when the endpoint depends on it;
    # otherwise, resolve from the request.
    if current_user is None:
        current_user = await get_current_user(request)

    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async for session in get_db_sqlite():
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
    """Create a new article. Any authenticated user."""
    # get_current_user raises 401 for guests — no extra permission check needed.
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

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