# app/core/node/index/modules/service.py

from typing import List, Dict, Any, Optional
from sqlalchemy import select
from .....utils.sqlite import get_db_sqlite
from ...models import Module
from .schema import ModuleCreate, ModuleUpdate
from datetime import datetime


async def get_modules_list(include_deleted: bool = False) -> List[Dict[str, Any]]:
    """Получить список всех модулей"""
    async for session in get_db_sqlite():
        stmt = select(Module)
        if not include_deleted:
            stmt = stmt.where(Module.is_delete == 0)
        stmt = stmt.order_by(Module.id)
        result = await session.execute(stmt)
        modules = result.scalars().all()
        
        return [
            {
                "id": m.id,
                "name": m.name,
                "description": m.description,
                "url": m.url,
                "is_delete": m.is_delete,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in modules
        ]


async def get_module_by_id(module_id: int) -> Optional[Dict[str, Any]]:
    """Получить модуль по ID"""
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == module_id)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        
        if not module:
            return None
        
        return {
            "id": module.id,
            "name": module.name,
            "description": module.description,
            "url": module.url,
            "is_delete": module.is_delete,
            "created_at": module.created_at.isoformat() if module.created_at else None
        }


async def create_module(data: ModuleCreate, current_user: dict) -> Module:
    """Создать новый модуль"""
    async for session in get_db_sqlite():
        module = Module(
            name=data.name,
            description=data.description,
            url=data.url
        )
        session.add(module)
        await session.commit()
        await session.refresh(module)
        return module


async def update_module(module_id: int, data: ModuleUpdate, current_user: dict) -> Optional[Module]:
    """Обновить модуль"""
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == module_id)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        
        if not module:
            return None
        
        if data.name is not None:
            module.name = data.name
        if data.description is not None:
            module.description = data.description
        if data.url is not None:
            module.url = data.url
        
        await session.commit()
        await session.refresh(module)
        return module


async def delete_module(module_id: int, current_user: dict, hard: bool = False) -> bool:
    """Удалить модуль (мягкое или жёсткое удаление)"""
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == module_id)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        
        if not module:
            return False
        
        if hard:
            await session.delete(module)
        else:
            module.is_delete = True
        
        await session.commit()
        return True


async def restore_module(module_id: int, current_user: dict) -> bool:
    """Восстановить модуль из удалённых"""
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == module_id, Module.is_delete == 1)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        
        if not module:
            return False
        
        module.is_delete = False
        await session.commit()
        return True