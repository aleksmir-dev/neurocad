# neurocad/core/engine/lib/word/llm/schema.py

"""
Pydantic schemas for LLM editor (presets, chat, history).

Namespace: CoreEngineLibWordLlm*
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime as dt


# ============================================
# PRESETS (page_pres)
# ============================================

class CoreEngineLibWordLlmPresetBase(BaseModel):
    """Base preset fields"""
    name: str = Field(..., min_length=1, max_length=255, description="Название")
    description: Optional[str] = Field(None, description="Описание")
    html: Optional[str] = Field(None, description="HTML пресета")
    css: Optional[str] = Field(None, description="CSS пресета")


class CoreEngineLibWordLlmPresetCreate(CoreEngineLibWordLlmPresetBase):
    """Create preset"""
    pass


class CoreEngineLibWordLlmPresetUpdate(BaseModel):
    """Update preset — all fields optional"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    html: Optional[str] = None
    css: Optional[str] = None


class CoreEngineLibWordLlmPresetItem(BaseModel):
    """Preset for response"""
    id: int
    name: str
    description: Optional[str] = None
    html: Optional[str] = None
    css: Optional[str] = None
    thumbnail_path: Optional[str] = None
    is_delete: int
    created_at: Optional[dt] = None
    updated_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordLlmPresetListResponse(BaseModel):
    """Response with preset list"""
    success: bool = True
    data: List[CoreEngineLibWordLlmPresetItem]
    total: int = 0


class CoreEngineLibWordLlmPresetItemResponse(BaseModel):
    """Response with a single preset"""
    success: bool = True
    data: CoreEngineLibWordLlmPresetItem


# ============================================
# THUMBNAIL UPLOAD
# ============================================

class CoreEngineLibWordLlmPresetThumbnailResponse(BaseModel):
    """Response for thumbnail upload"""
    success: bool = True
    data: dict  # {"thumbnail_path": "presets/1.png"}


# ============================================
# CHAT
# ============================================

class CoreEngineLibWordLlmBlockItem(BaseModel):
    """
    One block in the catalog sent from the frontend.

    The catalog is assembled by chat.js from the currently registered
    GrapesJS blocks and sent with every chat message. The backend embeds
    it into the system prompt, so the model assembles pages from the
    existing blocks instead of inventing markup.
    """
    id: str = Field(..., description="GrapesJS block id, e.g. 'core-hero'")
    label: str = Field(..., description="Human-readable name, e.g. 'Hero (баннер)'")
    category: str = Field(..., description="Category name, e.g. 'Секции'")
    html: str = Field("", description="Ready-to-use HTML fragment")


class CoreEngineLibWordLlmChatMessageCreate(BaseModel):
    """Request to send a chat message"""
    message: str = Field(..., min_length=1, description="Текст сообщения пользователя")
    block_catalog: Optional[List[CoreEngineLibWordLlmBlockItem]] = Field(
        None,
        description="Каталог блоков, собранный на фронте. Передаётся в системный промпт.",
    )


class CoreEngineLibWordLlmChatMessage(BaseModel):
    """Single chat message"""
    id: Optional[int] = None
    role: str = Field(..., description="'user' | 'assistant' | 'system'")
    content: str
    model: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    created_at: Optional[dt] = None

    class Config:
        from_attributes = True


class CoreEngineLibWordLlmChatHistoryResponse(BaseModel):
    """Response with chat history"""
    success: bool = True
    data: List[CoreEngineLibWordLlmChatMessage]


class CoreEngineLibWordLlmChatSendResponse(BaseModel):
    """Response to send message"""
    success: bool = True
    data: dict   # { user_message, assistant_message, html, css }