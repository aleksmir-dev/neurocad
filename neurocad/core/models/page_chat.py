# neurocad/core/models/page_chat.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class PageChat(Base):
    """
    Chat history with the LLM for a specific page.

    Each row is one message: role + content. Tied to a page
    (page_id). Used in the right-hand panel of the LLM editor.
    """
    __tablename__ = "page_chat"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK to pages.id — which page this message belongs to.
    page_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=False,
    )

    # Sender role:
    #   'user'      — user message
    #   'assistant' — LLM reply
    #   'system'    — system prompt
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    # Message text. Always CLEAN — no technical markers, no
    # prefixes. The user sees exactly this string in the chat.
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Flag: this is a clarifying question from the router
    # (the "administrator" agent).
    #
    #   0 — a regular assistant message (an agent's reply,
    #       a greeting, a result summary, etc.).
    #   1 — the router asked a clarifying question and is
    #       waiting for the user's answer.
    #
    # Purpose: on the NEXT user message, the router reads the
    # recent history and needs to know whether the current
    # message is a REPLY to a previous question or a NEW
    # request. If the last assistant message has is_quest=1,
    # the router treats the incoming text as an answer.
    #
    # The content field stays clean on purpose — we do NOT
    # embed a marker like "[ROUTE-QUESTION]" into the text,
    # because the user would see it as garbage. The flag
    # lives in this separate column instead.
    is_quest: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    # Model that generated the reply (for assistant messages),
    # e.g. 'deepseek-chat'.
    model: Mapped[Optional[str]] = mapped_column(String(50))

    # Token accounting (for assistant messages).
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    __table_args__ = (
        Index('idx_page_chat_page_id', 'page_id'),
        Index('idx_page_chat_created_at', 'created_at'),
        Index('idx_page_chat_page_created', 'page_id', 'created_at'),
    )