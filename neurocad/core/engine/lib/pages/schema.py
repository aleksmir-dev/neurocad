# app/core/engine/lib/pages/schema.py

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime as dt


# ============================================
# BASE SCHEMA
# ============================================

class CoreEngineLibPagesItemBase(BaseModel):
    """Base article fields"""
    datetime: Optional[dt] = Field(None, description="Publication date and time. If omitted, set automatically.")
    title: str = Field(..., min_length=1, max_length=255, description="Title")
    description: Optional[str] = Field(None, description="Short description")
    logo: Optional[str] = Field(None, description="Logo (URL or emoji)")
    is_active: int = Field(1, description="Active: 1 — yes, 0 — no")

    # Template system
    is_template: int = Field(0, description="Base template: 1 — yes, 0 — no")
    template_id: Optional[int] = Field(None, description="Base template ID (inheritance)")


# ============================================
# CREATE
# ============================================

class CoreEngineLibPagesItemCreate(CoreEngineLibPagesItemBase):
    """Article creation"""
    content: Optional[str] = Field(None, description="HTML for display")
    content_json: Optional[str] = Field(None, description="GrapesJS JSON for the editor")


# ============================================
# UPDATE
# ============================================

class CoreEngineLibPagesItemUpdate(BaseModel):
    """Article update — all fields optional"""
    datetime: Optional[dt] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    logo: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[str] = None
    is_active: Optional[int] = None

    # Template system
    is_template: Optional[int] = None
    template_id: Optional[int] = None


# ============================================
# LIST ITEM (without content/content_json)
# ============================================

class CoreEngineLibPagesItemListItem(BaseModel):
    """Article for list view — without heavy fields"""
    id: int
    datetime: dt
    title: str
    description: Optional[str] = None
    logo: Optional[str] = None
    is_active: int
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None
    rss_yandex_id: Optional[str] = None

    # Template system
    is_template: int = 0
    template_id: Optional[int] = None

    class Config:
        from_attributes = True


# ============================================
# FULL ARTICLE (with content/content_json)
# ============================================

class CoreEngineLibPagesItemResponse(CoreEngineLibPagesItemListItem):
    """Full article — with content and content_json"""
    content: Optional[str] = None
    content_json: Optional[str] = None


# ============================================
# ARTICLE LIST (response)
# ============================================

class CoreEngineLibPagesListResponse(BaseModel):
    """Response with a list of articles"""
    items: list[CoreEngineLibPagesItemListItem]
    total: int = 0
    page: int = 1
    limit: int = 20