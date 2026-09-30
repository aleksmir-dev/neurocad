# neurocad/core/engine/lib/word/route.py

"""
Word API routes — page content, history, assets.

Endpoints:
    GET    /bydatetime/{date}/{time}      — page by date/time
    GET    /item/{item_id}                — page by ID
    PUT    /{page_id}                     — save page content
    GET    /{page_id}/history             — list snapshots (metadata)
    GET    /{page_id}/history/{hist_id}   — one full snapshot
    DELETE /{page_id}/history/{hist_id}   — delete one snapshot
    DELETE /{page_id}/history             — clear all snapshots
    POST   /{page_id}/rollback/{hist_id}  — roll back to a snapshot
    GET    /assets                        — list media for a nav
    POST   /assets/upload                 — upload media for a nav

Scoping:
    Every endpoint resolves a nav instance. If ?nav_id=<id> is given,
    it is used as-is; otherwise the backend falls back to the current
    user's first nav (by id ASC). Pages and media are scoped to
    Nav.id, not to a module.

Permissions:
    Read endpoints (bydatetime, item, history, assets) — public or
    authenticated; write endpoints (save, delete, clear, rollback,
    upload) — any authenticated user. Guests cannot write.

Sub-routers:
    - llm/*    (presets, chat, history)
    - editor/* (effects, and future editor sub-APIs)

Namespace: CoreEngineLibWord*
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, Request
from fastapi.responses import JSONResponse
from typing import List, Optional

from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.core.models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from .service import CoreEngineLibWordService
from .schema import (
    CoreEngineLibWordSaveRequest,
    CoreEngineLibWordSaveResponse,
    CoreEngineLibWordAssetsResponse,
    CoreEngineLibWordUploadResponse,
)

# LLM router (presets, chat, history)
from .llm.route import router as llm_router

# Editor router (effects, and future editor sub-APIs)
from .editor.route import router as editor_router


router = APIRouter(prefix="/word", tags=["core/engine/lib/word"])

# Include LLM router (all /llm/* endpoints)
router.include_router(llm_router)

# Include editor router (all /editor/* endpoints)
router.include_router(editor_router)


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
      1. Explicit nav_id (from query / path) — used as-is.
      2. First nav of the current user (ORDER BY id ASC, is_delete=0).

    Raises:
        401 if there is no authenticated user and no explicit nav_id.
        404 if the current user has no nav at all.
    """
    if explicit_nav_id is not None:
        return explicit_nav_id

    if current_user is None:
        current_user = await get_current_user(request)

    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async for session in get_db_sqlite():
        stmt = (
            select(Nav)
            .where(Nav.user_id == user_id, Nav.is_delete == False)
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
# ONE PAGE BY DATETIME
# ============================================

@router.get("/bydatetime/{date}/{time}")
async def get_word_page_by_datetime(
    date: str,
    time: str,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """
    Get page by date and time.

    Example:
        /core/engine/lib/word/bydatetime/20260914/153910?nav_id=2

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    Public endpoint (needed for page display).
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id)

    item = await CoreEngineLibWordService.get_by_datetime(
        date, time, nav_id=resolved_nav_id
    )

    if not item:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# ONE PAGE BY ID
# ============================================

@router.get("/item/{item_id}")
async def get_word_page_by_id(
    item_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """
    Get page by ID.

    Example:
        /core/engine/lib/word/item/2?nav_id=2

    Public endpoint.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id)

    item = await CoreEngineLibWordService.get_by_id(item_id, nav_id=resolved_nav_id)

    if not item:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# SAVE CONTENT
# ============================================

@router.put("/{page_id}")
async def save_word_content(
    page_id: int,
    data: CoreEngineLibWordSaveRequest,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save page content (HTML + GrapesJS JSON + CSS).

    Before update, a snapshot of the current state is written
    to page_hist with action='user_edit' (see service.save_content).

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    result = await CoreEngineLibWordService.save_content(
        page_id=page_id,
        nav_id=resolved_nav_id,
        content=data.content,
        content_json=data.content_json,
        css=data.css,
        user_note=current_user.get("username") or current_user.get("email"),
    )

    if not result:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# HISTORY — LIST
# ============================================

@router.get("/{page_id}/history")
async def get_word_history(
    page_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    List all snapshots for a page, newest first.

    Does NOT include html / content_json / css (heavy) — only metadata.
    Use GET /{page_id}/history/{hist_id} for a full snapshot.

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    items = await CoreEngineLibWordService.list_history(
        page_id, nav_id=resolved_nav_id
    )

    if items is None:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": items,
    })


# ============================================
# HISTORY — ONE ITEM (full snapshot)
# ============================================

@router.get("/{page_id}/history/{hist_id}")
async def get_word_history_item(
    page_id: int,
    hist_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Get one full snapshot (html + content_json + css).

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    item = await CoreEngineLibWordService.get_history_item(
        hist_id=hist_id,
        page_id=page_id,
        nav_id=resolved_nav_id,
    )

    if not item:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# HISTORY — DELETE ONE SNAPSHOT
# ============================================

@router.delete("/{page_id}/history/{hist_id}")
async def delete_word_history_item(
    page_id: int,
    hist_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete ONE snapshot from a page's history.

    The page itself is NOT touched — only the PageHist row is removed.

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    ok = await CoreEngineLibWordService.delete_history_item(
        page_id=page_id,
        hist_id=hist_id,
        nav_id=resolved_nav_id,
    )

    if not ok:
        raise HTTPException(
            status_code=404,
            detail="Page or snapshot not found",
        )

    return JSONResponse({
        "success": True,
        "data": {"deleted": hist_id},
    })


# ============================================
# HISTORY — CLEAR ALL SNAPSHOTS
# ============================================

@router.delete("/{page_id}/history")
async def clear_word_history(
    page_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Delete ALL snapshots of a page.

    The page itself is NOT touched — only the PageHist rows
    that reference it.

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    ok = await CoreEngineLibWordService.clear_history(
        page_id=page_id,
        nav_id=resolved_nav_id,
    )

    if not ok:
        raise HTTPException(status_code=404, detail="Page not found")

    return JSONResponse({
        "success": True,
        "data": {"cleared": True},
    })


# ============================================
# HISTORY — ROLLBACK
# ============================================

@router.post("/{page_id}/rollback/{hist_id}")
async def rollback_word_content(
    page_id: int,
    hist_id: int,
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Roll the page back to the given snapshot.

    Before rollback, the current state is snapshotted into page_hist
    (action='user_edit'), then the snapshot is applied, and a new
    record with action='rollback' is written (audit trail).

    Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    result = await CoreEngineLibWordService.rollback(
        page_id=page_id,
        nav_id=resolved_nav_id,
        hist_id=hist_id,
        user_note=current_user.get("username") or current_user.get("email"),
    )

    if not result:
        raise HTTPException(status_code=404, detail="Page or snapshot not found")

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# LIST ASSETS
# ============================================

@router.get("/assets")
async def list_word_assets(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Get list of all images from media/<nav_id>/.

    Used by GrapesJS Asset Manager. Any authenticated user.
    """
    resolved_nav_id = await _resolve_nav_id(request, nav_id, current_user=current_user)

    assets = await CoreEngineLibWordService.list_assets(resolved_nav_id)

    return JSONResponse({
        "success": True,
        "data": assets,
    })


# ============================================
# UPLOAD ASSETS
# ============================================

@router.post("/assets/upload")
async def upload_word_assets(
    request: Request,
    nav_id: Optional[int] = Query(None, description="Nav instance ID (optional)"),
) -> JSONResponse:
    """
    Upload images to media/<nav_id>/.
    Used by GrapesJS Asset Manager.

    Notes:
      - Read form ONCE (Starlette does not allow re-reading).
      - Detect UploadFile by duck-typing (filename/read/content_type),
        not via isinstance — UploadFile classes differ across
        Starlette / FastAPI versions.
      - Accept any field name: 'files', 'files[]', 'file', 'upload'.
      - Authorization — manually, via get_current_user(request).
    """
    # ===== READ FORM ONCE =====
    form = await request.form()

    # ===== LOGGING =====
    print("=" * 60)
    print("[UPLOAD] POST /assets/upload")
    print("[UPLOAD] Content-Type:", request.headers.get("content-type"))
    print("[UPLOAD] form keys:", list(form.keys()))

    # ===== HELPER: detect UploadFile without isinstance =====
    def is_upload_file(obj) -> bool:
        return (
            hasattr(obj, "filename")
            and hasattr(obj, "read")
            and hasattr(obj, "content_type")
            and callable(getattr(obj, "read", None))
        )

    # ===== COLLECT FILES =====
    all_files: List[UploadFile] = []
    for key, value in form.multi_items():
        print(f"[UPLOAD]   {key} → type={type(value).__name__}")
        if is_upload_file(value):
            all_files.append(value)
            print(f"[UPLOAD]     ✔ UploadFile: name={value.filename}, "
                  f"content_type={value.content_type}")
        else:
            print(f"[UPLOAD]     ✘ not a file: {value!r}")

    print("[UPLOAD] Total files:", len(all_files))
    print("=" * 60)

    # ===== AUTHORIZATION =====
    current_user = await get_current_user(request)
    if not current_user or not current_user.get("id"):
        raise HTTPException(status_code=401, detail="Not authenticated")

    # ===== RESOLVE NAV =====
    resolved_nav_id = await _resolve_nav_id(
        request, nav_id, current_user=current_user
    )

    # ===== SAVE =====
    if not all_files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        urls = await CoreEngineLibWordService.upload_assets(all_files, resolved_nav_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

    return JSONResponse({
        "success": True,
        "data": urls,
    })