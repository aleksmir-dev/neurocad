# neurocad/core/engine/lib/base/assets/schema.py

"""
Pydantic schemas for the base media library.

Media is stored and served under media/<nav_id>/, where nav_id is
the nav instance that owns the pages (see word/service.py).

Namespace: CoreEngineLibBaseAssets*

Endpoints:
    GET    /core/engine/lib/base/assets            — list assets
    POST   /core/engine/lib/base/assets/upload     — upload files
    DELETE /core/engine/lib/base/assets/{name}     — delete file
"""

from typing import List, Optional
from pydantic import BaseModel, Field


# ============================================
# ONE ASSET
# ============================================

class CoreEngineLibBaseAssetsItem(BaseModel):
    """One asset (image) in the media library."""
    src: str = Field(..., description="Image URL (/media/<nav_id>/<file>)")
    name: str = Field(..., description="File name")
    type: str = Field("image", description="Asset type")


# ============================================
# LIST
# ============================================

class CoreEngineLibBaseAssetsListResponse(BaseModel):
    """Response with the list of assets."""
    success: bool = True
    data: List[CoreEngineLibBaseAssetsItem]


# ============================================
# UPLOAD
# ============================================

class CoreEngineLibBaseAssetsUploadResponse(BaseModel):
    """
    Response after uploading files.

    data — list of dicts with src + name for each uploaded file.
    """
    success: bool = True
    data: List[CoreEngineLibBaseAssetsItem]


# ============================================
# DELETE
# ============================================

class CoreEngineLibBaseAssetsDeleteResponse(BaseModel):
    """Response after deleting a file."""
    success: bool = True
    data: dict = Field(default_factory=dict, description="Deletion details")