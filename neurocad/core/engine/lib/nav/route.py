# app/core/engine/lib/nav/route.py

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Optional

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibNavService
from .schema import (
    CoreEngineLibNavItemCreate,
    CoreEngineLibNavItemUpdate,
)

router = APIRouter(prefix="/nav", tags=["core/engine/lib/nav"])


@router.get("/list")
async def get_nav_list(
    parent_id: Optional[int] = None,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Получить список элементов навигации для текущего уровня."""
    user_id = current_user["id"]
    items = await CoreEngineLibNavService.get_items(
        user_id=user_id,
        section=section,
        parent_id=parent_id,
        is_delete=False
    )
    
    return JSONResponse({
        "success": True,
        "data": items
    })


@router.get("/deleted")
async def get_deleted_list(
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Получить список удаленных элементов навигации."""
    user_id = current_user["id"]
    items = await CoreEngineLibNavService.get_deleted_items(
        user_id=user_id,
        section=section
    )
    
    return JSONResponse({
        "success": True,
        "data": items
    })


@router.get("/item/{item_id}")
async def get_nav_item(
    item_id: int,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Получить один элемент навигации по ID."""
    user_id = current_user["id"]
    item = await CoreEngineLibNavService.get_item(
        user_id=user_id,
        item_id=item_id,
        section=section
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    
    return JSONResponse({
        "success": True,
        "data": item
    })


@router.post("/item")
async def create_nav_item(
    data: CoreEngineLibNavItemCreate,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Создать новый элемент навигации (папку или модуль)."""
    user_id = current_user["id"]
    is_superadmin = current_user.get("is_superadmin", False)
    
    item = await CoreEngineLibNavService.create_item(
        user_id=user_id,
        data=data,
        section=section,
        is_superadmin=is_superadmin
    )
    
    if not item:
        raise HTTPException(status_code=400, detail="Не удалось создать элемент")
    
    return JSONResponse({
        "success": True,
        "data": item
    })


@router.put("/item/{item_id}")
async def update_nav_item(
    item_id: int,
    data: CoreEngineLibNavItemUpdate,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Обновить элемент навигации."""
    user_id = current_user["id"]
    item = await CoreEngineLibNavService.update_item(
        user_id=user_id,
        item_id=item_id,
        data=data,
        section=section
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    
    return JSONResponse({
        "success": True,
        "data": item
    })


@router.delete("/item/{item_id}")
async def delete_nav_item(
    item_id: int,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Удалить элемент навигации (мягкое удаление)."""
    user_id = current_user["id"]
    result = await CoreEngineLibNavService.delete_item(
        user_id=user_id,
        item_id=item_id,
        section=section
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    
    return JSONResponse({
        "success": True,
        "message": "Элемент удалён"
    })


@router.post("/item/{item_id}/restore")
async def restore_nav_item(
    item_id: int,
    section: int = Query(2, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Восстановить удаленный элемент навигации."""
    user_id = current_user["id"]
    result = await CoreEngineLibNavService.restore_item(
        user_id=user_id,
        item_id=item_id,
        section=section
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    
    return JSONResponse({
        "success": True,
        "message": "Элемент восстановлен"
    })


@router.get("/shared-root")
async def get_shared_root(
    current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """Получить ID корневой карточки общего раздела."""
    root_id = await CoreEngineLibNavService.get_root()
    
    return JSONResponse({
        "success": True,
        "data": {
            "root_card_id": root_id
        }
    })