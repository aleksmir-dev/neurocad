# neurocad/core/engine/lib/word/editor/images/route.py

"""
Images editor API: list, create, read, delete.

Namespace: CoreEngineLibWordImagesRoute

Mounted under the parent editor router (prefix="/editor"), so the
final paths are:
  GET    /core/engine/lib/word/editor/images             — list
  POST   /core/engine/lib/word/editor/images             — create
  GET    /core/engine/lib/word/editor/images/<id>        — read metadata
  DELETE /core/engine/lib/word/editor/images/<id>        — delete

All endpoints require superadmin.

The list is served from the registry (registry.json in the package
tree, mirrored to static/). The registry is the single source of
truth for alt text and file paths.

module_name is resolved the same way as in the effects router.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.module import Module
from sqlalchemy import select

from .schema import (
    CoreEngineLibWordImagesCreateRequest,
)
from .service import CoreEngineLibWordImagesService


router = APIRouter(
    prefix="/images",
    tags=["core/engine/lib/word/editor/images"],
)


# ============================================
# MODULE RESOLUTION
# ============================================
#
# Same as in the effects router. Kept local for the same reasons.

def _module_name(request: Request) -> str:
    module_name = request.query_params.get("module")
    if module_name:
        return module_name

    referer = request.headers.get("referer", "")
    if "/core/engine/" in referer:
        module_name = referer.split("/core/engine/", 1)[1].split("/")[0]
        if module_name:
            return module_name

    raise HTTPException(status_code=400, detail="Модуль не определён")


async def _verify_module(request: Request) -> str:
    module_name = _module_name(request)

    async for session in get_db_sqlite():
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()

        if not module:
            raise HTTPException(
                status_code=404,
                detail=f"Модуль {module_name} не найден",
            )
        return module_name

    raise HTTPException(status_code=500, detail="DB error")


# ============================================
# LIST IMAGES
# ============================================

@router.get("")
async def list_images(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all images from the registry.

    Example:
      GET /core/engine/lib/word/editor/images?module=aleksmir.ru

    Returns entries sorted by `order`, then by `id`. Entries whose
    SVG file is missing on disk are skipped.

    Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    await _verify_module(request)

    try:
        items = CoreEngineLibWordImagesService.list_images()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка чтения реестра изображений: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": items,
    })


# ============================================
# CREATE IMAGE
# ============================================

@router.post("")
async def create_image(
    data: CoreEngineLibWordImagesCreateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Create a new image from a complete <svg>...</svg> string.

    Writes files/<id>.svg and appends an entry to the registry, both
    atomically, in package + static trees.

    Example:
      POST /core/engine/lib/word/editor/images?module=aleksmir.ru
      body: {
        "svg": "<svg viewBox='0 0 800 600'>...</svg>",
        "alt": "Родовое поместье на закате",
        "source": "llm"
      }

    Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    await _verify_module(request)

    try:
        result = CoreEngineLibWordImagesService.create_image(
            svg=data.svg,
            alt=data.alt,
            source=data.source,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка создания изображения: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# GET ONE IMAGE (metadata)
# ============================================

@router.get("/{image_id}")
async def get_image(
    image_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return the registry entry for a single image.

    Example:
      GET /core/engine/lib/word/editor/images/img-a1b2c3d4?module=aleksmir.ru

    Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    await _verify_module(request)

    item = CoreEngineLibWordImagesService.read_image(image_id)
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Изображение {image_id} не найдено",
        )

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# DELETE ONE IMAGE
# ============================================

@router.delete("/{image_id}")
async def delete_image(
    image_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete an image.

    Removes the SVG file from package + static trees and removes the
    registry entry from both.

    Example:
      DELETE /core/engine/lib/word/editor/images/img-a1b2c3d4?module=aleksmir.ru

    Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    await _verify_module(request)

    try:
        result = CoreEngineLibWordImagesService.delete_image(image_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка удаления изображения: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })