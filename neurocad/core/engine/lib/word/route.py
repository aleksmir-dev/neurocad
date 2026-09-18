# neurocad/core/engine/lib/word/route.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from typing import List

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibWordService
from .schema import (
    CoreEngineLibWordSaveRequest,
    CoreEngineLibWordSaveResponse,
    CoreEngineLibWordAssetsResponse,
    CoreEngineLibWordUploadResponse,
)

# LLM-роутер (пресеты, чат, история)
from .llm.route import router as llm_router


router = APIRouter(prefix="/word", tags=["core/engine/lib/word"])

# Подключаем LLM-роутер (все эндпоинты /llm/*)
router.include_router(llm_router)


# ============================================
# ОДНА СТРАНИЦА ПО ДАТЕ/ВРЕМЕНИ
# ============================================

@router.get("/bydatetime/{date}/{time}")
async def get_word_page_by_datetime(date: str, time: str) -> JSONResponse:
    """
    Получить страницу по дате и времени.

    Пример: /core/engine/lib/word/bydatetime/20260914/153910

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    Публичный эндпоинт (нужен для отображения страницы).
    """
    item = await CoreEngineLibWordService.get_by_datetime(date, time)

    if not item:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# ОДНА СТРАНИЦА ПО ID
# ============================================

@router.get("/item/{item_id}")
async def get_word_page_by_id(item_id: int) -> JSONResponse:
    """
    Получить страницу по ID.

    Пример: /core/engine/lib/word/item/2

    Публичный эндпоинт.
    """
    item = await CoreEngineLibWordService.get_by_id(item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# СОХРАНЕНИЕ КОНТЕНТА
# ============================================

@router.put("/{page_id}")
async def save_word_content(
    page_id: int,
    data: CoreEngineLibWordSaveRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Сохранить контент страницы (HTML + JSON GrapesJS).

    Доступно только суперадмину.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await CoreEngineLibWordService.save_content(
        page_id=page_id,
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
# СПИСОК АССЕТОВ
# ============================================

@router.get("/assets")
async def list_word_assets(
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Получить список всех изображений из медиатеки.
    Используется Asset Manager GrapesJS.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    assets = await CoreEngineLibWordService.list_assets()

    return JSONResponse({
        "success": True,
        "data": assets,
    })


# ============================================
# ЗАГРУЗКА АССЕТОВ
# ============================================

@router.post("/assets/upload")
async def upload_word_assets(
    request: Request,
) -> JSONResponse:
    """
    Загрузить изображения в медиатеку.
    Используется Asset Manager GrapesJS.

    Особенности:
      - Читаем form ОДИН раз (Starlette не даёт прочитать повторно).
      - Определяем UploadFile по duck-typing (атрибуты filename/read/
        content_type), а не через isinstance — в разных версиях Starlette
        и FastAPI классы UploadFile не совпадают.
      - Принимаем любое имя поля: 'files', 'files[]', 'file', 'upload'.
      - Авторизация — вручную, через get_current_user(request).
    """
    # ===== ЧИТАЕМ FORM ОДИН РАЗ =====
    form = await request.form()

    # ===== ЛОГИРОВАНИЕ =====
    print("=" * 60)
    print("[UPLOAD] POST /assets/upload")
    print("[UPLOAD] Content-Type:", request.headers.get("content-type"))
    print("[UPLOAD] form keys:", list(form.keys()))

    # ===== ХЕЛПЕР: проверка на UploadFile без isinstance =====
    def is_upload_file(obj) -> bool:
        return (
            hasattr(obj, "filename")
            and hasattr(obj, "read")
            and hasattr(obj, "content_type")
            and callable(getattr(obj, "read", None))
        )

    # ===== СОБИРАЕМ ФАЙЛЫ =====
    all_files: List[UploadFile] = []
    for key, value in form.multi_items():
        print(f"[UPLOAD]   {key} → type={type(value).__name__}")
        if is_upload_file(value):
            all_files.append(value)
            print(f"[UPLOAD]     ✔ UploadFile: name={value.filename}, "
                  f"content_type={value.content_type}")
        else:
            print(f"[UPLOAD]     ✘ не файл: {value!r}")

    print("[UPLOAD] Итого файлов:", len(all_files))
    print("=" * 60)

    # ===== АВТОРИЗАЦИЯ =====
    current_user = await get_current_user(request)
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    # ===== СОХРАНЕНИЕ =====
    if not all_files:
        raise HTTPException(status_code=400, detail="Файлы не переданы")

    try:
        urls = await CoreEngineLibWordService.upload_assets(all_files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")

    return JSONResponse({
        "success": True,
        "data": urls,
    })