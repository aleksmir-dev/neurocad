# neurocad/core/engine/lib/word/llm/schema.py

"""
Pydantic schemas for LLM editor (presets, chat, history).

At this stage — presets and chat.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime as dt


# ============================================
# PRESETS (page_pres)
# ============================================

class LLMPresetBase(BaseModel):
    """Base preset fields"""
    name: str = Field(..., min_length=1, max_length=255, description="Название")
    description: Optional[str] = Field(None, description="Описание")
    html: Optional[str] = Field(None, description="HTML пресета")
    css: Optional[str] = Field(None, description="CSS пресета")


class LLMPresetCreate(LLMPresetBase):
    """Create preset"""
    pass


class LLMPresetUpdate(BaseModel):
    """Update preset — all fields optional"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    html: Optional[str] = None
    css: Optional[str] = None


class LLMPresetItem(BaseModel):
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


class LLMPresetListResponse(BaseModel):
    """Response with preset list"""
    success: bool = True
    data: List[LLMPresetItem]
    total: int = 0


class LLMPresetItemResponse(BaseModel):
    """Response with a single preset"""
    success: bool = True
    data: LLMPresetItem


# ============================================
# THUMBNAIL UPLOAD
# ============================================

class LLMPresetThumbnailResponse(BaseModel):
    """Response for thumbnail upload"""
    success: bool = True
    data: dict  # {"thumbnail_path": "presets/1.png"}


# ============================================
# CHAT
# ============================================

class LLMChatMessageCreate(BaseModel):
    """Request to send a chat message"""
    message: str = Field(..., min_length=1, description="Текст сообщения пользователя")


class LLMChatMessage(BaseModel):
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


class LLMChatHistoryResponse(BaseModel):
    """Response with chat history"""
    success: bool = True
    data: List[LLMChatMessage]


class LLMChatSendResponse(BaseModel):
    """Response to send message"""
    success: bool = True
    data: dict   # { user_message, assistant_message, html, css }