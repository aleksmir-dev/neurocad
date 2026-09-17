# neurocad/core/engine/route.py

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from neurocad.utils.templates import templates, STATIC_VERSION
from neurocad.config import settings
import json
import re
from pathlib import Path
import neurocad

from .lib.route import router as lib_router

router = APIRouter(prefix="/engine", tags=["core/engine"])
router.include_router(lib_router)

# ============================================
# КОРЕНЬ МОДУЛЕЙ
# ============================================

# Встроенные модули — внутри пакета neurocad
NEUROCAD_DIR = Path(neurocad.__file__).parent
BUILTIN_MOD_ROOT = NEUROCAD_DIR / "core" / "engine" / "mod"


def get_mod_root() -> Path:
    """
    Определяет корень модулей.

    Приоритет:
      1. Папка из settings.APP_JSON (если задана и существует).
         Если APP_JSON — файл, берём его родительскую папку.
      2. Папка "app/" в cwd (если существует).
      3. Встроенный neurocad/core/engine/mod/.
    """
    # 1. Из настроек
    app_json = getattr(settings, "APP_JSON", None)
    if app_json:
        p = Path(app_json)
        if p.is_dir() and p.exists():
            return p
        if p.is_file() and p.exists():
            return p.parent

    # 2. app/ в cwd
    user_root = Path("app")
    if user_root.exists() and user_root.is_dir():
        return user_root

    # 3. Встроенный
    return BUILTIN_MOD_ROOT


# Определяем корень один раз при импорте
MOD_ROOT = get_mod_root()

# Режим отладки
DEBUG = settings.DEBUG


# ============================================
# УТИЛИТЫ
# ============================================

def _parse_path(module_path: str) -> tuple[list[str], list[str]]:
    """
    Разбирает URL-путь на path_parts и params_list.

    Правило: сегмент, состоящий ТОЛЬКО из цифр → параметр.
             Всё до первого числа → path.
             Всё после первого числа → параметры.
    """
    parts = module_path.split("/")
    path_parts: list[str] = []
    params_list: list[str] = []
    in_params = False

    for part in parts:
        if not part:
            continue
        if not in_params and part.isdigit():
            in_params = True
        if in_params:
            params_list.append(part)
        else:
            path_parts.append(part)

    return path_parts, params_list


def _find_config(path_parts: list[str]) -> tuple[Path | None, str, str]:
    """
    Ищет файл конфига для заданного path.

    Возвращает: (config_file, module_name, page_name).
    config_file = None, если не найдено.
    """
    for length in range(len(path_parts), 0, -1):
        prefix_parts = path_parts[:length]
        prefix = "/".join(prefix_parts)
        last = prefix_parts[-1]

        # 1. Прямой файл: mod/{prefix}.json
        direct = MOD_ROOT / f"{prefix}.json"
        if direct.exists() and direct.is_file():
            module_name = "/".join(prefix_parts[:-1]) if length > 1 else prefix_parts[0]
            return direct, module_name, last

        # 2. Вложенный одноимённый: mod/{prefix}/{last}/{last}.json
        nested = MOD_ROOT / prefix / f"{last}.json"
        if nested.exists() and nested.is_file():
            return nested, prefix, last

    return None, "", ""


def _get_module_name_from_config(config_file: Path) -> str:
    """
    Определяет имя модуля по файлу конфига.
    module_name = родительская папка файла относительно mod/.
    Если файл в корне mod/ — возвращает имя файла без расширения.
    """
    parent = config_file.parent
    if parent == MOD_ROOT:
        return config_file.stem
    return str(parent.relative_to(MOD_ROOT)).replace("\\", "/")


def _resolve_links(obj, base_url: str):
    """
    Рекурсивно обходит конфиг и заменяет относительные ссылки
    в поле 'href' на полные пути с префиксом base_url.
    """
    if isinstance(obj, list):
        return [_resolve_links(item, base_url) for item in obj]
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if (
                key == 'href'
                and isinstance(value, str)
                and value.startswith('/')
                and not value.startswith('//')
            ):
                result[key] = base_url + value
            else:
                result[key] = _resolve_links(value, base_url)
        return result
    return obj


def _substitute_vars(obj, context: dict):
    """
    Рекурсивно обходит конфиг и заменяет {{ var }} на значения из context.
    Поддерживает вложенные ключи: {{ page.title }}.

    ВАЖНО: если ключа нет в context — оставляем {{ var }} как есть,
    чтобы не удалять маркеры для фронтенда ({{ pages }}, {{ nav }}, {{ word }} и т.д.).
    """
    if isinstance(obj, list):
        return [_substitute_vars(item, context) for item in obj]
    if isinstance(obj, dict):
        return {k: _substitute_vars(v, context) for k, v in obj.items()}
    if isinstance(obj, str):
        def replacer(match):
            key = match.group(1).strip()
            value = _resolve_key(key, context)
            if value is None:
                return match.group(0)
            return str(value)
        return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replacer, obj)
    return obj


def _resolve_key(key: str, context: dict):
    """
    Разрешает ключ вида 'page.title' в context.
    Возвращает None, если ключа нет.
    """
    parts = key.split(".")
    value = context
    for part in parts:
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return None
    return value


# ============================================
# API — отдаёт собранный JSON-конфиг
# ============================================

@router.get("/api/{module_path:path}")
async def engine_api(module_path: str):
    """
    Отдаёт собранный JSON-конфиг.

    URL без .json: /core/engine/api/app/page/20260914/153910

    Алгоритм:
      1. Парсим URL: path_parts + params_list (числа).
      2. Ищем файл конфига через _find_config.
      3. Обрабатываем default_page, extend.
      4. Подставляем {{ ... }} из params_list.
      5. Преобразуем ссылки на dev.
    """
    path_parts, params_list = _parse_path(module_path)

    if not path_parts:
        raise HTTPException(status_code=404, detail=f"Путь пустой: {module_path}")

    config_file, module_name, page_name = _find_config(path_parts)

    if not config_file:
        raise HTTPException(status_code=404, detail=f"Конфиг для {module_path} не найден")

    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 1. Обрабатываем default_page
    if config.get('default_page'):
        dp_name = config['default_page']
        dp_path = config_file.parent / f"{dp_name}.json"
        if dp_path.exists() and dp_path.is_file():
            with open(dp_path, 'r', encoding='utf-8') as f:
                dp_config = json.load(f)
            config = {**config, **dp_config}

    # 2. Обрабатываем extend
    if config.get('extend'):
        base_name = config['extend']
        base_path = config_file.parent / f"{base_name}.json"
        if base_path.exists() and base_path.is_file():
            with open(base_path, 'r', encoding='utf-8') as f:
                base_config = json.load(f)

            config_components = config.get('components', [])
            merged = {**base_config, **config}

            merged['component'] = base_config.get('component', 'base')

            merged_components = []
            if base_config.get('components'):
                merged_components.extend(base_config['components'])
            if config_components:
                merged_components.extend(config_components)
            merged['components'] = merged_components

            merged.pop('default_page', None)
            merged.pop('extend', None)
            config = merged

    # 3. Подстановка {{ ... }}
    context = {
        "module_name": module_name,
        "page_name": page_name,
        "params_list": params_list,
    }
    if len(params_list) > 0:
        context["page_date"] = params_list[0]
    if len(params_list) > 1:
        context["page_time"] = params_list[1]
    if len(params_list) > 2:
        context["page_extra"] = params_list[2:]

    config = _substitute_vars(config, context)

    # 4. Удаляем служебные поля
    config.pop('default_page', None)
    config.pop('extend', None)

    # 5. Преобразование ссылок на dev
    if DEBUG:
        base_url = f"/core/engine/{module_name}"
        config = _resolve_links(config, base_url)

    return JSONResponse(config)


# ============================================
# HTML — отдаёт страницу модуля
# ============================================

@router.get("/{module_path:path}", response_class=HTMLResponse)
async def engine_module(request: Request, module_path: str):
    """
    Отдаёт HTML-страницу для модуля.

    Алгоритм:
      1. Парсим URL: path_parts + params_list (числа).
      2. Ищем файл конфига по path_parts.
      3. Если не найден → 404.
      4. Читаем конфиг (auth_required, auth_redirect).
      5. Передаём в шаблон module_name, config_path, params_list.
    """
    path_parts, params_list = _parse_path(module_path)

    if not path_parts:
        raise HTTPException(status_code=404, detail=f"Страница {module_path} не найдена")

    config_file, module_name, page_name = _find_config(path_parts)

    if not config_file:
        raise HTTPException(status_code=404, detail=f"Страница {module_path} не найдена")

    # config_path для API = путь файла относительно MOD_ROOT без .json
    config_path = str(config_file.relative_to(MOD_ROOT)).replace(".json", "").replace("\\", "/")

    auth_required = False
    auth_redirect = None

    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
            auth_required = config.get('auth_required', False)
            auth_redirect = config.get('auth_redirect', None)
    except Exception as e:
        print(f"[Engine] Error loading config for {module_path}: {e}")

    return templates.TemplateResponse(
        request=request,
        name="core/engine/engine.html",
        context={
            "module_name": module_name,
            "config_path": config_path,
            "params_list": params_list,
            "static_version": STATIC_VERSION,
            "is_authenticated": True,
            "username": "Гость",
            "auth_required": auth_required,
            "auth_redirect": auth_redirect,
        }
    )


# ============================================
# BLOCK — отдаёт JSON-конфиг блока по $ref
# ============================================

@router.get("/block/{block_path:path}")
async def engine_block_config(block_path: str):
    """Отдаёт JSON-конфиг блока по $ref (если понадобится)"""
    full_path = MOD_ROOT / block_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail=f"Блок {block_path} не найден")

    with open(full_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    return JSONResponse(config)