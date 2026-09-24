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
    css: Optional[str] = None
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

    content      = HTML для отображения (без <style>).
    content_json = JSON GrapesJS (строка).
    css          = CSS страницы (из editor.getCss()).
    """
    content: Optional[str] = Field(None, description="HTML для отображения")
    content_json: Optional[str] = Field(None, description="JSON GrapesJS")
    css: Optional[str] = Field(None, description="CSS страницы")


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


# ============================================
# ИСТОРИЯ ИЗМЕНЕНИЙ (page_hist)
# ============================================

class CoreEngineLibWordHistoryItem(BaseModel):
    """
    Метаданные одного снимка истории.

    Не включает html / content_json / css (тяжёлые поля) —
    для полного снимка используйте GET /{page_id}/history/{hist_id}.
    """
    id: int
    action: Optional[str] = Field(
        None,
        description="user_edit | ai_edit | preset_apply | rollback",
    )
    note: Optional[str] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordHistoryListResponse(BaseModel):
    """Ответ со списком снимков (метаданные, без html/content_json/css)"""
    success: bool = True
    data: List[CoreEngineLibWordHistoryItem]


class CoreEngineLibWordHistoryItemResponse(BaseModel):
    """
    Полный снимок истории — html + content_json + css.

    Используется для превью и для отката.
    """
    id: int
    page_id: int
    html: str
    content_json: Optional[str] = None
    css: Optional[str] = None
    action: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordHistoryItemFullResponse(BaseModel):
    """Обёртка ответа для одного полного снимка"""
    success: bool = True
    data: CoreEngineLibWordHistoryItemResponse


class CoreEngineLibWordRollbackResponse(BaseModel):
    """
    Ответ на откат к снимку.

    Возвращает обновлённые content / content_json / css / updated_at —
    чтобы фронтенд мог сразу обновить состояние без повторного GET.
    """
    success: bool = True
    data: dict