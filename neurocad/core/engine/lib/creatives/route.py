# neurocad/core/engine/lib/creatives/route.py

"""
API endpoints for the creatives module.

Namespace: CoreEngineLibCreativesRouter

Endpoints:
  — public (no auth):
      POST /creatives/hit              — track a show or click
  — admin (auth required):
      GET    /creatives/list                — all creatives of the nav
      POST   /creatives/item                — create a creative
      PUT    /creatives/item/{id}           — update a creative
      DELETE /creatives/item/{id}           — soft-delete a creative
      GET    /creatives/placements          — all placements of the nav
      POST   /creatives/placement           — create a placement
      PUT    /creatives/placement/{id}      — update a placement
      DELETE /creatives/placement/{id}      — soft-delete a placement
      GET    /creatives/stats               — report for a period
      PUT    /creatives/stats/target        — manual input of target actions

The /creatives prefix is added by this router itself; the parent
router (utils/routes.py) just includes it.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite

from .service import CoreEngineLibCreativesService
from .schema import (
    CreativeCreate,
    CreativeUpdate,
    PlacementCreate,
    PlacementUpdate,
    HitRequest,
    TargetActionsRequest,
)


router = APIRouter(prefix="/creatives", tags=["core/engine/lib/creatives"])


# ============================================
# NAV RESOLUTION (same pattern as pages/route.py)
# ============================================

async def _resolve_nav_id(
    request: Request,
    explicit_nav_id: Optional[int],
    current_user: Optional[dict] = None,
) -> int:
    """
    Resolve the nav_id for the request.

    Same logic as pages/route.py:
      1. explicit nav_id — used only if it belongs to the current
         user (or the user is a superadmin);
      2. otherwise — the user's first nav.
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

        # ---- 2. Fallback: user's first nav ----
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
                detail="Не найден каталог пользователя",
            )
        return nav.id

    raise HTTPException(status_code=500, detail="Ошибка базы данных")


# ============================================
# HIT — tracking (public, no auth)
# ============================================

@router.post("/hit")
async def register_hit(data: HitRequest) -> JSONResponse:
    """
    Register a show or a click.

    Public endpoint — called by a JS script from the page.
    No auth: the script does not know who the user is. The check
    is done at the placement level — exists / not deleted.

    Idempotency is not guaranteed: two POSTs → two hits.
    If unique counting is needed — the frontend should set a cookie.
    """
    ok = await CoreEngineLibCreativesService.register_hit(
        placement_id=data.placement_id,
        hit_type=data.hit_type,
    )
    if not ok:
        raise HTTPException(
            status_code=404,
            detail="Размещение не найдено",
        )
    return JSONResponse({"success": True})


# ============================================
# CREATIVES — CRUD
# ============================================

@router.get("/list")
async def list_creatives(
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """All active creatives of the nav."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    items = await CoreEngineLibCreativesService.list_creatives(resolved)
    return JSONResponse({"success": True, "data": items})


@router.post("/item")
async def create_creative(
    data: CreativeCreate,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Create a creative."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    item = await CoreEngineLibCreativesService.create_creative(
        resolved, data.model_dump()
    )
    if not item:
        raise HTTPException(
            status_code=400,
            detail="Не удалось создать креатив",
        )
    return JSONResponse({"success": True, "data": item})


@router.put("/item/{item_id}")
async def update_creative(
    item_id: int,
    data: CreativeUpdate,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update a creative."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    item = await CoreEngineLibCreativesService.update_creative(
        item_id, resolved, data.model_dump(exclude_unset=True)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Креатив не найден")
    return JSONResponse({"success": True, "data": item})


@router.delete("/item/{item_id}")
async def delete_creative(
    item_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Soft-delete a creative."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    ok = await CoreEngineLibCreativesService.delete_creative(item_id, resolved)
    if not ok:
        raise HTTPException(status_code=404, detail="Креатив не найден")
    return JSONResponse({"success": True, "message": "Креатив удалён"})


# ============================================
# PLACEMENTS — CRUD
# ============================================

@router.get("/placements")
async def list_placements(
    request: Request,
    nav_id: Optional[int] = Query(None),
    creative_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """All placements of the nav (optionally for one creative)."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    items = await CoreEngineLibCreativesService.list_placements(
        resolved, creative_id=creative_id
    )
    return JSONResponse({"success": True, "data": items})


@router.post("/placement")
async def create_placement(
    data: PlacementCreate,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Create a placement."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    item = await CoreEngineLibCreativesService.create_placement(
        resolved, data.model_dump()
    )
    if not item:
        raise HTTPException(
            status_code=400,
            detail="Не удалось создать размещение: креатив или страница не найдены",
        )
    return JSONResponse({"success": True, "data": item})


@router.put("/placement/{placement_id}")
async def update_placement(
    placement_id: int,
    data: PlacementUpdate,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update a placement."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    item = await CoreEngineLibCreativesService.update_placement(
        placement_id, resolved, data.model_dump(exclude_unset=True)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Размещение не найдено")
    return JSONResponse({"success": True, "data": item})


@router.delete("/placement/{placement_id}")
async def delete_placement(
    placement_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Soft-delete a placement."""
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    ok = await CoreEngineLibCreativesService.delete_placement(
        placement_id, resolved
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Размещение не найдено")
    return JSONResponse({"success": True, "message": "Размещение удалено"})


# ============================================
# STATS — report
# ============================================

@router.get("/stats")
async def get_stats(
    request: Request,
    nav_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Report over placements for a period.

    date_from / date_to — inclusive.
    Defaults to the current month (from the 1st to today).
    """
    resolved = await _resolve_nav_id(request, nav_id, current_user)

    if date_from is None:
        today = date.today()
        date_from = today.replace(day=1)
    if date_to is None:
        date_to = date.today()

    items = await CoreEngineLibCreativesService.get_stats(
        resolved, date_from=date_from, date_to=date_to
    )
    return JSONResponse({
        "success": True,
        "data": items,
        "total": len(items),
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
    })


@router.put("/stats/target")
async def set_target_actions(
    data: TargetActionsRequest,
    request: Request,
    nav_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Manual input of target actions for a specific day.

    One PlacementStat row = one day of one placement.
    If it does not exist — it is created.
    """
    resolved = await _resolve_nav_id(request, nav_id, current_user)
    ok = await CoreEngineLibCreativesService.set_target_actions(
        placement_id=data.placement_id,
        nav_id=resolved,
        on_date=data.date,
        count=data.count,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Размещение не найдено")
    return JSONResponse({"success": True})