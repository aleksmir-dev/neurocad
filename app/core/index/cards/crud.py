# app/core/node/index/cards/crud.py

from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Request
from sqlalchemy import select
from .....utils.sqlite import get_db_sqlite
from ...models import Node, Table, Module, Setting
from .shared import get_root, set_root, remove_root
from .schema import CoreNodeIndexCardsNode
from .....config import settings


async def create(request: Request, data: CoreNodeIndexCardsNode, current_user: dict, section: int):
    log = request.app.state.log  
    user_id = current_user["id"]
    
    await log.log_info(target="cards", message=f"CREATE: Начало создания узла", data={"user_id": user_id, "type": data.type, "name": data.name, "section": section})
    
    if not data.name or not data.name.strip():
        await log.log_error(target="cards", message=f"CREATE: Пустое название узла")
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    
    parent_id = data.parent_id
    if parent_id is None:
        if section == 1:
            parent_id = await get_root()
            if parent_id is None:
                await log.log_error(target="cards", message=f"CREATE: Общий раздел не настроен")
                raise HTTPException(status_code=404, detail="Общий раздел не настроен")
    
    async for session in get_db_sqlite():
        new_node = Node(
            user_id=user_id if section == 2 else 0,
            parent_id=parent_id,
            node_type=data.type,
            name=data.name.strip(),
            description=data.description,
            sort_order=0
        )
        
        table_id = None
        if data.type == 'table':
            await log.log_info(target="cards", message=f"CREATE: Создание таблицы")
            new_table = Table(
                user_id=user_id if section == 2 else 0,
                name=data.name.strip(),
                description=data.description,
                columns_json="{}",
                data_json="{}"
            )
            session.add(new_table)
            await session.flush()
            table_id = new_table.id
            new_node.table_id = table_id
        
        if data.type == 'module' and data.module_id:
            stmt = select(Module).where(Module.id == data.module_id)
            result = await session.execute(stmt)
            module = result.scalar_one_or_none()
            if module:
                new_node.module_id = module.id
                await log.log_info(target="cards", message=f"CREATE: Модуль привязан", data={"module_id": module.id})
        
        session.add(new_node)
        await session.flush()
        
        if data.type == 'folder' and section == 1 and current_user.get("is_superadmin"):
            await log.log_info(target="cards", message=f"CREATE: Установка корневой папки", data={"node_id": new_node.id})
            await set_root(new_node.id)
        
        await session.commit()
        await session.refresh(new_node)
        
        await log.log_info(target="cards", message=f"CREATE: Узел успешно создан", data={"node_id": new_node.id, "name": new_node.name})
        
        return {
            "success": True,
            "node": {
                "id": new_node.id,
                "name": new_node.name,
                "description": new_node.description,
                "node_type": new_node.node_type,
                "table_id": table_id,
                "module_id": new_node.module_id
            }
        }


async def update(request: Request, node_id: int, data: dict, current_user: dict, section: int):
    log = request.app.state.log  # ← исправлено
    await log.log_info(target="cards", message=f"UPDATE: Начало обновления узла", data={"node_id": node_id, "user_id": current_user['id'], "section": section})
    
    if section != 2:
        await log.log_error(target="cards", message=f"UPDATE: Редактирование разрешено только в личном пространстве")
        raise HTTPException(status_code=403, detail="Редактирование разрешено только в личном пространстве")
    
    name = data.get("name")
    description = data.get("description")
    is_shared = data.get("is_shared", False)
    
    if not name:
        await log.log_error(target="cards", message=f"UPDATE: Пустое название узла")
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    
    async for session in get_db_sqlite():
        stmt = select(Node).where(Node.id == node_id, Node.user_id == current_user["id"])
        result = await session.execute(stmt)
        node = result.scalar_one_or_none()
        
        if not node:
            await log.log_error(target="cards", message=f"UPDATE: Узел не найден", data={"node_id": node_id})
            raise HTTPException(status_code=404, detail="Node not found")
        
        old_name = node.name
        old_desc = node.description
        
        node.name = name
        node.description = description
        node.updated_at = datetime.now()
        
        await log.log_info(target="cards", message=f"UPDATE: Изменения", data={"old_name": old_name, "new_name": name, "old_desc": old_desc, "new_desc": description})
        
        if node.node_type == 'folder':
            if is_shared and current_user.get("is_superadmin"):
                await log.log_info(target="cards", message=f"UPDATE: Установка корневой папки", data={"node_id": node_id})
                await set_root(node_id)
            elif not is_shared:
                await log.log_info(target="cards", message=f"UPDATE: Удаление корневой папки", data={"node_id": node_id})
                await remove_root(node_id)
        
        await session.commit()
        await log.log_info(target="cards", message=f"UPDATE: Узел успешно обновлён", data={"node_id": node_id})
        return {"success": True}


async def delete(request: Request, node_id: int, current_user: dict, section: int):
    log = request.app.state.log  # ← исправлено
    await log.log_info(target="cards", message=f"DELETE: Начало удаления узла", data={"node_id": node_id, "user_id": current_user['id'], "section": section})
    
    if section != 2:
        await log.log_error(target="cards", message=f"DELETE: Удаление разрешено только в личном пространстве")
        raise HTTPException(status_code=403, detail="Удаление разрешено только в личном пространстве")
    
    async for session in get_db_sqlite():
        stmt = select(Node).where(Node.id == node_id, Node.user_id == current_user["id"])
        result = await session.execute(stmt)
        node = result.scalar_one_or_none()
        
        if not node:
            await log.log_error(target="cards", message=f"DELETE: Узел не найден", data={"node_id": node_id})
            raise HTTPException(status_code=404, detail="Node not found")
        
        node.is_delete = 1
        await session.commit()
        
        await log.log_info(target="cards", message=f"DELETE: Узел успешно удалён", data={"node_id": node_id, "name": node.name})
        return {"success": True}


async def restore(request: Request, node_id: int, current_user: dict, section: int):
    log = request.app.state.log  # ← исправлено
    await log.log_info(target="cards", message=f"RESTORE: Начало восстановления узла", data={"node_id": node_id, "user_id": current_user['id'], "section": section})
    
    if section != 2:
        await log.log_error(target="cards", message=f"RESTORE: Восстановление разрешено только в личном пространстве")
        raise HTTPException(status_code=403, detail="Восстановление разрешено только в личном пространстве")
    
    async for session in get_db_sqlite():
        stmt = select(Node).where(Node.id == node_id, Node.user_id == current_user["id"])
        result = await session.execute(stmt)
        node = result.scalar_one_or_none()
        
        if not node:
            await log.log_error(target="cards", message=f"RESTORE: Узел не найден", data={"node_id": node_id})
            raise HTTPException(status_code=404, detail="Node not found")
        
        node.is_delete = 0
        await session.commit()
        
        await log.log_info(target="cards", message=f"RESTORE: Узел успешно восстановлен", data={"node_id": node_id, "name": node.name})
        return {"success": True}


async def get(node_id: int, current_user: dict):
    async for session in get_db_sqlite():
        stmt = select(Node).where(Node.id == node_id)
        result = await session.execute(stmt)
        node = result.scalar_one_or_none()
        
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        
        if node.user_id != 0 and node.user_id != current_user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        is_shared = (node.user_id == 0)
        
        return {
            "id": node.id,
            "name": node.name,
            "description": node.description,
            "node_type": node.node_type,
            "is_shared": is_shared,
            "module_id": node.module_id
        }


async def get_list(
    parent_id: Optional[int], 
    current_user: dict, 
    section: int,
    is_delete: bool = False
):
    user_id = current_user["id"]
    is_superadmin = current_user.get("is_superadmin", False)
    
    # Получаем списки ID пользователей, которым разрешён доступ
    crm_allowed_ids = settings.crm_issue_days_allowed_ids
    sudpo_allowed_ids = settings.sudpo_issue_themcomp_allowed_ids
    print(f'CRM allowed IDs: {crm_allowed_ids}')
    print(f'SUDPO allowed IDs: {sudpo_allowed_ids}')
    
    async for session in get_db_sqlite():
        root_id = parent_id
        if section == 1:
            if root_id is None:
                root_id = await get_root()
            if root_id is None:
                return []
        
        # JOIN с таблицей modules для получения url
        stmt = select(Node, Module.url).outerjoin(
            Module, Node.module_id == Module.id
        ).where(Node.is_delete == is_delete)
        
        if not is_delete:
            stmt = stmt.where(Node.parent_id == root_id)
        
        if section == 2:
            stmt = stmt.where(Node.user_id == user_id)
        
        stmt = stmt.order_by(Node.sort_order, Node.name)
        result = await session.execute(stmt)
        rows = result.all()
        
        nodes = []
        for row in rows:
            node = row.Node
            node_url = row.url if node.node_type == 'module' else None
            
            # Проверка доступа для модулей
            if node.node_type == 'module':
                # module_id = 1 (CRM issue days)
                if node.module_id == 1:
                    if not is_superadmin and user_id not in crm_allowed_ids:
                        print(f'Доступ запрещён для user_id={user_id} к module_id=1')
                        continue
                # module_id = 2 (SUDPO issue themcomp)
                elif node.module_id == 2:
                    if not is_superadmin and user_id not in sudpo_allowed_ids:
                        print(f'Доступ запрещён для user_id={user_id} к module_id=2')
                        continue
                # Для остальных модулей - доступ без ограничений
            
            nodes.append({
                "id": node.id,
                "name": node.name,
                "description": node.description,
                "node_type": node.node_type,
                "table_id": node.table_id,
                "module_id": node.module_id,
                "url": node_url
            })
        
        return nodes


async def get_deleted(current_user: dict, section: int):
    return await get_list(None, current_user, section, is_delete=True)