# app/core/models/setting.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, Boolean, DateTime, Index
from datetime import datetime
from typing import Optional
from .base import Base


class Setting(Base):
    __tablename__ = "settings"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    domain: Mapped[str] = mapped_column(String(64), nullable=False)
    subsys: Mapped[str] = mapped_column(String(64), nullable=False)
    module: Mapped[str] = mapped_column(String(64), nullable=False)
    section: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    caption: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=True)
    
    __table_args__ = (
        Index('idx_settings_lookup', 'domain', 'subsys', 'module', 'section', 'key', unique=True),
        Index('idx_settings_is_delete', 'is_delete'),
    )