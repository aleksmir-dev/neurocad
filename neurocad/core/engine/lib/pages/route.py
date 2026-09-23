# app/core/engine/lib/pages/route.py

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Optional

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibPagesService
from .schema import (
    CoreEngineLibPagesItemCreate,
    CoreEngineLibPagesItemUpdate,
)

router = APIRouter(prefix="/pages", tags=["core/engine/lib/pages"])


# ========================================
# СПИСОК
# ========================================

@router.get("/list")
async def get_pages_list(
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(20, ge=1, le=100, description="Размер страницы"),
    is_active: Optional[int] = Query(None, description="Фильтр: 1 — активные, 0 — неактивные"),
    is_template: Optional[int] = Query(None, description="Фильтр: 1 — только шаблоны, 0 — только обычные"),
) -> JSONResponse:
    """Получить список статей с пагинацией. Публичный эндпоинт."""
    result = await CoreEngineLibPagesService.get_list(
        page=page,
        limit=limit,
        is_active=is_active,
        is_template=is_template,
    )

    return JSONResponse({
        "success": True,
        "data": result["items"],
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
    })


# ========================================
# ОДНА СТАТЬЯ ПО ID
# ========================================

@router.get("/item/{item_id}")
async def get_page_item(item_id: int) -> JSONResponse:
    """Получить одну статью по ID. Публичный эндпоинт."""
    item = await CoreEngineLibPagesService.get_item(item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# ОДНА СТАТЬЯ ПО ДАТЕ/ВРЕМЕНИ
# ========================================

@router.get("/bydatetime/{date}/{time}")
async def get_page_by_datetime(date: str, time: str) -> JSONResponse:
    """
    Получить одну статью по дате и времени.

    Пример: /core/engine/lib/pages/bydatetime/20260914/153910

    date = "20260914" (YYYYMMDD)
    time = "153910"   (HHMMSS)

    Публичный эндпоинт.
    """
    item = await CoreEngineLibPagesService.get_by_datetime(date, time)

    if not item:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# СОЗДАНИЕ
# ========================================

@router.post("/item")
async def create_page_item(
    data: CoreEngineLibPagesItemCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Создать новую статью. Только для авторизованных."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    item = await CoreEngineLibPagesService.create_item(data)

    if not item:
        raise HTTPException(status_code=400, detail="Не удалось создать статью")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# ОБНОВЛЕНИЕ
# ========================================

@router.put("/item/{item_id}")
async def update_page_item(
    item_id: int,
    data: CoreEngineLibPagesItemUpdate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Обновить статью. Только для авторизованных."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    item = await CoreEngineLibPagesService.update_item(item_id, data)

    if not item:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ========================================
# УДАЛЕНИЕ (МЯГКОЕ)
# ========================================

@router.delete("/item/{item_id}")
async def delete_page_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Мягко удалить статью. Только для авторизованных."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await CoreEngineLibPagesService.delete_item(item_id)

    if not result:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    return JSONResponse({
        "success": True,
        "message": "Статья удалена",
    })


# ========================================
# ВОССТАНОВЛЕНИЕ
# ========================================

@router.post("/item/{item_id}/restore")
async def restore_page_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Восстановить удалённую статью. Только для авторизованных."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await CoreEngineLibPagesService.restore_item(item_id)

    if not result:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    return JSONResponse({
        "success": True,
        "message": "Статья восстановлена",
    })