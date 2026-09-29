# neurocad/core/engine/lib/balance/qr/route.py

"""
QR-code routes (admin balance, superadmin-only).

Endpoints (mounted under /core/engine/lib/balance/qr):
    GET    /status   — есть ли QR, URL, nav_id
    POST   /upload   — загрузить PNG (только PNG, magic bytes)
    DELETE /        — удалить QR

Full URLs (with parent prefixes /core/engine/lib):
    GET    /core/engine/lib/balance/qr/status
    POST   /core/engine/lib/balance/qr/upload
    DELETE /core/engine/lib/balance/qr

Scoping:
    Each endpoint takes an optional ?nav_id=<id>. If not given, the
    backend resolves the current user's first nav (ORDER BY id ASC),
    same rule as lib/base/assets.

Permissions:
    All endpoints require superadmin (_require_superadmin).

Namespace: CoreEngineLibBalanceQr*
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from .service import CoreEngineLibBalanceQrService


router = APIRouter(prefix="/qr", tags=["core/engine/lib/balance/qr"])


# ============================================
# AUTH GUARD
# ============================================

def _require_superadmin(current_user: dict) -> None:
    """Raise 403 if the current user is not a superadmin."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")


# ============================================
# NAV RESOLUTION
# ============================================

async def _resolve_nav_id(
    explicit_nav_id: Optional[int],
    current_user: dict,
) -> int:
    """
    Resolve the nav instance for the current request.

    Priority:
      1. Explicit nav_id (from query) — used as-is.
      2. First nav of the current user (ORDER BY id ASC, is_delete=0).

    Raises:
        401 if the user is not authenticated.
        404 if the user has no nav at all.
    """
    if explicit_nav_id is not None:
        return explicit_nav_id

    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async for session in get_db_sqlite():
        stmt = (
            select(Nav)
            .where(Nav.user_id == user_id, Nav.is_delete.is_(False))
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


# ============================================
# STATUS
# ============================================

@router.get("/status")
async def get_qr_status(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Check whether the QR exists for the given nav.

    Returns:
        { success: true, exists: bool, url: str|null, nav_id: int }

    Superadmin only.
    """
    _require_superadmin(current_user)

    resolved_nav_id = await _resolve_nav_id(nav_id, current_user)

    result = await CoreEngineLibBalanceQrService.get_status(resolved_nav_id)

    return JSONResponse(result.model_dump(mode="json"))


# ============================================
# UPLOAD
# ============================================

@router.post("/upload")
async def upload_qr(
    request: Request,
    file: UploadFile = File(..., description="PNG-файл с QR-кодом"),
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Upload the QR PNG for the given nav.

    Accepts multipart/form-data with a single `file` field.
    Validates magic bytes — must be a real PNG.

    Response:
        { success: true, url: "/media/<nav_id>/qr.png", nav_id: <id> }

    Superadmin only.
    """
    _require_superadmin(current_user)

    resolved_nav_id = await _resolve_nav_id(nav_id, current_user)

    result = await CoreEngineLibBalanceQrService.save_qr(
        nav_id=resolved_nav_id,
        file=file,
        log=request.app.state.log,
    )

    return JSONResponse(result.model_dump(mode="json"))


# ============================================
# DELETE
# ============================================

@router.delete("")
async def delete_qr(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete the QR for the given nav (idempotent).

    Response:
        { success: true, deleted: bool, nav_id: <id> }

    Superadmin only.
    """
    _require_superadmin(current_user)

    resolved_nav_id = await _resolve_nav_id(nav_id, current_user)

    result = await CoreEngineLibBalanceQrService.delete_qr(
        nav_id=resolved_nav_id,
        log=request.app.state.log,
    )

    return JSONResponse(result.model_dump(mode="json"))