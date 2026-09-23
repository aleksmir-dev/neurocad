# app/core/engine/lib/pages/schema.py

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime as dt


# ============================================
# БАЗОВАЯ СХЕМА
# ============================================

class CoreEngineLibPagesItemBase(BaseModel):
    """Базовые поля статьи"""
    datetime: Optional[dt] = Field(None, description="Дата и время публикации. Если не указана — ставится автоматически.")
    title: str = Field(..., min_length=1, max_length=255, description="Заголовок")
    description: Optional[str] = Field(None, description="Краткое описание")
    logo: Optional[str] = Field(None, description="Логотип (URL или emoji)")
    is_active: int = Field(1, description="Активна: 1 — да, 0 — нет")

    # Template system
    is_template: int = Field(0, description="Базовый шаблон: 1 — да, 0 — нет")
    template_id: Optional[int] = Field(None, description="ID базового шаблона (наследование)")


# ============================================
# СОЗДАНИЕ
# ============================================

class CoreEngineLibPagesItemCreate(CoreEngineLibPagesItemBase):
    """Создание статьи"""
    content: Optional[str] = Field(None, description="HTML для показа")
    content_json: Optional[str] = Field(None, description="JSON GrapesJS для редактора")


# ============================================
# ОБНОВЛЕНИЕ
# ============================================

class CoreEngineLibPagesItemUpdate(BaseModel):
    """Обновление статьи — все поля опциональны"""
    datetime: Optional[dt] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    logo: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[str] = None
    is_active: Optional[int] = None

    # Template system
    is_template: Optional[int] = None
    template_id: Optional[int] = None


# ============================================
# СПИСОК (без content/content_json)
# ============================================

class CoreEngineLibPagesItemListItem(BaseModel):
    """Статья для списка — без тяжёлых полей"""
    id: int
    datetime: dt
    title: str
    description: Optional[str] = None
    logo: Optional[str] = None
    is_active: int
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None
    rss_yandex_id: Optional[str] = None

    # Template system
    is_template: int = 0
    template_id: Optional[int] = None

    class Config:
        from_attributes = True


# ============================================
# ПОЛНАЯ СТАТЬЯ (с content/content_json)
# ============================================

class CoreEngineLibPagesItemResponse(CoreEngineLibPagesItemListItem):
    """Полная статья — с content и content_json"""
    content: Optional[str] = None
    content_json: Optional[str] = None


# ============================================
# СПИСОК СТАТЕЙ (ответ)
# ============================================

class CoreEngineLibPagesListResponse(BaseModel):
    """Ответ со списком статей"""
    items: list[CoreEngineLibPagesItemListItem]
    total: int = 0
    page: int = 1
    limit: int = 20