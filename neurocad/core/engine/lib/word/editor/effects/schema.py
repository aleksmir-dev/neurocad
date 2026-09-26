# neurocad/core/engine/lib/word/editor/effects/schema.py

"""
Pydantic schemas for the effects editor API.

Namespace: CoreEngineLibWordEffects*

Endpoints:
  GET    /effects                — list all effects (list response)
  POST   /effects                — create a new effect (create request)
  GET    /effects/<id>.css       — read one effect CSS
  PUT    /effects/<id>           — save one effect CSS
  DELETE /effects/<id>           — delete one effect (custom only)
"""

from typing import List, Optional
from pydantic import BaseModel, Field


# ============================================
# SAVE EFFECT CSS (PUT /effects/<id>)
# ============================================

class CoreEngineLibWordEffectsSaveRequest(BaseModel):
    """Request body for PUT /effects/<effect_id>."""
    css: str = Field(
        ...,
        min_length=1,
        description="Full CSS of the effect (one file).",
    )


class CoreEngineLibWordEffectsSaveResponse(BaseModel):
    """Response for PUT /effects/<effect_id>."""
    success: bool = True
    data: dict  # {"effect_id": "fx-shadow-top-n", "bytes": 1234}


# ============================================
# GET EFFECT CSS (GET /effects/<id>.css)
# ============================================

class CoreEngineLibWordEffectsGetResponse(BaseModel):
    """Response for GET /effects/<effect_id>.css."""
    success: bool = True
    data: dict  # {"effect_id": "...", "css": "..."}


# ============================================
# LIST EFFECTS (GET /effects)
# ============================================

class CoreEngineLibWordEffectsItem(BaseModel):
    """
    One effect in the registry.

    `media` is an inline SVG string — the palette renders it directly,
    no separate icon files needed.

    `builtin` is True for effects shipped with the editor (cannot be
    deleted via the API), False for user-created effects.

    `order` is a sort key (lower = earlier in the palette).
    """
    id: str
    label: str
    hint: str = ""
    file: str
    media: str = ""
    builtin: bool = False
    order: int = 100


class CoreEngineLibWordEffectsListResponse(BaseModel):
    """Response for GET /effects."""
    success: bool = True
    data: List[CoreEngineLibWordEffectsItem]


# ============================================
# CREATE EFFECT (POST /effects)
# ============================================

class CoreEngineLibWordEffectsCreateRequest(BaseModel):
    """
    Request body for POST /effects.

    `id` is validated server-side against ^fx-[a-z0-9][a-z0-9-]{0,63}$.
    If the id already exists, the server returns 409.

    `css` must contain the outer selector
        .core-engine-lib-word-blocks .<id>
    — the server does not enforce this, but the LLM prompt does, and
    the frontend live-preview relies on it.

    `media` is an inline SVG string. Optional — if empty, the frontend
    falls back to a generic icon.
    """
    id: str = Field(
        ...,
        min_length=4,
        max_length=64,
        description="CSS class name, e.g. 'fx-shimmer-dots'.",
    )
    label: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Human-readable name (Russian).",
    )
    hint: str = Field(
        "",
        max_length=200,
        description="One-line description (tooltip).",
    )
    css: str = Field(
        ...,
        min_length=1,
        description="Full CSS of the effect.",
    )
    media: str = Field(
        "",
        description="Inline SVG icon markup (optional).",
    )


class CoreEngineLibWordEffectsCreateResponse(BaseModel):
    """Response for POST /effects."""
    success: bool = True
    data: dict
    # {"effect_id": "fx-shimmer-dots", "file": "fx/fx-shimmer-dots.css", "bytes": 987}


# ============================================
# DELETE EFFECT (DELETE /effects/<id>)
# ============================================

class CoreEngineLibWordEffectsDeleteResponse(BaseModel):
    """Response for DELETE /effects/<effect_id>."""
    success: bool = True
    data: dict
    # {"effect_id": "fx-shimmer-dots", "deleted_files": 2}