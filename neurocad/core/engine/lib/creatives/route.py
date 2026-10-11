# neurocad/core/engine/lib/creatives/route.py

"""
API endpoints for the creatives module.

Namespace: CoreEngineLibCreativesRouter

Endpoints:
  — public (no auth):
      POST /creatives/hit                    — track a show or click
      GET  /creatives/public/item/{id}       — one creative, public fields only
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
# PUBLIC — one creative
# ============================================

@router.get("/public/item/{creative_id}")
async def get_public_creative(creative_id: int) -> JSONResponse:
    """
    One creative — PUBLIC endpoint, no auth.

    Called by creatives/public/block.js on every public page that
    contains a core-creative block. The block reads its
    data-creative-id and fetches this endpoint to fill itself in.

    WHY PUBLIC
    ----------
    Readers of a public page are not logged in. The block must be
    able to fetch its creative data without a session.

    WHAT IS RETURNED
    ----------------
    Only the fields needed to render the ad block:

        id, text, button_text, target_url, brand, inn, erid, is_active

    NOT returned (internal / admin-only):
        nav_id, description, media_file, created_at, updated_at,
        is_delete.

    is_active is included so the public script can decide whether
    to SHOW or HIDE the block. If is_active == 0 → block hides.
    This is the mechanism that lets the user turn off a creative
    in the admin and have the block disappear everywhere WITHOUT
    re-saving every page.

    NOT FOUND
    ---------
    404 for:
      - a non-existent id;
      - a soft-deleted creative (is_delete = 1).

    The public script treats 404 as "hide the block".

    CACHING
    -------
    Cache-Control: public, max-age=300 — 5 minutes.

    Why 5 minutes:
      - the same creative may appear on many pages, and each page
        load would otherwise hit the database;
      - 5 minutes is a compromise: admin edits become visible on
        the next page load after the cache expires;
      - the browser caches per URL, so a page with 3 blocks with
        3 different creatives makes 3 requests, all cached
        independently.

    If you need "instant" updates, drop the cache header or use
    ETag with updated_at. For now — simple max-age.

    WHY NOT /creatives/item/{id}
    ----------------------------
    /creatives/item/{id} is the ADMIN endpoint — it requires auth
    and returns the full internal payload. We keep them separate
    so an accidental auth bypass cannot leak admin-only fields.
    """
    async for session in get_db_sqlite():
        # Lazy import — avoid a circular dependency in case
        # Creative later imports something from the route module.
        from neurocad.core.models.creative import Creative

        stmt = select(Creative).where(
            Creative.id == creative_id,
            Creative.is_delete == 0,
        )
        creative = (await session.execute(stmt)).scalar_one_or_none()

        if not creative:
            raise HTTPException(status_code=404, detail="Creative not found")

        payload = {
            "id":         creative.id,
            "text":       creative.text,
            "button_text": creative.button_text,
            "target_url": creative.target_url,
            "brand":      creative.brand,
            "inn":        creative.inn,
            "erid":       creative.erid,
            "is_active":  creative.is_active,
        }

        return JSONResponse(
            {"success": True, "data": payload},
            headers={
                # 5 minutes browser cache — see docstring above.
                "Cache-Control": "public, max-age=300",
            },
        )

    raise HTTPException(status_code=500, detail="DB error")


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