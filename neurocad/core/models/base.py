# app/core/models/base.py

from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

# Импортируем все модели
from .access import Access
from .auth import PasswordReset
from .user import User
from .page import Page
from .nav import Nav
from .module import Module
from .setting import Setting
