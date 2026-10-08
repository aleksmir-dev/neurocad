# neurocad/core/engine/lib/pages/public/schema.py

"""
Public pages schemas.

Pydantic models for public page rendering.
Read-only — no input validation needed for now.

Scoping:
  Pages are scoped to a nav instance (nav_id), not to a module.
  A nav is the object that owns pages; the module is just its class.

Folder mode
-----------
The public catalog (/pages) is hierarchical, just like the admin
one. A row is either a regular page ("page") or a folder
("folder"):

  - a folder is rendered as a link to /pages/<id>;
  - a page is rendered as a link to its public URL (either
    /page/<YYYYMMDD>/<HHMMSS> for an internal page, or an external
    URL for a link card).

The template does not need to distinguish "internal" from
"external" — every item carries a ready-to-use `url`; the template
just renders <a href="{url}">.

Breadcrumbs are built on the server (see route.py) and passed to
the template as a separate list, not as part of the item payload.

Namespace: CoreEngineLibPagesPublic*
"""

from typing import Optional, Literal
from datetime import datetime as dt
from pydantic import BaseModel, Field


# ============================================
# CONSTANTS
# ============================================

#: Allowed values for `card_type`. Mirrors the admin schema —
#: values must stay in sync with app/core/engine/lib/pages/schema.py.
CARD_TYPE_PAGE = "page"
CARD_TYPE_FOLDER = "folder"

CardType = Literal["page", "folder"]


# ============================================
# BASE SCHEMA
# ============================================

class CoreEngineLibPagesPublicItemBase(BaseModel):
    """Base fields for public page rendering"""

    id: int = Field(..., description="Page ID")
    nav_id: int = Field(..., description="Nav instance ID this page belongs to")

    datetime: Optional[dt] = Field(
        None,
        description=(
            "Page datetime. NULL for folders — they have no "
            "publication date."
        ),
    )
    title: str = Field(..., description="Page title")
    description: Optional[str] = Field(
        None,
        description="Short description (meta description)",
    )

    # ===== Folder mode =====
    # "page"   — a regular article;
    # "folder" — a grouping node (no content, no datetime).
    card_type: CardType = Field(
        CARD_TYPE_PAGE,
        description="Item type: 'page' or 'folder'",
    )

    # Parent folder id, or None for a root-level item.
    parent_id: Optional[int] = Field(
        None,
        description="Parent folder id, or None for root",
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
    Public item for list view — without the heavy content field.

    Covers both pages and folders. The template distinguishes them
    by `card_type`:

      - card_type == "folder" → render as a folder card, link to
        `/pages/<id>` (the `url` field already holds that path);
      - card_type == "page"   → render as a page card, link to
        whatever `url` holds.

    Carries a ready-to-use `url` so the /pages catalog template
    does not have to assemble anything. The service is the single
    source of truth for what that URL means
    (see CoreEngineLibPagesPublicService._resolve_card_url).

    `url` for a folder is always an internal path: /pages/<id>.

    `url` for a page can be either:

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
        description="Logo / thumbnail URL (pages only)",
    )
    url: str = Field(
        ...,
        description=(
            "Target of the catalog card. For a folder — /pages/<id>. "
            "For a page — /page/<YYYYMMDD>/<HHMMSS> for regular "
            "pages, or an external URL for link cards (pages.url)."
        ),
    )

    # How many live children this folder has. Only meaningful when
    # card_type == "folder"; the service fills it in for folders
    # and leaves it None for pages. The template uses it for the
    # small counter chip on a folder card.
    children_count: Optional[int] = Field(
        None,
        description="Number of live children (folders only)",
    )

    class Config:
        from_attributes = True


# ============================================
# BREADCRUMBS
# ============================================

class CoreEngineLibPagesPublicCrumb(BaseModel):
    """
    One breadcrumb entry — used to render the trail above the
    catalog:

        Все  /  Оборудование  /  Ноутбуки

    The first entry is always the root ("Все", href="/pages").
    Each following entry corresponds to one level of the current
    folder path. The last entry is the current folder — the
    template renders it as plain text, not a link.

    Built on the server (see route.py) from the cookie path and
    the folder chain in the DB. Not part of the item payload.
    """

    id: Optional[int] = Field(
        None,
        description="Folder id, or None for the root entry",
    )
    title: str = Field(
        ...,
        description="Display title (folder name, or 'Все' for the root)",
    )
    url: str = Field(
        ...,
        description="Link target — '/pages' for the root, '/pages/<id>' otherwise",
    )


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

    `crumbs` — breadcrumbs from the root to the current folder
    (inclusive). Empty list when the current folder is the root.
    """

    items: list[CoreEngineLibPagesPublicItemListItem]
    total: int = 0
    nav_id: int
    crumbs: list[CoreEngineLibPagesPublicCrumb] = Field(
        default_factory=list,
        description="Breadcrumbs from root to the current folder",
    )