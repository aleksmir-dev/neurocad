# app/core/engine/lib/word/schema.py

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime as dt


# ============================================
# ОТВЕТ — одна страница (для bydatetime и item)
# ============================================

class CoreEngineLibWordItemResponse(BaseModel):
    """Одна страница для отображения/редактирования"""
    id: int
    datetime: dt
    title: str
    description: Optional[str] = None
    logo: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[str] = None
    is_active: int
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None
    rss_yandex_id: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================
# ОТВЕТ — обёртка для одной страницы
# ============================================

class CoreEngineLibWordPageResponse(BaseModel):
    """Обёртка ответа для одной страницы"""
    success: bool = True
    data: CoreEngineLibWordItemResponse


# ============================================
# СОХРАНЕНИЕ КОНТЕНТА
# ============================================

class CoreEngineLibWordSaveRequest(BaseModel):
    """
    Запрос на сохранение контента страницы из редактора.

    content = HTML для отображения.
    content_json = JSON GrapesJS (строка).
    """
    content: Optional[str] = Field(None, description="HTML для отображения")
    content_json: Optional[str] = Field(None, description="JSON GrapesJS")


class CoreEngineLibWordSaveResponse(BaseModel):
    """Ответ на сохранение контента"""
    success: bool = True
    data: dict


# ============================================
# АССЕТЫ (МЕДИАТЕКА)
# ============================================

class CoreEngineLibWordAsset(BaseModel):
    """Один ассет (изображение)"""
    src: str = Field(..., description="URL изображения")
    name: str = Field(..., description="Имя файла")
    type: str = Field("image", description="Тип ассета")


class CoreEngineLibWordAssetsResponse(BaseModel):
    """Ответ со списком ассетов"""
    success: bool = True
    data: List[CoreEngineLibWordAsset]


class CoreEngineLibWordUploadResponse(BaseModel):
    """Ответ на загрузку ассетов"""
    success: bool = True
    data: List[str] = Field(..., description="URL загруженных файлов")