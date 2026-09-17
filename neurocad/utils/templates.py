# app/utils/templates.py

from fastapi import Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
import time
from neurocad.config import settings

# Версия статики (меняется при перезапуске сервера)
STATIC_VERSION = str(int(time.time()))

# Корневая папка с шаблонами
TEMPLATES_DIR = Path(__file__).parent.parent / "core"

# Создаем единый экземпляр Jinja2Templates с несколькими путями
templates = Jinja2Templates(directory=[
    str(TEMPLATES_DIR.parent)
])

# Фильтр для добавления версии к статическим файлам
def static_url(path: str) -> str:
    """Возвращает URL статического файла с версией"""
    return f"/static/{path}?v={STATIC_VERSION}"

# Регистрируем фильтр
templates.env.filters['static'] = static_url

# Добавляем глобальную переменную для всех шаблонов
templates.env.globals['static_version'] = STATIC_VERSION

# ===== Глобальные функции для шаблонов =====

def get_user(request: Request):
    """Получает пользователя из request.state"""
    return getattr(request.state, "user", None)


def is_authenticated(request: Request):
    """Проверяет, авторизован ли пользователь"""
    return getattr(request.state, "is_authenticated", False)


def get_site_url(request: Request):
    """Возвращает полный URL сайта (протокол + хост) из настроек"""
    return f"{settings.APP_PROT}://{settings.APP_DOMAIN}"


def get_protocol(request: Request):
    """Возвращает протокол из настроек"""
    return settings.APP_PROT


def get_host(request: Request):
    """Возвращает хост из настроек"""
    return settings.APP_DOMAIN

def theme_url(path: str = "theme.css") -> str:
    """
    Возвращает URL файла темы с версией.
    Путь формируется из настроек APP_THEME.
    """
    theme_path = f"core/base/sites/{settings.APP_THEME}/{path}"
    return f"/static/{theme_path}?v={STATIC_VERSION}"

def theme_include(path: str = "metrika.html") -> str:
    """
    Возвращает путь для включения файла темы через {% include %}.
    Путь формируется из настроек APP_THEME.
    """
    # Для include нужен относительный путь от папки templates
    return f"core/base/sites/{settings.APP_THEME}/{path}"

def get_app_title():
    """Возвращает заголовок из настроек"""
    return settings.APP_TITLE

# Регистрируем глобальные функции в Jinja2
templates.env.globals['get_user'] = get_user
templates.env.globals['is_authenticated'] = is_authenticated
templates.env.globals['get_site_url'] = get_site_url
templates.env.globals['get_protocol'] = get_protocol
templates.env.globals['get_host'] = get_host
templates.env.globals['theme_url'] = theme_url
templates.env.globals['theme_include'] = theme_include
templates.env.globals['get_app_title'] = get_app_title