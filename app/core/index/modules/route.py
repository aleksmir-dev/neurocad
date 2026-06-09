# app/core/node/index/modules/route.py

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from typing import List, Optional
from .....utils.sqlite import get_db_sqlite
from .....utils.log import Log
from .....utils.templates import templates
from ...auth.dependencies import get_current_user
from .schema import ModuleCreate, ModuleUpdate
from .service import (
    get_modules_list,
    get_module_by_id,
    create_module,
    update_module,
    delete_module,
    restore_module
)

log = Log()

router = APIRouter(prefix="/modules", tags=["core/node/index/modules"])


@router.get("/modal", response_class=HTMLResponse)
async def get_modules_modal(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Возвращает HTML модального окна управления модулями"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    return templates.TemplateResponse("core/node/index/modules/modules.html", {
        "request": request
    })


@router.get("/list")
async def get_modules(
    request: Request,
    include_deleted: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Получить список модулей"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    modules = await get_modules_list(include_deleted=include_deleted)
    await log.log_info(target="modules", message="Список модулей загружен", data={"count": len(modules)})
    return {"modules": modules}


@router.get("/deleted")
async def get_deleted_modules(
    current_user: dict = Depends(get_current_user)
):
    """Получить список удалённых модулей"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    modules = await get_modules_list(include_deleted=True)
    deleted = [m for m in modules if m.get("is_delete")]
    return {"modules": deleted}


@router.post("/module/{module_id}/restore")
async def restore_module_endpoint(
    module_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Восстановить удалённый модуль"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    result = await restore_module(module_id, current_user)
    if not result:
        raise HTTPException(status_code=404, detail="Модуль не найден или не удалён")
    
    await log.log_info(target="modules", message=f"Модуль восстановлен", data={"module_id": module_id})
    return {"success": True}


@router.get("/module/{module_id}")
async def get_module(
    module_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Получить модуль по ID"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    module = await get_module_by_id(module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Модуль не найден")
    return {"module": module}


@router.post("/module")
async def create_module_endpoint(
    data: ModuleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Создать новый модуль"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    module = await create_module(data, current_user)
    await log.log_info(target="modules", message=f"Модуль создан", data={"module_id": module.id, "name": module.name})
    return {"success": True, "module": {
        "id": module.id,
        "name": module.name,
        "description": module.description,
        "url": module.url,
        "is_delete": module.is_delete
    }}


@router.put("/module/{module_id}")
async def update_module_endpoint(
    module_id: int,
    data: ModuleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Обновить модуль"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    module = await update_module(module_id, data, current_user)
    if not module:
        raise HTTPException(status_code=404, detail="Модуль не найден")
    
    await log.log_info(target="modules", message=f"Модуль обновлён", data={"module_id": module_id})
    return {"success": True, "module": {
        "id": module.id,
        "name": module.name,
        "description": module.description,
        "url": module.url,
        "is_delete": module.is_delete
    }}


@router.delete("/module/{module_id}")
async def delete_module_endpoint(
    module_id: int,
    hard: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Удалить модуль (мягкое или жёсткое удаление)"""
    if not current_user.get('is_superadmin', False):
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    
    result = await delete_module(module_id, current_user, hard=hard)
    if not result:
        raise HTTPException(status_code=404, detail="Модуль не найден")
    
    await log.log_info(target="modules", message=f"Модуль удалён", data={"module_id": module_id, "hard": hard})
    return {"success": True}