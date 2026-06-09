# app/core/node/index/permissions/route.py

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, List
from sqlalchemy import select, update, delete
from .....utils.sqlite import get_db_sqlite
from .....utils.templates import templates
from ...auth.dependencies import get_current_user
from ...models import UserModulePermission, User, Module

router = APIRouter(prefix="/permissions", tags=["core/node/index/permissions"])


@router.get("/module/{module_key}")
async def get_module_permissions(
    module_key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Получить список разрешений для модуля.
    Возвращает список пользователей с их правами на чтение/запись.
    """
    async for session in get_db_sqlite():
        try:
            # Проверяем, что текущий пользователь может управлять доступом
            # (только суперадмин)
            if not current_user.get("is_superadmin"):
                raise HTTPException(status_code=403, detail="Только суперадмин может управлять правами доступа")
            
            # Получаем модуль
            stmt = select(Module).where(
                Module.key == module_key,
                Module.is_delete == False
            )
            result = await session.execute(stmt)
            module = result.scalar_one_or_none()
            
            if not module:
                raise HTTPException(status_code=404, detail=f"Модуль {module_key} не найден")
            
            # Получаем всех активных пользователей
            stmt = select(User).where(
                User.is_active == True,
                User.is_delete == False
            )
            result = await session.execute(stmt)
            users = result.scalars().all()
            
            # Получаем существующие разрешения для модуля
            stmt = select(UserModulePermission).where(
                UserModulePermission.module_key == module_key,
                UserModulePermission.is_delete == False
            )
            result = await session.execute(stmt)
            permissions = result.scalars().all()
            
            # Создаём словарь для быстрого доступа к разрешениям
            perm_dict = {p.user_id: p for p in permissions}
            
            # Формируем ответ
            result_list = []
            for user in users:
                perm = perm_dict.get(user.id)
                result_list.append({
                    "user_id": user.id,
                    "user_name": user.name or user.login,
                    "can_read": perm.can_read if perm else False,
                    "can_write": perm.can_write if perm else False,
                    "has_permission": perm is not None
                })
            
            return {
                "module_key": module_key,
                "module_name": module.name,
                "users": result_list
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка получения прав: {e}")
        finally:
            await session.close()
            return


@router.post("/module/{module_key}")
async def set_module_permissions(
    module_key: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Установить разрешения для модуля.
    Ожидает JSON: {"permissions": [{"user_id": 1, "can_read": true, "can_write": false}, ...]}
    """
    async for session in get_db_sqlite():
        try:
            # Проверяем, что текущий пользователь может управлять доступом
            if not current_user.get("is_superadmin"):
                raise HTTPException(status_code=403, detail="Только суперадмин может управлять правами доступа")
            
            # Получаем данные запроса
            data = await request.json()
            permissions_data = data.get("permissions", [])
            
            # Проверяем существование модуля
            stmt = select(Module).where(
                Module.key == module_key,
                Module.is_delete == False
            )
            result = await session.execute(stmt)
            module = result.scalar_one_or_none()
            
            if not module:
                raise HTTPException(status_code=404, detail=f"Модуль {module_key} не найден")
            
            updated_count = 0
            created_count = 0
            
            for perm_data in permissions_data:
                user_id = perm_data.get("user_id")
                can_read = perm_data.get("can_read", False)
                can_write = perm_data.get("can_write", False)
                
                # Проверяем существование пользователя
                stmt = select(User).where(
                    User.id == user_id,
                    User.is_active == True,
                    User.is_delete == False
                )
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()
                
                if not user:
                    continue
                
                # Ищем существующую запись
                stmt = select(UserModulePermission).where(
                    UserModulePermission.user_id == user_id,
                    UserModulePermission.module_key == module_key,
                    UserModulePermission.is_delete == False
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()
                
                from datetime import datetime
                
                if existing:
                    # Обновляем существующую запись
                    existing.can_read = can_read
                    existing.can_write = can_write
                    existing.updated_at = datetime.now()
                    updated_count += 1
                else:
                    # Создаём новую запись
                    new_perm = UserModulePermission(
                        user_id=user_id,
                        module_key=module_key,
                        can_read=can_read,
                        can_write=can_write,
                        is_delete=False
                    )
                    session.add(new_perm)
                    created_count += 1
            
            await session.commit()
            
            return {
                "status": "success",
                "message": f"Права доступа обновлены",
                "created": created_count,
                "updated": updated_count,
                "module_key": module_key,
                "module_name": module.name
            }
            
        except HTTPException:
            raise
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Ошибка установки прав: {e}")
        finally:
            await session.close()
            return


@router.get("/user/{user_id}")
async def get_user_permissions(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Получить все разрешения пользователя на модули.
    """
    async for session in get_db_sqlite():
        try:
            # Проверяем права (только суперадмин или сам пользователь)
            if not current_user.get("is_superadmin") and current_user.get("id") != user_id:
                raise HTTPException(status_code=403, detail="Нет прав на просмотр прав другого пользователя")
            
            # Получаем пользователя
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete == False
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            
            # Получаем все разрешения пользователя
            stmt = select(UserModulePermission).where(
                UserModulePermission.user_id == user_id,
                UserModulePermission.is_delete == False
            )
            result = await session.execute(stmt)
            permissions = result.scalars().all()
            
            # Получаем все активные модули
            stmt = select(Module).where(
                Module.is_active == True,
                Module.is_delete == False
            )
            result = await session.execute(stmt)
            modules = result.scalars().all()
            
            # Формируем словарь для быстрого доступа
            perm_dict = {p.module_key: p for p in permissions}
            
            result_list = []
            for module in modules:
                perm = perm_dict.get(module.key)
                result_list.append({
                    "module_key": module.key,
                    "module_name": module.name,
                    "can_read": perm.can_read if perm else False,
                    "can_write": perm.can_write if perm else False,
                    "has_permission": perm is not None
                })
            
            return {
                "user_id": user_id,
                "user_name": user.name or user.login,
                "permissions": result_list
            }
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка получения прав: {e}")
        finally:
            await session.close()
            return


@router.delete("/module/{module_key}/user/{user_id}")
async def remove_user_permission(
    module_key: str,
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Удалить все разрешения пользователя на модуль (мягкое удаление).
    """
    async for session in get_db_sqlite():
        try:
            if not current_user.get("is_superadmin"):
                raise HTTPException(status_code=403, detail="Только суперадмин может удалять права доступа")
            
            from datetime import datetime
            
            stmt = update(UserModulePermission).where(
                UserModulePermission.user_id == user_id,
                UserModulePermission.module_key == module_key,
                UserModulePermission.is_delete == False
            ).values(
                is_delete=True,
                updated_at=datetime.now()
            )
            result = await session.execute(stmt)
            await session.commit()
            
            if result.rowcount == 0:
                return {
                    "status": "info",
                    "message": "Разрешения не найдены или уже удалены"
                }
            
            return {
                "status": "success",
                "message": f"Права пользователя на модуль {module_key} удалены"
            }
            
        except HTTPException:
            raise
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=500, detail=f"Ошибка удаления прав: {e}")
        finally:
            await session.close()
            return