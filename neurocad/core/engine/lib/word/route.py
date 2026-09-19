# neurocad/core/engine/lib/word/route.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Request
from fastapi.responses import JSONResponse
from typing import List
from sqlalchemy import select

from neurocad.core.auth.dependencies import get_current_user
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.models.module import Module
from .service import CoreEngineLibWordService
from .schema import (
    CoreEngineLibWordSaveRequest,
    CoreEngineLibWordSaveResponse,
    CoreEngineLibWordAssetsResponse,
    CoreEngineLibWordUploadResponse,
)

# LLM router (presets, chat, history)
from .llm.route import router as llm_router


router = APIRouter(prefix="/word", tags=["core/engine/lib/word"])

# Include LLM router (all /llm/* endpoints)
router.include_router(llm_router)


# ============================================
# MODULE RESOLUTION
# ============================================

def _module_name(request: Request) -> str:
    """
    Resolve module_name from query or Referer.

    Priority:
      1. ?module=<name>  (passed by frontend, engine.js knows it)
      2. Referer: /core/engine/<module>/...  (fallback)
    """
    # 1. Query param
    module_name = request.query_params.get("module")
    if module_name:
        return module_name

    # 2. Referer
    referer = request.headers.get("referer", "")
    if "/core/engine/" in referer:
        module_name = referer.split("/core/engine/", 1)[1].split("/")[0]
        if module_name:
            return module_name

    raise HTTPException(status_code=400, detail="Модуль не определён")


async def _get_mod_id(request: Request) -> int:
    """
    Resolve mod_id from module_name via modules table.

    module_name — e.g. "aleksmir.ru", "site01.ru", "pages".
    """
    module_name = _module_name(request)

    async for session in get_db_sqlite():
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()

        if not module:
            raise HTTPException(
                status_code=404,
                detail=f"Модуль {module_name} не найден",
            )
        return module.id

    raise HTTPException(status_code=500, detail="DB error")


# ============================================
# ONE PAGE BY DATETIME
# ============================================

@router.get("/bydatetime/{date}/{time}")
async def get_word_page_by_datetime(
    date: str,
    time: str,
    request: Request,
) -> JSONResponse:
    """
    Get page by date and time.

    Example: /core/engine/lib/word/bydatetime/20260914/153910?module=aleksmir.ru

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    Public endpoint (needed for page display).
    """
    mod_id = await _get_mod_id(request)
    item = await CoreEngineLibWordService.get_by_datetime(date, time, mod_id)

    if not item:
        raise HTTPException(status_code=404, detail="Страница не найдена")

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
) -> JSONResponse:
    """
    Get page by ID.

    Example: /core/engine/lib/word/item/2?module=aleksmir.ru

    Public endpoint.
    """
    mod_id = await _get_mod_id(request)
    item = await CoreEngineLibWordService.get_by_id(item_id, mod_id)

    if not item:
        raise HTTPException(status_code=404, detail="Страница не найдена")

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
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Save page content (HTML + GrapesJS JSON).

    Available only to superadmin.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    mod_id = await _get_mod_id(request)

    result = await CoreEngineLibWordService.save_content(
        page_id=page_id,
        mod_id=mod_id,
        content=data.content,
        content_json=data.content_json,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Страница не найдена")

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
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Get list of all images from media/<module_name>/.

    Used by GrapesJS Asset Manager.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    mod_id = await _get_mod_id(request)
    assets = await CoreEngineLibWordService.list_assets(mod_id)

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
) -> JSONResponse:
    """
    Upload images to media/<module_name>/.
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
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    # ===== SAVE =====
    if not all_files:
        raise HTTPException(status_code=400, detail="Файлы не переданы")

    mod_id = await _get_mod_id(request)

    try:
        urls = await CoreEngineLibWordService.upload_assets(all_files, mod_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")

    return JSONResponse({
        "success": True,
        "data": urls,
    })