# app/core/engine/lib/nav/schema.py

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CoreEngineLibNavItemBase(BaseModel):
    """Базовые поля элемента навигации"""
    parent_id: Optional[int] = Field(None, description="ID родительского элемента")
    card_type: str = Field(..., description="Тип элемента: folder или module")
    sort_order: Optional[int] = Field(0, description="Порядок сортировки")
    name: str = Field(..., min_length=1, max_length=128, description="Название")
    description: Optional[str] = Field(None, max_length=255, description="Описание")
    icon: Optional[str] = Field(None, max_length=64, description="Иконка (эмодзи или путь)")
    module_id: Optional[int] = Field(None, description="ID модуля (если card_type='module')")


class CoreEngineLibNavItemCreate(CoreEngineLibNavItemBase):
    """Создание элемента навигации"""
    pass


class CoreEngineLibNavItemUpdate(BaseModel):
    """Обновление элемента навигации"""
    parent_id: Optional[int] = None
    card_type: Optional[str] = None
    sort_order: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=64)
    module_id: Optional[int] = None


class CoreEngineLibNavItemResponse(CoreEngineLibNavItemBase):
    """Ответ с данными элемента навигации"""
    id: int
    is_delete: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CoreEngineLibNavTreeResponse(BaseModel):
    """Ответ со списком элементов для текущего уровня"""
    items: list[CoreEngineLibNavItemResponse]
    parent_id: Optional[int] = None
    has_parent: bool = False