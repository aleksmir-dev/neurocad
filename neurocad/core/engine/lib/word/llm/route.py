# neurocad/core/engine/lib/word/llm/route.py

"""
LLM editor API: presets + chat.

Endpoints:
  GET    /core/engine/lib/word/llm/presets                    — list presets
  POST   /core/engine/lib/word/llm/presets                    — create preset
  GET    /core/engine/lib/word/llm/presets/{id}               — get one preset
  PUT    /core/engine/lib/word/llm/presets/{id}               — update preset
  DELETE /core/engine/lib/word/llm/presets/{id}               — soft delete
  POST   /core/engine/lib/word/llm/presets/{id}/restore       — restore
  POST   /core/engine/lib/word/llm/presets/{id}/thumbnail     — upload thumbnail
  DELETE /core/engine/lib/word/llm/presets/{id}/thumbnail     — delete thumbnail

  GET    /core/engine/lib/word/llm/chat/{page_id}/history     — chat history
  POST   /core/engine/lib/word/llm/chat/{page_id}             — send message

All endpoints except GET-list, GET-one and GET-history require superadmin.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .service import LLMService
from .schema import (
    LLMPresetCreate,
    LLMPresetUpdate,
    LLMChatMessageCreate,
)


router = APIRouter(prefix="/llm", tags=["core/engine/lib/word/llm"])


# ============================================
# PRESETS — LIST
# ============================================

@router.get("/presets")
async def list_presets(
    include_deleted: bool = Query(False, description="Include deleted"),
) -> JSONResponse:
    """List presets. Public endpoint."""
    result = await LLMService.list_presets(include_deleted=include_deleted)

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
    item = await LLMService.get_preset(preset_id)

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
    data: LLMPresetCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Create preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    item = await LLMService.create_preset(
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
    data: LLMPresetUpdate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update preset. Superadmin only."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    item = await LLMService.update_preset(
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

    result = await LLMService.delete_preset(preset_id)

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

    result = await LLMService.restore_preset(preset_id)

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
        result = await LLMService.upload_thumbnail(preset_id, file)
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

    result = await LLMService.delete_thumbnail(preset_id)

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
    Chat history for a page. Public endpoint —
    needed to show history when opening the LLM editor.
    """
    messages = await LLMService.load_chat_history(page_id)

    return JSONResponse({
        "success": True,
        "data": messages,
    })


# ============================================
# CHAT — SEND MESSAGE
# ============================================

@router.post("/chat/{page_id}")
async def send_chat_message(
    page_id: int,
    data: LLMChatMessageCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Send a chat message for a page.

    Returns:
      - user_message       — saved user message;
      - assistant_message  — LLM response;
      - html               — new page HTML;
      - css                — new page CSS.

    Superadmin only.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await LLMService.send_chat_message(
        page_id=page_id,
        user_message=data.message,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": result,
    })