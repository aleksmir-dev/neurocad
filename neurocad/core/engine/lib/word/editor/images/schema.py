# neurocad/core/engine/lib/word/editor/images/schema.py

"""
Pydantic schemas for the images editor API.

Namespace: CoreEngineLibWordImages*

Endpoints:
  GET    /images                — list all images (list response)
  GET    /images/<id>           — read one image's metadata
  POST   /images                — create a new image
  DELETE /images/<id>           — delete an image
"""

from typing import List
from pydantic import BaseModel, Field


# ============================================
# LIST IMAGES (GET /images)
# ============================================

class CoreEngineLibWordImagesItem(BaseModel):
    """
    One image in the registry.

    `file` is a path relative to editor/images/ — e.g.
    'files/img-a1b2c3d4.svg'. The frontend builds the full URL from
    /static/core/engine/lib/word/editor/images/<file>.

    `source` is 'llm' or 'user'.
    """
    id: str
    alt: str = ""
    file: str
    source: str = "llm"
    builtin: bool = False
    order: int = 100


class CoreEngineLibWordImagesListResponse(BaseModel):
    """Response for GET /images."""
    success: bool = True
    data: List[CoreEngineLibWordImagesItem]


# ============================================
# CREATE IMAGE (POST /images)
# ============================================

class CoreEngineLibWordImagesCreateRequest(BaseModel):
    """
    Request body for POST /images.

    `svg` must be a complete <svg>...</svg> markup. The server:
      - validates it (no <script>, no event handlers, no external href);
      - generates an id (img-<8 hex>);
      - writes files/<id>.svg into both package and static trees;
      - appends an entry to the registry in both trees.
    """
    svg: str = Field(
        ...,
        min_length=10,
        description="Complete <svg>...</svg> markup.",
    )
    alt: str = Field(
        "",
        max_length=200,
        description="Alternative text / human description.",
    )
    source: str = Field(
        "llm",
        description="'llm' or 'user'.",
    )


class CoreEngineLibWordImagesCreateResponse(BaseModel):
    """Response for POST /images."""
    success: bool = True
    data: dict
    # {"id": "img-a1b2c3d4", "file": "files/img-a1b2c3d4.svg", "bytes": 1234}


# ============================================
# DELETE IMAGE (DELETE /images/<id>)
# ============================================

class CoreEngineLibWordImagesDeleteResponse(BaseModel):
    """Response for DELETE /images/<id>."""
    success: bool = True
    data: dict
    # {"id": "img-a1b2c3d4", "deleted_files": 2}