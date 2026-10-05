# neurocad/core/engine/lib/word/schema.py

"""
Word schemas — page content, history, assets.

Pydantic models for the word API. Read and write shapes for pages,
history snapshots, and the media library. Pages are scoped to a nav
instance (nav_id) — that scoping is carried in the URL / query, not
in the request bodies, so it is not part of these schemas.

Namespace: CoreEngineLibWord*
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime as dt


# ============================================
# RESPONSE — single page (for bydatetime and item)
# ============================================

class CoreEngineLibWordItemResponse(BaseModel):
    """One page for display / editing"""
    id: int
    nav_id: int
    datetime: dt
    title: str
    description: Optional[str] = None
    logo: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[str] = None
    css: Optional[str] = None
    is_active: int
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None
    rss_yandex_id: Optional[str] = None

    # Absolute public URL of this page on the owner's public host:
    #     https://<login>.<APP_DOMAIN>/page/<nav_id>/<YYYYMMDD>/<HHMMSS>
    #     https://<custom-domain>/page/<nav_id>/<YYYYMMDD>/<HHMMSS>
    #
    # Built server-side by CoreEngineLibWordService using
    # CoreEngineLibBaseProfileDomainService.get_public_base_url(user_id)
    # — the same base the sitemap and the "Открыть каталог статей"
    # button use.
    #
    # Why it must be absolute and come from the server:
    #   The Word toolbar runs inside the ADMIN panel, which lives
    #   on the technical host (e.g. neurocad-dev.ru). A relative
    #   "/page/<nav_id>/..." would resolve against the current
    #   host, sending the user to neurocad-dev.ru/page/... instead
    #   of the owner's own host (testuser3.neurocad-dev.ru or the
    #   user's custom domain). The editor cannot know the owner's
    #   public host on its own — only the server can resolve it
    #   (via users.domain or <login>.<APP_DOMAIN>).
    #
    # None when:
    #   - the owner of the nav cannot be resolved (missing nav,
    #     deleted user), or
    #   - the page has no datetime (should not happen — page.datetime
    #     is NOT NULL — but we guard against it anyway).
    # In both cases the frontend falls back to a relative URL.
    public_url: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================
# RESPONSE — wrapper for a single page
# ============================================

class CoreEngineLibWordPageResponse(BaseModel):
    """Response wrapper for a single page"""
    success: bool = True
    data: CoreEngineLibWordItemResponse


# ============================================
# SAVE CONTENT
# ============================================

class CoreEngineLibWordSaveRequest(BaseModel):
    """
    Request body for saving page content from the editor.

    content      = HTML for display (without <style>).
    content_json = GrapesJS JSON (string).
    css          = page CSS (from editor.getCss()).
    """
    content: Optional[str] = Field(None, description="HTML for display")
    content_json: Optional[str] = Field(None, description="GrapesJS JSON")
    css: Optional[str] = Field(None, description="Page CSS")


class CoreEngineLibWordSaveResponse(BaseModel):
    """Response for saving content"""
    success: bool = True
    data: dict


# ============================================
# ASSETS (MEDIA LIBRARY)
# ============================================

class CoreEngineLibWordAsset(BaseModel):
    """Single asset (image)"""
    src: str = Field(..., description="Image URL")
    name: str = Field(..., description="File name")
    type: str = Field("image", description="Asset type")


class CoreEngineLibWordAssetsResponse(BaseModel):
    """Response with a list of assets"""
    success: bool = True
    data: List[CoreEngineLibWordAsset]


class CoreEngineLibWordUploadResponse(BaseModel):
    """Response for asset upload"""
    success: bool = True
    data: List[str] = Field(..., description="URLs of uploaded files")


# ============================================
# CHANGE HISTORY (page_hist)
# ============================================

class CoreEngineLibWordHistoryItem(BaseModel):
    """
    Metadata for a single history snapshot.

    Does NOT include html / content_json / css (heavy fields) —
    for a full snapshot use GET /{page_id}/history/{hist_id}.
    """
    id: int
    action: Optional[str] = Field(
        None,
        description="user_edit | ai_edit | preset_apply | rollback",
    )
    note: Optional[str] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordHistoryListResponse(BaseModel):
    """Response with a list of snapshots (metadata, no html/content_json/css)"""
    success: bool = True
    data: List[CoreEngineLibWordHistoryItem]


class CoreEngineLibWordHistoryItemResponse(BaseModel):
    """
    Full history snapshot — html + content_json + css.

    Used for preview and for rollback.
    """
    id: int
    page_id: int
    html: str
    content_json: Optional[str] = None
    css: Optional[str] = None
    action: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordHistoryItemFullResponse(BaseModel):
    """Response wrapper for a single full snapshot"""
    success: bool = True
    data: CoreEngineLibWordHistoryItemResponse


class CoreEngineLibWordRollbackResponse(BaseModel):
    """
    Response for a rollback to a snapshot.

    Returns updated content / content_json / css / updated_at —
    so the frontend can refresh its state without a second GET.
    """
    success: bool = True
    data: dict