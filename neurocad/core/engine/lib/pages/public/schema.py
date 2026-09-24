# neurocad/core/engine/lib/pages/public/schema.py

"""
Public pages schemas.

Pydantic models for public page rendering.
Read-only — no input validation needed for now.

Namespace: CoreEngineLibPagesPublic*
"""

from typing import Optional
from datetime import datetime as dt
from pydantic import BaseModel, Field


# ============================================
# BASE SCHEMA
# ============================================

class CoreEngineLibPagesPublicItemBase(BaseModel):
    """Base fields for public page rendering"""

    id: int = Field(..., description="Page ID")
    mod_id: int = Field(..., description="Module ID this page belongs to")

    datetime: Optional[dt] = Field(
        None,
        description="Page datetime",
    )
    title: str = Field(..., description="Page title")
    description: Optional[str] = Field(
        None,
        description="Short description (meta description)",
    )


# ============================================
# ITEM (with content)
# ============================================

class CoreEngineLibPagesPublicItem(CoreEngineLibPagesPublicItemBase):
    """Public page — includes HTML content and CSS for rendering"""

    logo: Optional[str] = Field(
        None,
        description="Logo / thumbnail URL",
    )
    content: Optional[str] = Field(
        None,
        description="HTML content (no <style> — CSS is in the css field)",
    )
    css: Optional[str] = Field(
        None,
        description=(
            "Page CSS. For legacy pages (before the css field existed) "
            "this is extracted from <style> blocks inside content — "
            "see CoreEngineLibPagesPublicService._page_to_public."
        ),
    )
    template_id: Optional[int] = Field(
        None,
        description=(
            "Base template page ID. If set, this page's content is inserted "
            "into [data-slot='content'] of the template page."
        ),
    )

    class Config:
        from_attributes = True


# ============================================
# LIST ITEM (without content)
# ============================================

class CoreEngineLibPagesPublicItemListItem(CoreEngineLibPagesPublicItemBase):
    """Public page for list view — without heavy content field"""

    logo: Optional[str] = Field(
        None,
        description="Logo / thumbnail URL",
    )

    class Config:
        from_attributes = True


# ============================================
# LIST RESPONSE
# ============================================

class CoreEngineLibPagesPublicListResponse(BaseModel):
    """Response with a list of public pages"""

    items: list[CoreEngineLibPagesPublicItemListItem]
    total: int = 0
    page: int = 1
    limit: int = 20