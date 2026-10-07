# neurocad/core/engine/lib/pages/public/schema.py

"""
Public pages schemas.

Pydantic models for public page rendering.
Read-only — no input validation needed for now.

Scoping:
  Pages are scoped to a nav instance (nav_id), not to a module.
  A nav is the object that owns pages; the module is just its class.

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
    nav_id: int = Field(..., description="Nav instance ID this page belongs to")

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
    """
    Public page for list view — without the heavy content field.

    Carries a ready-to-use `url` so the /pages catalog template
    does not have to assemble anything. The service is the single
    source of truth for what that URL means
    (see CoreEngineLibPagesPublicService._resolve_card_url).

    `url` can be either:

      - an internal path: /page/<YYYYMMDD>/<HHMMSS> — the regular
        case, when the page has no external `url` set;

      - an absolute external URL: https://example.com — when the
        page is a "link card" (pages.url is set), used to point at
        an external site from the catalog.

    The template does not need to distinguish the two cases — it
    just renders <a href="{url}">.
    """

    logo: Optional[str] = Field(
        None,
        description="Logo / thumbnail URL",
    )
    url: str = Field(
        ...,
        description=(
            "Target of the catalog card. Internal path "
            "(/page/<YYYYMMDD>/<HHMMSS>) for regular pages, or an "
            "external URL for link cards (pages.url)."
        ),
    )

    class Config:
        from_attributes = True


# ============================================
# LIST RESPONSE
# ============================================

class CoreEngineLibPagesPublicListResponse(BaseModel):
    """
    Response for the /pages catalog.

    No pagination yet — the catalog returns up to `limit` items
    (default 100) in one go. `total` mirrors `len(items)`; it is
    kept as a separate field so a future pagination layer can
    change it without breaking the shape.
    """

    items: list[CoreEngineLibPagesPublicItemListItem]
    total: int = 0
    nav_id: int