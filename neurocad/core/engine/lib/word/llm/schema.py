# neurocad/core/engine/lib/word/llm/schema.py

"""
Pydantic-схемы для LLM-редактора (пресеты, чат, история).

На этом этапе — только пресеты.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime as dt


# ============================================
# ПРЕСЕТЫ (page_pres)
# ============================================

class LLMPresetBase(BaseModel):
    """Базовые поля пресета"""
    name: str = Field(..., min_length=1, max_length=255, description="Название")
    description: Optional[str] = Field(None, description="Описание")
    html: Optional[str] = Field(None, description="HTML пресета")


class LLMPresetCreate(LLMPresetBase):
    """Создание пресета"""
    pass


class LLMPresetUpdate(BaseModel):
    """Обновление пресета — все поля опциональны"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    html: Optional[str] = None


class LLMPresetItem(BaseModel):
    """Пресет для ответа"""
    id: int
    name: str
    description: Optional[str] = None
    html: Optional[str] = None
    thumbnail_path: Optional[str] = None
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None

    class Config:
        from_attributes = True


class LLMPresetListResponse(BaseModel):
    """Ответ со списком пресетов"""
    success: bool = True
    data: List[LLMPresetItem]
    total: int = 0


class LLMPresetItemResponse(BaseModel):
    """Ответ с одним пресетом"""
    success: bool = True
    data: LLMPresetItem


# ============================================
# ЗАГРУЗКА МИНИАТЮРЫ
# ============================================

class LLMPresetThumbnailResponse(BaseModel):
    """Ответ на загрузку миниатюры"""
    success: bool = True
    data: dict  # {"thumbnail_path": "presets/1.png"}

# ============================================
# ЧАТ
# ============================================

class LLMChatMessageCreate(BaseModel):
    """Запрос на отправку сообщения в чат"""
    message: str = Field(..., min_length=1, description="Текст сообщения пользователя")


class LLMChatMessage(BaseModel):
    """Одно сообщение чата"""
    id: Optional[int] = None
    role: str = Field(..., description="'user' | 'assistant' | 'system'")
    content: str
    model: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class LLMChatHistoryResponse(BaseModel):
    """Ответ с историей чата"""
    success: bool = True
    data: List[LLMChatMessage]


class LLMChatSendResponse(BaseModel):
    """Ответ на отправку сообщения"""
    success: bool = True
    data: dict   # { user_message, assistant_message, html }    