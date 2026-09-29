# neurocad/core/engine/lib/word/editor/io/schema.py

"""
Import/export schemas.

Pydantic models for the editor's import/export API:

  IMPORT URL:
    POST /word/editor/io/import/url
      request:  { "url": "https://example.com/page", "include_images": true }
      response: { "html": "...", "css": "...", "warnings": [...] }

  IMPORT FILE:
    POST /word/editor/io/import/file   (multipart/form-data)
      request:  file = page.grp | page.html | page.htm
      response: { "html": "...", "css": "...", "json": "...|null",
                  "assets": {"<path>": "data:image/...;base64,..."},
                  "warnings": [...] }

  EXPORT HTML:
    GET  /word/editor/io/export/html/{page_id}
      response: text/html (attachment, filename=<title>.html)

  EXPORT GRP:
    GET  /word/editor/io/export/grp/{page_id}
      response: application/zip (attachment, filename=<title>.grp)

.grp archive layout
-------------------
    page.grp
    ├── index.html     — editor.getHtml() output (components only)
    ├── index.css      — editor.getCss() output (StyleManager)
    ├── index.json     — editor.getProjectData() (full state, preferred on import)
    └── media/         — all assets referenced by the page
        ├── <file1>
        └── <file2>

Import is side-effect-free: the archive's contents are returned to the
caller as JSON; nothing is written to disk. Media files are inlined as
data-URI so the editor can render them immediately.

Namespace: CoreEngineLibWordEditorIo*
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================
# CONSTANTS
# ============================================

#: Max bytes accepted for a single uploaded file (import).
MAX_IMPORT_BYTES = 32 * 1024 * 1024   # 32 MB

#: Max bytes accepted for a single asset inside a .grp archive.
MAX_ASSET_BYTES = 8 * 1024 * 1024     # 8 MB

#: Timeout for fetching a remote page / asset (seconds).
FETCH_TIMEOUT = 20.0


# ============================================
# IMPORT — URL
# ============================================

class CoreEngineLibWordEditorIoImportUrlRequest(BaseModel):
    """Request body for POST /import/url."""

    url: str = Field(
        ...,
        min_length=8,
        max_length=2048,
        description="Page URL to fetch (http / https).",
    )
    include_images: bool = Field(
        True,
        description=(
            "If true, download images referenced by the page and inline them "
            "as data-URI in <img src>. If false, keep original URLs as-is."
        ),
    )


class CoreEngineLibWordEditorIoImportUrlResponse(BaseModel):
    """Response for POST /import/url."""

    html: str = Field("", description="Page HTML with inlined <style> blocks.")
    css: str = Field("", description="Combined CSS extracted from <link> and <style>.")
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal issues encountered while fetching / parsing.",
    )


# ============================================
# IMPORT — FILE
# ============================================

class CoreEngineLibWordEditorIoImportFileResponse(BaseModel):
    """
    Response for POST /import/file.

    For .grp archives — `json` is preferred (full GrapesJS project data).
    `html` / `css` are always provided as a fallback.

    For plain .html files — `json` is None; `html` + `css` are the payload.
    """

    html: str = Field("", description="HTML content (fallback).")
    css: str = Field("", description="CSS content (fallback).")
    json: Optional[str] = Field(
        None,
        description=(
            "GrapesJS project data as a JSON string (from index.json). "
            "None if the archive had no index.json."
        ),
    )
    assets: Dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Map of asset path → data-URI. Media files from the .grp archive, "
            "encoded inline so the editor can render them without writing "
            "to disk first."
        ),
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal issues encountered while unpacking / parsing.",
    )


# ============================================
# EXPORT — REQUESTS (optional body)
# ============================================

class CoreEngineLibWordEditorIoExportRequest(BaseModel):
    """
    Optional request body for export endpoints.

    When omitted, the page is exported from its stored content /
    content_json / css. When provided, the given state is used instead
    (useful for exporting unsaved changes).
    """

    html: Optional[str] = Field(None, description="Override HTML.")
    css: Optional[str] = Field(None, description="Override CSS (StyleManager).")
    json: Optional[str] = Field(None, description="Override project data (JSON string).")


# ============================================
# HELPERS
# ============================================

def empty_import_response() -> Dict[str, Any]:
    """A blank import response — used as a default in routes."""
    return {"html": "", "css": "", "warnings": []}