# app/utils/templates.py

from fastapi.templating import Jinja2Templates
from pathlib import Path
import time

# Версия статики (меняется при перезапуске сервера)
STATIC_VERSION = str(int(time.time()))

# Корневая папка с шаблонами
TEMPLATES_DIR = Path(__file__).parent.parent / "core"

# Создаем единый экземпляр Jinja2Templates с несколькими путями
templates = Jinja2Templates(directory=[
    str(TEMPLATES_DIR.parent),
    str(TEMPLATES_DIR / "main" / "templates"),
    str(TEMPLATES_DIR / "auth" / "templates"),
    str(TEMPLATES_DIR / "autotime" / "templates"),
    str(TEMPLATES_DIR / "issue" / "templates"),
])

# Фильтр для добавления версии к статическим файлам
def static_url(path: str) -> str:
    """Возвращает URL статического файла с версией"""
    return f"/static/{path}?v={STATIC_VERSION}"

# Регистрируем фильтр
templates.env.filters['static'] = static_url

# Добавляем глобальную переменную для всех шаблонов
templates.env.globals['static_version'] = STATIC_VERSION