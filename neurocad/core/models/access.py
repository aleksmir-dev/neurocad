# app/core/models/access.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, Boolean, DateTime, Index
from datetime import datetime as dt
from .base import Base


class Access(Base):
    __tablename__ = "access"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    module_id: Mapped[int] = mapped_column(Integer, nullable=False)
    can_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, nullable=True)
    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now, nullable=True)
    
    __table_args__ = (
        Index('idx_access_user_module', 'user_id', 'module_id', unique=True),
        Index('idx_access_is_delete', 'is_delete'),
    )