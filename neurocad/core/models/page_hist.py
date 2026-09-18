# neurocad/core/models/page_hist.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PageHist(Base):
    """
    История изменений HTML страницы.

    Снимки полного HTML после каждого изменения — для undo/redo
    в LLM-редакторе. Привязана к конкретной странице (page_id).
    """
    __tablename__ = "page_hist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK на pages.id — к какой странице относится снимок
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=False,
    )

    # Снимок полного HTML на момент изменения
    html: Mapped[str] = mapped_column(Text, nullable=False)

    # Что стало причиной изменения:
    #   'user_edit'    — ручное редактирование
    #   'ai_edit'      — изменение через LLM
    #   'preset_apply' — применение пресета
    #   'rollback'     — откат к предыдущему снимку
    action: Mapped[Optional[str]] = mapped_column(String(50))

    # Комментарий (для отладки и UI):
    #   'ai_edit'      → текст запроса к LLM
    #   'preset_apply' → имя пресета
    #   'rollback'     → id снимка, к которому откатились
    note: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    __table_args__ = (
        Index('idx_page_hist_page_id', 'page_id'),
        Index('idx_page_hist_created_at', 'created_at'),
        Index('idx_page_hist_page_created', 'page_id', 'created_at'),
    )