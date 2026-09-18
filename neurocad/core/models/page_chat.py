# neurocad/core/models/page_chat.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PageChat(Base):
    """
    История чата с LLM по конкретной странице.

    Каждая запись — одно сообщение: роль + содержимое. Привязана к странице
    (page_id). Используется в правой панели LLM-редактора.
    """
    __tablename__ = "page_chat"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK на pages.id — к какой странице относится сообщение
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=False,
    )

    # Роль отправителя:
    #   'user'      — сообщение пользователя
    #   'assistant' — ответ LLM
    #   'system'    — системный промпт
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    # Текст сообщения
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Модель, которой был сгенерирован ответ (для assistant)
    # например: 'deepseek-chat'
    model: Mapped[Optional[str]] = mapped_column(String(50))

    # Учёт токенов (для assistant)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    __table_args__ = (
        Index('idx_page_chat_page_id', 'page_id'),
        Index('idx_page_chat_created_at', 'created_at'),
        Index('idx_page_chat_page_created', 'page_id', 'created_at'),
    )