# neurocad/core/engine/lib/base/assets/route.py

"""
Media library routes (base component).

Endpoints:
    GET    /core/engine/lib/base/assets              — list assets
    POST   /core/engine/lib/base/assets/upload       — upload files
    DELETE /core/engine/lib/base/assets/{filename}   — delete file

Scoping:
    Each endpoint resolves a nav instance. If ?nav_id=<id> is given,
    it is used as-is; otherwise the backend falls back to the current
    user's first nav (by id ASC). Storage lives under media/<nav_id>/
    (see service.py).

Permissions:
    All endpoints require an authenticated user (get_current_user).
    Guests get 401 from the dependency.

Errors:
    Upload may return HTTP 403 with detail 'mb_exhausted' if the
    user would exceed their storage limit. HTTPException from the
    service is passed through — not wrapped into a 500.

Namespace: CoreEngineLibBaseAssets*
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from typing import List, Optional

from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from .service import CoreEngineLibBaseAssetsService


router = APIRouter(prefix="/assets", tags=["core/engine/lib/base/assets"])


# ============================================
# HELPERS
# ============================================

def _is_upload_file(obj) -> bool:
    """
    Detect UploadFile without isinstance().

    UploadFile classes differ across Starlette / FastAPI versions,
    so we use duck typing instead: filename + read + content_type.
    """
    return (
        hasattr(obj, "filename")
        and hasattr(obj, "read")
        and hasattr(obj, "content_type")
        and callable(getattr(obj, "read", None))
    )


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


# ============================================
# LIST ASSETS
# ============================================

@router.get("")
async def list_assets(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all images from media/<nav_id>/.

    Example: /core/engine/lib/base/assets?nav_id=2

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    assets = await CoreEngineLibBaseAssetsService.list_assets(resolved_nav_id)

    return JSONResponse({
        "success": True,
        "data": assets,
    })


# ============================================
# UPLOAD ASSETS
# ============================================

@router.post("/upload")
async def upload_assets(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """
    Upload images to media/<nav_id>/.

    Notes:
      - Read form ONCE (Starlette does not allow re-reading).
      - Detect UploadFile by duck-typing.
      - Accept any field name: 'files', 'files[]', 'file', 'upload'.
      - Authorization — manually via get_current_user(request).

    On storage limit exceeded — returns 403 with detail 'mb_exhausted'.
    HTTPException from the service is passed through — not wrapped.

    Example: /core/engine/lib/base/assets/upload?nav_id=2

    Any authenticated user.
    """
    # ===== READ FORM ONCE =====
    form = await request.form()

    # ===== COLLECT FILES =====
    all_files: List[UploadFile] = []
    for key, value in form.multi_items():
        if _is_upload_file(value):
            all_files.append(value)

    # ===== AUTHORIZATION =====
    current_user = await get_current_user(request)
    if not current_user or not current_user.get("id"):
        raise HTTPException(status_code=401, detail="Not authenticated")

    # ===== RESOLVE NAV =====
    resolved_nav_id = await _resolve_nav_id(
        request, nav_id, current_user=current_user
    )

    if not all_files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        uploaded = await CoreEngineLibBaseAssetsService.upload_assets(
            all_files,
            resolved_nav_id,
            log=request.app.state.log,
        )
    except HTTPException:
        # Tariff / storage checks inside the service already raised
        # a proper HTTPException (403 mb_exhausted, 400, etc.) —
        # pass it through unchanged.
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

    return JSONResponse({
        "success": True,
        "data": uploaded,
    })


# ============================================
# DELETE ASSET
# ============================================

@router.delete("/{filename}")
async def delete_asset(
    filename: str,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete a single file from media/<nav_id>/.

    Path traversal protection is inside the service.
    After deletion — decrements the user's Balance.mb.

    Example: /core/engine/lib/base/assets/photo_a1b2c3d4.png?nav_id=2

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    deleted = await CoreEngineLibBaseAssetsService.delete_asset(
        filename,
        resolved_nav_id,
        log=request.app.state.log,
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"File {filename} not found",
        )

    return JSONResponse({
        "success": True,
        "data": {"filename": filename, "deleted": True},
    })