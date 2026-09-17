# app/core/models/nav.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, Index
from datetime import datetime
from typing import Optional
from .base import Base


class Nav(Base):  # ← Nav, не NavCard
    __tablename__ = "nav"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('nav.id', ondelete='CASCADE'), nullable=True)
    card_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'folder', 'module'
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    
    module_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('modules.id', ondelete='SET NULL'), nullable=True)
    
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=True)
    
    __table_args__ = (
        Index('idx_nav_user_id', 'user_id'),
        Index('idx_nav_parent', 'parent_id'),
        Index('idx_nav_type', 'card_type'),
        Index('idx_nav_is_delete', 'is_delete'),
        Index('idx_nav_module_id', 'module_id'),
    )