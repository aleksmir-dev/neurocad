# neurocad/core/engine/lib/base/assets/route.py

"""
Media library routes (base component).

Endpoints:
    GET    /core/engine/lib/base/assets              — list assets
    POST   /core/engine/lib/base/assets/upload       — upload files
    DELETE /core/engine/lib/base/assets/{filename}   — delete file

All endpoints:
  - resolve the current module via ?module=<name> or Referer
  - require superadmin (get_current_user -> is_superadmin)

Storage: media/<mod_id>/ (see service.py).

Namespace: CoreEngineLibBaseAssets*
"""

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from typing import List

from neurocad.core.auth.dependencies import get_current_user
from ..module.service import resolve_module_id
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


async def _require_superadmin(request: Request) -> dict:
    """
    Resolve current user and require superadmin.

    Raises HTTPException(403) if the user is not a superadmin.
    """
    current_user = await get_current_user(request)
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return current_user


# ============================================
# LIST ASSETS
# ============================================

@router.get("")
async def list_assets(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all images from media/<mod_id>/.

    Example: /core/engine/lib/base/assets?module=aleksmir.ru
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    mod_id = await resolve_module_id(request)
    assets = await CoreEngineLibBaseAssetsService.list_assets(mod_id)

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
) -> JSONResponse:
    """
    Upload images to media/<mod_id>/.

    Notes:
      - Read form ONCE (Starlette does not allow re-reading).
      - Detect UploadFile by duck-typing.
      - Accept any field name: 'files', 'files[]', 'file', 'upload'.
      - Authorization — manually via get_current_user(request).

    Example: /core/engine/lib/base/assets/upload?module=aleksmir.ru
    """
    # ===== READ FORM ONCE =====
    form = await request.form()

    # ===== COLLECT FILES =====
    all_files: List[UploadFile] = []
    for key, value in form.multi_items():
        if _is_upload_file(value):
            all_files.append(value)

    # ===== AUTHORIZATION =====
    await _require_superadmin(request)

    if not all_files:
        raise HTTPException(status_code=400, detail="Файлы не переданы")

    mod_id = await resolve_module_id(request)

    try:
        uploaded = await CoreEngineLibBaseAssetsService.upload_assets(
            all_files, mod_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")

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
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete a single file from media/<mod_id>/.

    Path traversal protection is inside the service.

    Example: /core/engine/lib/base/assets/photo_a1b2c3d4.png?module=aleksmir.ru
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    mod_id = await resolve_module_id(request)
    deleted = await CoreEngineLibBaseAssetsService.delete_asset(filename, mod_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Файл {filename} не найден",
        )

    return JSONResponse({
        "success": True,
        "data": {"filename": filename, "deleted": True},
    })