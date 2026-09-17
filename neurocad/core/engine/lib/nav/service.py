# app/core/engine/lib/nav/service.py

from sqlalchemy import select
from datetime import datetime
from typing import Optional, List, Dict, Any
from ....models.base import Nav, Module, Setting
from .schema import (
    CoreEngineLibNavItemCreate,
    CoreEngineLibNavItemUpdate
)
from neurocad.utils.sqlite import get_db_sqlite


class CoreEngineLibNavService:
    """Сервис для работы с элементами навигации"""
    
    # ========================================
    # ROOT (корневая карточка для общего раздела)
    # ========================================
    
    @staticmethod
    async def get_root() -> Optional[int]:
        """Получить ID корневой карточки общего раздела"""
        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == "core",
                Setting.subsys == "nav",
                Setting.module == "index",
                Setting.key == "root_card_id",
                Setting.is_delete == 0
            )
            result = await session.execute(stmt)
            setting = result.scalar_one_or_none()
            
            if setting and setting.value:
                return int(setting.value)
            return None
    
    @staticmethod
    async def set_root(card_id: int) -> bool:
        """Установить корневую карточку общего раздела"""
        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == "core",
                Setting.subsys == "nav",
                Setting.module == "index",
                Setting.key == "root_card_id",
                Setting.is_delete == 0
            )
            result = await session.execute(stmt)
            setting = result.scalar_one_or_none()
            
            if setting:
                setting.value = str(card_id)
                setting.updated_at = datetime.now()
            else:
                setting = Setting(
                    domain="core",
                    subsys="nav",
                    module="index",
                    key="root_card_id",
                    value=str(card_id),
                    caption="Корневая карточка общих документов",
                    description="ID карточки, которая будет отображаться в разделе 'Общие документы'"
                )
                session.add(setting)
            
            await session.commit()
            return True
    
    @staticmethod
    async def remove_root(card_id: int) -> bool:
        """Удалить настройку корневой карточки"""
        async for session in get_db_sqlite():
            stmt = select(Setting).where(
                Setting.domain == "core",
                Setting.subsys == "nav",
                Setting.module == "index",
                Setting.key == "root_card_id",
                Setting.value == str(card_id),
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
    
    # ========================================
    # ITEMS (элементы навигации)
    # ========================================
    
    @staticmethod
    async def get_items(
        user_id: int,
        section: int = 2,
        parent_id: Optional[int] = None,
        is_delete: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Получить элементы навигации для текущего уровня.
        
        section=1 — общий раздел (user_id=0)
        section=2 — личный раздел (user_id=current_user)
        """
        query_user_id = 0 if section == 1 else user_id
        
        query_parent_id = parent_id
        if section == 1 and query_parent_id is None:
            query_parent_id = await CoreEngineLibNavService.get_root()
            if query_parent_id is None:
                return []
        
        async for session in get_db_sqlite():
            stmt = select(Nav, Module.url).outerjoin(
                Module, Nav.module_id == Module.id
            ).where(
                Nav.user_id == query_user_id,
                Nav.is_delete == is_delete
            )
            
            if query_parent_id is None:
                stmt = stmt.where(Nav.parent_id.is_(None))
            else:
                stmt = stmt.where(Nav.parent_id == query_parent_id)
            
            stmt = stmt.order_by(Nav.card_type.desc(), Nav.sort_order, Nav.name)
            
            result = await session.execute(stmt)
            rows = result.all()
            
            items = []
            for row in rows:
                item = row.Nav
                items.append({
                    "id": item.id,
                    "parent_id": item.parent_id,
                    "card_type": item.card_type,
                    "sort_order": item.sort_order,
                    "name": item.name,
                    "description": item.description,
                    "icon": item.icon,
                    "module_id": item.module_id,
                    "url": row.url,
                    "is_delete": item.is_delete,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "updated_at": item.updated_at.isoformat() if item.updated_at else None
                })
            
            return items
        return []
    
    @staticmethod
    async def get_deleted_items(
        user_id: int,
        section: int = 2
    ) -> List[Dict[str, Any]]:
        """Получить удаленные элементы"""
        return await CoreEngineLibNavService.get_items(
            user_id=user_id,
            section=section,
            parent_id=None,
            is_delete=True
        )
    
    @staticmethod
    async def get_item(
        user_id: int,
        item_id: int,
        section: int = 2
    ) -> Optional[Dict[str, Any]]:
        """Получить один элемент по ID"""
        query_user_id = 0 if section == 1 else user_id
        
        async for session in get_db_sqlite():
            stmt = select(Nav).where(
                Nav.id == item_id,
                Nav.user_id == query_user_id,
                Nav.is_delete == False
            )
            result = await session.execute(stmt)
            item = result.scalar_one_or_none()
            
            if not item:
                return None
            
            return {
                "id": item.id,
                "parent_id": item.parent_id,
                "card_type": item.card_type,
                "sort_order": item.sort_order,
                "name": item.name,
                "description": item.description,
                "icon": item.icon,
                "module_id": item.module_id,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None
            }
        return None
    
    @staticmethod
    async def create_item(
        user_id: int,
        data: CoreEngineLibNavItemCreate,
        section: int = 2,
        is_superadmin: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Создать новый элемент навигации"""
        query_user_id = 0 if section == 1 else user_id
        
        parent_id = data.parent_id
        if parent_id is None and section == 1:
            parent_id = await CoreEngineLibNavService.get_root()
            if parent_id is None:
                return None
        
        async for session in get_db_sqlite():
            if parent_id is not None:
                stmt = select(Nav).where(
                    Nav.id == parent_id,
                    Nav.user_id == query_user_id,
                    Nav.is_delete == False
                )
                result = await session.execute(stmt)
                parent = result.scalar_one_or_none()
                if not parent:
                    return None
            
            new_item = Nav(
                user_id=query_user_id,
                parent_id=parent_id,
                card_type=data.card_type,
                sort_order=data.sort_order or 0,
                name=data.name.strip(),
                description=data.description,
                icon=data.icon,
                module_id=data.module_id,
                is_delete=False,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            session.add(new_item)
            await session.flush()
            
            if data.card_type == 'folder' and section == 1 and is_superadmin:
                await CoreEngineLibNavService.set_root(new_item.id)
            
            await session.commit()
            await session.refresh(new_item)
            
            return {
                "id": new_item.id,
                "parent_id": new_item.parent_id,
                "card_type": new_item.card_type,
                "sort_order": new_item.sort_order,
                "name": new_item.name,
                "description": new_item.description,
                "icon": new_item.icon,
                "module_id": new_item.module_id,
                "created_at": new_item.created_at.isoformat() if new_item.created_at else None,
                "updated_at": new_item.updated_at.isoformat() if new_item.updated_at else None
            }
        return None
    
    @staticmethod
    async def update_item(
        user_id: int,
        item_id: int,
        data: CoreEngineLibNavItemUpdate,
        section: int = 2
    ) -> Optional[Dict[str, Any]]:
        """Обновить элемент навигации"""
        query_user_id = 0 if section == 1 else user_id
        
        async for session in get_db_sqlite():
            stmt = select(Nav).where(
                Nav.id == item_id,
                Nav.user_id == query_user_id,
                Nav.is_delete == False
            )
            result = await session.execute(stmt)
            item = result.scalar_one_or_none()
            
            if not item:
                return None
            
            update_data = data.dict(exclude_unset=True)
            for key, value in update_data.items():
                if hasattr(item, key) and value is not None:
                    setattr(item, key, value)
            
            item.updated_at = datetime.now()
            await session.commit()
            await session.refresh(item)
            
            return {
                "id": item.id,
                "parent_id": item.parent_id,
                "card_type": item.card_type,
                "sort_order": item.sort_order,
                "name": item.name,
                "description": item.description,
                "icon": item.icon,
                "module_id": item.module_id,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None
            }
        return None
    
    @staticmethod
    async def delete_item(
        user_id: int,
        item_id: int,
        section: int = 2
    ) -> bool:
        """Мягкое удаление элемента навигации"""
        query_user_id = 0 if section == 1 else user_id
        
        async for session in get_db_sqlite():
            stmt = select(Nav).where(
                Nav.id == item_id,
                Nav.user_id == query_user_id,
                Nav.is_delete == False
            )
            result = await session.execute(stmt)
            item = result.scalar_one_or_none()
            
            if not item:
                return False
            
            item.is_delete = True
            item.updated_at = datetime.now()
            await session.commit()
            return True
        return False
    
    @staticmethod
    async def restore_item(
        user_id: int,
        item_id: int,
        section: int = 2
    ) -> bool:
        """Восстановление элемента навигации"""
        query_user_id = 0 if section == 1 else user_id
        
        async for session in get_db_sqlite():
            stmt = select(Nav).where(
                Nav.id == item_id,
                Nav.user_id == query_user_id,
                Nav.is_delete == True
            )
            result = await session.execute(stmt)
            item = result.scalar_one_or_none()
            
            if not item:
                return False
            
            item.is_delete = False
            item.updated_at = datetime.now()
            await session.commit()
            return True
        return False
    
    @staticmethod
    async def has_children(user_id: int, item_id: int, section: int = 2) -> bool:
        """Проверить, есть ли у элемента дочерние элементы"""
        query_user_id = 0 if section == 1 else user_id
        
        async for session in get_db_sqlite():
            stmt = select(Nav).where(
                Nav.user_id == query_user_id,
                Nav.parent_id == item_id,
                Nav.is_delete == False
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        return False