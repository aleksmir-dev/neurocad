# neurocad/core/engine/lib/word/llm/route.py

"""
LLM editor API: presets + chat history + chat stream.

Namespace: CoreEngineLibWordLlmRoute

HTTP endpoints:
  GET    /core/engine/lib/word/llm/presets                    — list presets
  POST   /core/engine/lib/word/llm/presets                    — create preset
  GET    /core/engine/lib/word/llm/presets/{id}               — get one preset
  PUT    /core/engine/lib/word/llm/presets/{id}               — update preset
  DELETE /core/engine/lib/word/llm/presets/{id}               — soft delete
  POST   /core/engine/lib/word/llm/presets/{id}/restore       — restore
  POST   /core/engine/lib/word/llm/presets/{id}/thumbnail     — upload thumbnail
  DELETE /core/engine/lib/word/llm/presets/{id}/thumbnail     — delete thumbnail

  GET    /core/engine/lib/word/llm/chat/{page_id}/history     — chat history
  DELETE /core/engine/lib/word/llm/chat/{page_id}/history     — clear history
  GET    /core/engine/lib/word/llm/chat/{page_id}/run/active  — active run

WebSocket:
  WS     /core/engine/lib/word/llm/ws/{page_id}               — chat stream

Note: sending a chat message is done via the WebSocket only.
The old HTTP endpoint POST /chat/{page_id} was removed — it did
the whole plan → fill → effects flow, which is now handled by the
agent dispatcher in ws.py.

All HTTP endpoints except GET-list, GET-one and GET-history require
superadmin. The WebSocket endpoint also requires superadmin (checked
inside the handler).
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user

from .service import CoreEngineLibWordLlmService
from .runs import CoreEngineLibWordLlmRuns
from .schema import (
    CoreEngineLibWordLlmPresetCreate,
    CoreEngineLibWordLlmPresetUpdate,
)
from .ws import CoreEngineLibWordLlmWS


router = APIRouter(prefix="/llm", tags=["core/engine/lib/word/llm"])


# ============================================
# PRESETS — LIST
# ============================================

@router.get("/presets")
async def list_presets(
    include_deleted: bool = Query(False, description="Include deleted"),
) -> JSONResponse:
    """List presets. Public endpoint."""
    result = await CoreEngineLibWordLlmService.list_presets(include_deleted=include_deleted)

    return JSONResponse({
        "success": True,
        "data": result["items"],
        "total": result["total"],
    })


# ============================================
# PRESETS — GET ONE
# ============================================

@router.get("/presets/{preset_id}")
async def get_preset(preset_id: int) -> JSONResponse:
    """Get one preset by ID. Public endpoint."""
    item = await CoreEngineLibWordLlmService.get_preset(preset_id)

    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# PRESETS — CREATE
# ============================================

@router.post("/presets")
async def create_preset(
    data: CoreEngineLibWordLlmPresetCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Create preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    item = await CoreEngineLibWordLlmService.create_preset(
        name=data.name,
        description=data.description,
        html=data.html,
        css=data.css,
    )

    if not item:
        raise HTTPException(status_code=400, detail="Failed to create preset")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# PRESETS — UPDATE
# ============================================

@router.put("/presets/{preset_id}")
async def update_preset(
    preset_id: int,
    data: CoreEngineLibWordLlmPresetUpdate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    item = await CoreEngineLibWordLlmService.update_preset(
        preset_id=preset_id,
        name=data.name,
        description=data.description,
        html=data.html,
        css=data.css,
    )

    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# PRESETS — SOFT DELETE
# ============================================

@router.delete("/presets/{preset_id}")
async def delete_preset(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Soft delete preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await CoreEngineLibWordLlmService.delete_preset(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "message": "Preset deleted",
    })


# ============================================
# PRESETS — RESTORE
# ============================================

@router.post("/presets/{preset_id}/restore")
async def restore_preset(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Restore deleted preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await CoreEngineLibWordLlmService.restore_preset(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "message": "Preset restored",
    })


# ============================================
# PRESETS — UPLOAD THUMBNAIL
# ============================================

@router.post("/presets/{preset_id}/thumbnail")
async def upload_thumbnail(
    preset_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Upload PNG thumbnail for preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        result = await CoreEngineLibWordLlmService.upload_thumbnail(preset_id, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

    if not result:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# PRESETS — DELETE THUMBNAIL
# ============================================

@router.delete("/presets/{preset_id}/thumbnail")
async def delete_thumbnail(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Delete preset thumbnail. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await CoreEngineLibWordLlmService.delete_thumbnail(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Preset not found")

    return JSONResponse({
        "success": True,
        "message": "Thumbnail deleted",
    })


# ============================================
# CHAT — HISTORY
# ============================================

@router.get("/chat/{page_id}/history")
async def get_chat_history(page_id: int) -> JSONResponse:
    """
    Chat history for a page. Public endpoint — needed to show history
    when opening the LLM editor.
    """
    messages = await CoreEngineLibWordLlmService.load_chat_history(page_id)

    return JSONResponse({
        "success": True,
        "data": messages,
    })


# ============================================
# CHAT — CLEAR HISTORY
# ============================================

@router.delete("/chat/{page_id}/history")
async def clear_chat_history(
    page_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Clear chat history for a page.

    Deletes all rows from page_chat for this page. Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    deleted = await CoreEngineLibWordLlmService.clear_chat_history(page_id)

    return JSONResponse({
        "success": True,
        "deleted": deleted,
    })


# ============================================
# CHAT — ACTIVE RUN
# ============================================

@router.get("/chat/{page_id}/run/active")
async def get_active_run(page_id: int) -> JSONResponse:
    """
    Return the latest unfinished run for a page, or null.

    Used by the frontend after a WebSocket reconnect: if a run is
    still active, the client shows a progress bubble and waits for
    it to finish (or cancels it).

    Public endpoint — same as chat history. The run belongs to the
    page, not to a specific user.
    """
    run = await CoreEngineLibWordLlmRuns.get_active_run_for_page(page_id)

    return JSONResponse({
        "success": True,
        "data": run,
    })


# ============================================
# WEBSOCKET — CHAT STREAM
# ============================================
#
# Mounted on the same router, so the final path is:
#   /core/engine/lib/word/llm/ws/{page_id}

router.add_api_websocket_route("/ws/{page_id}", CoreEngineLibWordLlmWS.llm_ws_endpoint)