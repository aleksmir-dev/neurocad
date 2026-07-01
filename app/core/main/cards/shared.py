# app/core/main/cards/shared.py

from datetime import datetime
from fastapi import HTTPException, Request
from sqlalchemy import select, update
from ....utils.sqlite import get_db_sqlite
from ...models import Setting, User, Node

async def set_root(node_id: int):
    """Сохраняет ID папки как корень общих документов"""
    async for session in get_db_sqlite():
        stmt = select(Setting).where(
            Setting.domain == "core",
            Setting.subsys == "node",
            Setting.module == "index",
            Setting.key == "root_node_id",
            Setting.is_delete == 0
        )
        result = await session.execute(stmt)
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.value = str(node_id)
            setting.updated_at = datetime.now()
        else:
            setting = Setting(
                domain="core",
                subsys="node",
                module="index",
                key="root_node_id",
                value=str(node_id),
                caption="Корневая папка общих документов",
                description="ID папки, которая будет отображаться в разделе 'Общие документы'"
            )
            session.add(setting)
        
        await session.commit()
        return True


async def remove_root(node_id: int):
    """Удаляет настройку, если папка перестала быть общей"""
    async for session in get_db_sqlite():
        stmt = select(Setting).where(
            Setting.domain == "core",
            Setting.subsys == "node",
            Setting.module == "index",
            Setting.key == "root_node_id",
            Setting.value == str(node_id),
            Setting.is_delete == 0
        )
        result = await session.execute(stmt)
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.is_delete = 1
            setting.updated_at = datetime.now()
            await session.commit()
            return True
        return False


async def get_root():
    async for session in get_db_sqlite():
        stmt = select(Setting).where(
            Setting.domain == "core",
            Setting.subsys == "node",
            Setting.module == "index",
            Setting.key == "root_node_id",
            Setting.is_delete == 0
        )
        result = await session.execute(stmt)
        setting = result.scalar_one_or_none()
        
        if setting and setting.value:
            return int(setting.value)
        return None


async def check_personal(section: int):
    if section != 2:
        raise HTTPException(status_code=403, detail="Операция разрешена только в личном пространстве")