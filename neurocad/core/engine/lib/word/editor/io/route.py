# neurocad/core/engine/lib/word/editor/io/route.py

"""
Import/export routes for the editor.

Namespace: CoreEngineLibWordEditorIoRoute

Mounted from word/editor/route.py with no extra prefix — the parent
editor router already carries prefix="/editor", and this router adds
"/io". Final paths (after word router's prefix):

  POST  /core/engine/lib/word/editor/io/import/url
  POST  /core/engine/lib/word/editor/io/import/file
  GET   /core/engine/lib/word/editor/io/export/html/{page_id}
  GET   /core/engine/lib/word/editor/io/export/grp/{page_id}

Permissions:
  All endpoints require an authenticated user. Guests get 401 from
  the dependency.

Scoping:
  Every endpoint resolves a nav instance. If ?nav_id=<id> is given,
  it is used as-is; otherwise the backend falls back to the current
  user's first nav (ORDER BY id ASC). Pages are scoped to Nav.id.

Errors:
  400  — bad input (invalid URL, unsupported file type, empty file)
  401  — not authenticated
  403  — nav_id given, but the nav does not belong to the current user
  404  — page not found
  413  — upload too large
  422  — Pydantic validation error (FastAPI default)
  500  — unexpected server error
"""

import json
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite

from .schema import (
    CoreEngineLibWordEditorIoImportUrlRequest,
    CoreEngineLibWordEditorIoImportUrlResponse,
    CoreEngineLibWordEditorIoImportFileResponse,
    CoreEngineLibWordEditorIoExportRequest,
    MAX_IMPORT_BYTES,
)
from . import service as io_service


router = APIRouter(
    prefix="/io",
    tags=["core/engine/lib/word/editor/io"],
)


# ============================================
# NAV RESOLUTION
# ============================================

async def _resolve_nav_id(
    request: Request,
    explicit_nav_id: Optional[int],
    current_user: Optional[dict] = None,
) -> int:
    """
    Resolve the nav instance for the current request.

    Priority:
      1. Explicit nav_id — must belong to the current user.
      2. Otherwise — the current user's first nav (ORDER BY id ASC).

    Raises:
        401 if there is no authenticated user.
        403 if the explicit nav_id does not belong to the current user.
        404 if the current user has no nav at all.
    """
    if current_user is None:
        current_user = await get_current_user(request)

    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async for session in get_db_sqlite():
        if explicit_nav_id is not None:
            # Verify the nav belongs to the current user.
            stmt = select(Nav).where(
                Nav.id == explicit_nav_id,
                Nav.user_id == user_id,
                Nav.is_delete == False,  # noqa: E712
            )
            nav = (await session.execute(stmt)).scalar_one_or_none()
            if not nav:
                raise HTTPException(
                    status_code=403,
                    detail="nav_id does not belong to the current user",
                )
            return nav.id

        # Fallback — first nav of the current user.
        stmt = (
            select(Nav)
            .where(Nav.user_id == user_id, Nav.is_delete == False)  # noqa: E712
            .order_by(Nav.id.asc())
            .limit(1)
        )
        nav = (await session.execute(stmt)).scalar_one_or_none()
        if not nav:
            raise HTTPException(
                status_code=404,
                detail="No nav found for the current user",
            )
        return nav.id

    raise HTTPException(status_code=500, detail="DB error")


# ============================================
# IMPORT — URL
# ============================================

@router.post("/import/url")
async def import_url(
    data: CoreEngineLibWordEditorIoImportUrlRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Fetch a remote page, inline its CSS (and optionally images),
    and return the result to the editor.

    Request:
      { "url": "https://example.com/page", "include_images": true }

    Response:
      {
        "success": true,
        "data": { "html": "...", "css": "...", "warnings": [...] }
      }

    Any authenticated user.
    """
    # Authentication check (dependency raises 401 for guests).
    _ = current_user

    try:
        result = io_service.import_url(
            url=data.url,
            include_images=data.include_images,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {type(e).__name__}: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# IMPORT — FILE
# ============================================

@router.post("/import/file")
async def import_file(
    request: Request,
    file: UploadFile = File(..., description=".grp archive or .html file"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Parse an uploaded .grp archive or .html file.

    Multipart form:
      file = <binary>

    Response:
      {
        "success": true,
        "data": {
          "html": "...",
          "css": "...",
          "json": "...|null",
          "assets": {"media/xxx": "data:image/...;base64,..."},
          "warnings": [...]
        }
      }

    Any authenticated user.
    """
    # Authentication check (dependency raises 401 for guests).
    _ = current_user

    # Read the file — bounded.
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Read failed: {e}")

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large: {len(content)} bytes "
                f"(max {MAX_IMPORT_BYTES})"
            ),
        )

    filename = file.filename or ""

    try:
        result = io_service.import_file(content, filename)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {type(e).__name__}: {e}",
        )

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# EXPORT — HELPERS
# ============================================

async def _load_page_for_export(
    page_id: int,
    nav_id: int,
) -> dict:
    """
    Load a page and return a dict suitable for io_service.export_*.

    Returns:
        {
          "title": str,
          "content": str | None,
          "content_json": str | None,
          "css": str | None,
        }

    Raises 404 if the page does not exist / is deleted.
    """
    from neurocad.core.models.base import Page  # local import — avoid cycles

    async for session in get_db_sqlite():
        stmt = select(Page).where(
            Page.id == page_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
        )
        page = (await session.execute(stmt)).scalar_one_or_none()
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")

        return {
            "title": page.title or f"page-{page.id}",
            "content": page.content,
            "content_json": page.content_json,
            "css": page.css,
        }

    raise HTTPException(status_code=500, detail="DB error")


def _safe_filename(name: str, ext: str) -> str:
    """
    Build a safe download filename: keep letters / digits / -_ .,
    collapse the rest, append the extension. No slashes.
    """
    import re
    base = (name or "page").strip()
    base = re.sub(r"[^\w\-.]+", "_", base, flags=re.UNICODE)
    base = base.strip("._") or "page"
    if not base.lower().endswith(ext.lower()):
        base = f"{base}{ext}"
    return base


def _content_disposition(filename: str) -> str:
    """
    RFC 5987 Content-Disposition with both ASCII fallback and UTF-8 form.
    """
    from urllib.parse import quote
    ascii_name = filename.encode("ascii", "ignore").decode("ascii") or "file"
    utf8_name = quote(filename, safe="")
    return (
        f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{utf8_name}"
    )


# ============================================
# EXPORT — HTML
# ============================================

@router.get("/export/html/{page_id}")
async def export_html(
    page_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> Response:
    """
    Export a page as a standalone HTML document with all CSS inlined
    in a single <style> block.

    Query:
      ?nav_id=<id>   — optional; defaults to the current user's first nav.

    Response:
      Content-Type: text/html; charset=utf-8
      Content-Disposition: attachment; filename="<title>.html"

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)
    page_data = await _load_page_for_export(page_id, resolved_nav_id)

    try:
        html = io_service.export_html(page_data)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {type(e).__name__}: {e}",
        )

    filename = _safe_filename(page_data["title"], ".html")

    return Response(
        content=html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "no-store",
        },
    )


# ============================================
# EXPORT — GRP
# ============================================

@router.get("/export/grp/{page_id}")
async def export_grp(
    page_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> Response:
    """
    Export a page as a .grp ZIP archive:

        index.html     — HTML components
        index.css      — custom CSS
        index.json     — GrapesJS project data (if available)
        media/*        — asset files referenced by the page

    Query:
      ?nav_id=<id>   — optional; defaults to the current user's first nav.

    Response:
      Content-Type: application/zip
      Content-Disposition: attachment; filename="<title>.grp"

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)
    page_data = await _load_page_for_export(page_id, resolved_nav_id)

    try:
        zip_bytes = io_service.export_grp(page_data)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Export failed: {type(e).__name__}: {e}",
        )

    filename = _safe_filename(page_data["title"], ".grp")

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": _content_disposition(filename),
            "Cache-Control": "no-store",
        },
    )