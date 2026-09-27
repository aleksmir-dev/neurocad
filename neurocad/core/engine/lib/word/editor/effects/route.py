# neurocad/core/engine/lib/word/editor/effects/route.py

"""
Effects editor API: list, create, read, save, delete effects.

Namespace: CoreEngineLibWordEffectsRoute

Mounted under the parent editor router (prefix="/editor"), so the
final paths are:
  GET    /core/engine/lib/word/editor/effects               — list
  POST   /core/engine/lib/word/editor/effects               — create
  GET    /core/engine/lib/word/editor/effects/<id>.css      — read CSS
  PUT    /core/engine/lib/word/editor/effects/<id>          — save CSS
  DELETE /core/engine/lib/word/editor/effects/<id>          — delete

Permissions:
  All endpoints require an authenticated user (get_current_user).
  Guests get 401 from the dependency.

The list is served from the registry (registry.json in the package
tree, mirrored to static/). The registry is the single source of
truth for labels / hints / icons.

module_name is resolved the same way as in the parent word router:
  1. ?module=<name> query param
  2. Referer: /core/engine/<module>/...
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.module import Module
from sqlalchemy import select

from .schema import (
    CoreEngineLibWordEffectsSaveRequest,
    CoreEngineLibWordEffectsCreateRequest,
)
from .service import CoreEngineLibWordEffectsService


router = APIRouter(
    prefix="/effects",
    tags=["core/engine/lib/word/editor/effects"],
)


# ============================================
# MODULE RESOLUTION
# ============================================
#
# Mirrors the helper in word/route.py. Kept local so this router can
# be mounted independently (and so a rename of the parent helper does
# not silently break this router).

def _module_name(request: Request) -> str:
    module_name = request.query_params.get("module")
    if module_name:
        return module_name

    referer = request.headers.get("referer", "")
    if "/core/engine/" in referer:
        module_name = referer.split("/core/engine/", 1)[1].split("/")[0]
        if module_name:
            return module_name

    raise HTTPException(status_code=400, detail="Module not resolved")


async def _verify_module(request: Request) -> str:
    """
    Resolve module_name and check it exists in the modules table.

    Returns the module_name. Raises 404 if the module is unknown.
    """
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
                detail=f"Module {module_name} not found",
            )
        return module_name

    raise HTTPException(status_code=500, detail="DB error")


# ============================================
# LIST EFFECTS
# ============================================

@router.get("")
async def list_effects(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all effects from the registry.

    Example:
      GET /core/engine/lib/word/editor/effects?module=aleksmir.ru

    Returns entries sorted by `order`, then by `id`. Entries whose
    CSS file is missing on disk are skipped.

    Any authenticated user.
    """
    await _verify_module(request)

    try:
        items = CoreEngineLibWordEffectsService.list_effects()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read effects registry: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": items,
    })


# ============================================
# CREATE EFFECT
# ============================================

@router.post("")
async def create_effect(
    data: CoreEngineLibWordEffectsCreateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Create a new effect.

    Writes the CSS file and appends an entry to the registry, both
    atomically, in package + static trees.

    Example:
      POST /core/engine/lib/word/editor/effects?module=aleksmir.ru
      body: {
        "id": "fx-shimmer-dots",
        "label": "Мерцающие точки",
        "hint": "Мелкие точки с плавным мерцанием",
        "css": ".core-engine-lib-word-blocks .fx-shimmer-dots { ... }",
        "media": "<svg viewBox='0 0 24 24'>...</svg>"
      }

    Returns 409 if the id already exists.

    Any authenticated user.
    """
    module_name = await _verify_module(request)

    try:
        result = CoreEngineLibWordEffectsService.create_effect(
            module_name=module_name,
            effect_id=data.id,
            label=data.label,
            hint=data.hint,
            css=data.css,
            media=data.media,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create effect: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# GET ONE EFFECT CSS
# ============================================

@router.get("/{effect_id}.css")
async def get_effect_css(
    effect_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return the CSS of a single effect.

    Example:
      GET /core/engine/lib/word/editor/effects/fx-shadow-top-n.css?module=aleksmir.ru

    Any authenticated user.
    """
    module_name = await _verify_module(request)

    try:
        css = CoreEngineLibWordEffectsService.read_effect(module_name, effect_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read effect: {e}",
        )

    if css is None:
        raise HTTPException(
            status_code=404,
            detail=f"Effect {effect_id} not found",
        )

    return JSONResponse({
        "success": True,
        "data": {
            "effect_id": effect_id,
            "css": css,
        },
    })


# ============================================
# PUT ONE EFFECT CSS
# ============================================

@router.put("/{effect_id}")
async def save_effect_css(
    effect_id: str,
    data: CoreEngineLibWordEffectsSaveRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save the CSS of a single effect.

    Writes to BOTH the model tree and the static tree, atomically
    (tmp + os.replace). The mirror under static/ is what nginx serves.

    Example:
      PUT /core/engine/lib/word/editor/effects/fx-shadow-top-n?module=aleksmir.ru
      body: {"css": ".core-engine-lib-word-blocks .fx-shadow-top-n { ... }"}

    Any authenticated user.
    """
    module_name = await _verify_module(request)

    try:
        result = CoreEngineLibWordEffectsService.save_effect(
            module_name=module_name,
            effect_id=effect_id,
            css=data.css,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save effect: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# DELETE ONE EFFECT
# ============================================

@router.delete("/{effect_id}")
async def delete_effect(
    effect_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete a custom effect.

    Built-in effects (builtin=true in the registry) cannot be deleted
    — the server returns 400.

    Removes the CSS file from package + static trees and removes the
    registry entry from both.

    Example:
      DELETE /core/engine/lib/word/editor/effects/fx-shimmer-dots?module=aleksmir.ru

    Any authenticated user.
    """
    module_name = await _verify_module(request)

    try:
        result = CoreEngineLibWordEffectsService.delete_effect(
            module_name=module_name,
            effect_id=effect_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete effect: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })