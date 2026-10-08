# app/core/engine/lib/pages/schema.py

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime as dt


# ============================================
# CONSTANTS
# ============================================

#: Allowed values for `card_type`.
#:   "page"   — a regular article (has content / content_json / css).
#:   "folder" — a grouping node (no content; used to organise pages).
CARD_TYPE_PAGE = "page"
CARD_TYPE_FOLDER = "folder"

CardType = Literal["page", "folder"]


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

    # External URL for this page.
    # When set, the page behaves as a "link card": the public and
    # admin catalogs open this URL on click (in the current tab)
    # instead of the internal /page/<date>/<time> target. NULL or
    # empty string → the page behaves as before (internal target).
    # The editor still opens the page normally when accessed by its
    # own admin URL — `url` only changes how catalog cards resolve.
    url: Optional[str] = Field(
        None,
        max_length=2048,
        description="External URL — catalog cards link here when set",
    )

    # ===== Folder mode =====
    # `card_type` distinguishes a regular page from a folder.
    #   "page"   — a normal article (default);
    #   "folder" — a grouping node.
    # The catalog is hierarchical; BaseCards handles navigation.
    card_type: CardType = Field(
        CARD_TYPE_PAGE,
        description="Item type: 'page' (default) or 'folder'",
    )

    # `parent_id` — the folder this item lives in.
    #   None → the item is at the root.
    #   <id> → the item lives inside the folder with that id.
    parent_id: Optional[int] = Field(
        None,
        description="Parent folder id, or None for root",
    )

    # `sort_order` — manual ordering inside a folder.
    # Lower values sort first. Items with the same sort_order are
    # sorted by title (locale-aware). Default 0.
    sort_order: int = Field(
        0,
        description="Manual sort order inside the folder (ascending)",
    )

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

    # External URL. Set to a non-empty string to turn the page into
    # a link card; set to an empty string to clear it. Omit the
    # field to leave the current value untouched.
    url: Optional[str] = Field(None, max_length=2048)

    # Folder mode. Set to move the item into another folder; set to
    # null to move it to the root. Omit to leave the parent
    # untouched (the service uses exclude_unset to detect this).
    parent_id: Optional[int] = None

    # Manual sort order. Set to reorder; omit to leave untouched.
    sort_order: Optional[int] = None

    # NOTE: `card_type` is intentionally NOT updatable here.
    # Switching a page into a folder or vice versa would leave the
    # subtree inconsistent (a folder with children becoming a page,
    # or vice versa). If that ever needs to be supported, it must be
    # done through a dedicated endpoint that also fixes up children.

    # Template system
    is_template: Optional[int] = None
    template_id: Optional[int] = None


# ============================================
# LIST ITEM (without content/content_json)
# ============================================

class CoreEngineLibPagesItemListItem(BaseModel):
    """Article for list view — without heavy fields"""
    id: int
    datetime: Optional[dt] = None
    title: str
    description: Optional[str] = None
    logo: Optional[str] = None
    is_active: int
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None
    rss_yandex_id: Optional[str] = None

    # External URL — surfaced in list payloads so both the public
    # catalog and the admin catalog can decide where a card links.
    url: Optional[str] = None

    # Folder mode.
    card_type: CardType = CARD_TYPE_PAGE
    parent_id: Optional[int] = None
    sort_order: int = 0

    # How many live children this folder has. Only meaningful when
    # card_type == "folder"; the service fills it in for folders and
    # leaves it None for pages. The frontend uses it for the small
    # counter chip on a folder card.
    children_count: Optional[int] = None

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