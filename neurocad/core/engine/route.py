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
# MODULE ROOT
# ============================================

# Built-in modules — inside the neurocad package.
NEUROCAD_DIR = Path(neurocad.__file__).parent
BUILTIN_MOD_ROOT = NEUROCAD_DIR / "core" / "engine" / "mod"


def get_mod_root() -> Path:
    """
    Determine the module root directory.

    Priority:
      1. Path from settings.APP_JSON (if set and exists).
         If APP_JSON points to a file, its parent directory is used.
      2. "app/" directory in cwd (if it exists).
      3. Built-in neurocad/core/engine/mod/.
    """
    # 1. From settings
    app_json = getattr(settings, "APP_JSON", None)
    if app_json:
        p = Path(app_json)
        if p.is_dir() and p.exists():
            return p
        if p.is_file() and p.exists():
            return p.parent

    # 2. app/ in cwd
    user_root = Path("app")
    if user_root.exists() and user_root.is_dir():
        return user_root

    # 3. Built-in
    return BUILTIN_MOD_ROOT


# Resolved once at import time.
MOD_ROOT = get_mod_root()

# Debug mode.
DEBUG = settings.DEBUG


# ============================================
# AUTH HELPERS
# ============================================

async def _extract_current_user(request: Request):
    """
    Resolve the current authenticated user from the request.

    `CoreAuthDependencies.get_current_user` is a FastAPI dependency:
    calling it directly leaves `Depends(security)` unresolved. We
    work around that by passing `credentials=None` explicitly — the
    function reads the token from the Authorization header or the
    `access_token` cookie via `get_token_from_request(request)`, so
    the `credentials` argument is not used anyway.

    Returns the user object (may be an ORM model or a dict) or None.
    Never raises — auth failures are treated as "guest".
    """
    try:
        from neurocad.core.auth.dependencies import CoreAuthDependencies

        return await CoreAuthDependencies.get_current_user(
            request=request,
            credentials=None,
        )
    except HTTPException:
        # 401 from the dependency — guest.
        return None
    except Exception as e:
        print(f"[Engine] auth extraction failed: {e}")
        return None


def _user_id_from(user) -> int | None:
    """
    Extract the user id from either a dict or an ORM model.

    `get_current_user` is annotated -> Dict, but the underlying
    service returns an ORM User. Accept both shapes.
    """
    if user is None:
        return None
    if isinstance(user, dict):
        v = user.get("id")
    else:
        v = getattr(user, "id", None)
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# ============================================
# UTILITIES
# ============================================

def _parse_path(module_path: str) -> tuple[list[str], list[str]]:
    """
    Split a URL path into path_parts and params_list.

    Rule: a segment consisting ONLY of digits → a parameter.
          Everything before the first digit → path.
          Everything after the first digit → parameters.
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
    Find the config file for the given path.

    Returns: (config_file, module_name, page_name).
    config_file = None when nothing is found.
    """
    for length in range(len(path_parts), 0, -1):
        prefix_parts = path_parts[:length]
        prefix = "/".join(prefix_parts)
        last = prefix_parts[-1]

        # 1. Direct file: mod/{prefix}.json
        direct = MOD_ROOT / f"{prefix}.json"
        if direct.exists() and direct.is_file():
            module_name = "/".join(prefix_parts[:-1]) if length > 1 else prefix_parts[0]
            return direct, module_name, last

        # 2. Nested same-name: mod/{prefix}/{last}/{last}.json
        nested = MOD_ROOT / prefix / f"{last}.json"
        if nested.exists() and nested.is_file():
            return nested, prefix, last

    return None, "", ""


def _get_module_name_from_config(config_file: Path) -> str:
    """
    Determine the module name from a config file.

    module_name = the config file's parent directory relative to mod/.
    If the file is directly in mod/ — its stem (filename without extension).
    """
    parent = config_file.parent
    if parent == MOD_ROOT:
        return config_file.stem
    return str(parent.relative_to(MOD_ROOT)).replace("\\", "/")


# ============================================
# HOST → MODULE (via `domain` in module JSON)
# ============================================

#: Cache: {domain_lowercase: module_name}.
#: Refreshed automatically when the app/ tree mtime changes.
_host_module_cache: dict[str, str] = {}
_host_cache_mtime: float = 0.0


def _app_tree_mtime(root: Path) -> float:
    """
    Latest mtime across all *.json files under root (recursive).

    Used as a cheap "did anything change?" signal for the host→module
    cache. Missing files / permission errors are ignored.
    """
    latest = 0.0
    try:
        for f in root.rglob("*.json"):
            try:
                m = f.stat().st_mtime
                if m > latest:
                    latest = m
            except OSError:
                continue
    except Exception:
        pass
    return latest


def _scan_host_modules(root: Path) -> dict[str, str]:
    """
    Scan root/**/*.json and return {domain_lowercase: module_name}.

    A file is considered a module config when:
      - component == "module"
      - it has a non-empty string (or list of strings) `domain`

    Module name = the config file's stem (matches route.py convention).

    If several files declare the same domain, the first one found wins
    (rglob order is stable — alphabetical by directory).
    """
    result: dict[str, str] = {}
    if not root.exists() or not root.is_dir():
        return result

    for cfg_file in root.rglob("*.json"):
        try:
            data = json.loads(cfg_file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("component") != "module":
            continue

        raw_domain = data.get("domain")
        domains: list[str] = []
        if isinstance(raw_domain, str) and raw_domain.strip():
            domains = [raw_domain.strip().lower()]
        elif isinstance(raw_domain, list):
            domains = [
                d.strip().lower()
                for d in raw_domain
                if isinstance(d, str) and d.strip()
            ]

        if not domains:
            continue

        module_name = cfg_file.stem
        for dom in domains:
            if dom not in result:
                result[dom] = module_name

    return result


def _resolve_module_by_host(host: str | None) -> str | None:
    """
    Resolve a module name from the Host header via `domain` in module JSON.

    - Strips the port.
    - Lowercases.
    - Also tries the `www.` variant (declares "example.com" → matches
      both "example.com" and "www.example.com", and vice versa).
    - Returns the module name (folder name) or None.

    Cache invalidates automatically when any JSON under MOD_ROOT
    changes its mtime.
    """
    global _host_module_cache, _host_cache_mtime

    if not host:
        return None

    host = host.strip().lower()
    if ":" in host:
        host = host.split(":", 1)[0]
    if not host:
        return None

    # Skip IPs / localhost.
    if host in ("localhost", "127.0.0.1", "::1"):
        return None
    if host.replace(".", "").isdigit():
        return None

    # Refresh cache if the app/ tree changed.
    current_mtime = _app_tree_mtime(MOD_ROOT)
    if current_mtime != _host_cache_mtime or not _host_module_cache:
        _host_module_cache = _scan_host_modules(MOD_ROOT)
        _host_cache_mtime = current_mtime

    # Direct hit.
    if host in _host_module_cache:
        return _host_module_cache[host]

    # www. variants — try both directions.
    if host.startswith("www."):
        alt = host[4:]
    else:
        alt = "www." + host
    if alt in _host_module_cache:
        return _host_module_cache[alt]

    return None


def _resolve_links(obj, base_url: str):
    """
    Recursively walk the config and rewrite relative links in the
    'href' field to absolute paths prefixed with base_url.
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
    Recursively walk the config and replace {{ var }} with values from
    context. Supports nested keys: {{ page.title }}.

    IMPORTANT: if a key is not in context — leave {{ var }} as-is,
    so frontend markers ({{ pages }}, {{ nav }}, {{ word }}) are
    not removed.
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
    Resolve a dotted key like 'page.title' against context.
    Returns None when the key is missing.
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
# API — returns the assembled JSON config
# ============================================

@router.get("/api/{module_path:path}")
async def engine_api(module_path: str, request: Request):
    """
    Return the assembled JSON config.

    URL without .json: /core/engine/api/app/page/20260914/153910

    Algorithm:
      1. Parse the URL: path_parts + params_list (digits).
      2. Resolve Host → module when path_parts is empty.
      3. Find the config file via _find_config.
      4. Apply default_page, extend.
      5. Substitute {{ ... }} from params_list.
      6. Rewrite links for dev mode.
    """
    path_parts, params_list = _parse_path(module_path)

    # If the API path is empty, resolve the module from the Host header.
    # This mirrors engine_module's behaviour: /core/engine/api/ with
    # Host: dev.neurocad.ru → module "dev.neurocad.ru" (if declared).
    if not path_parts:
        host_module = _resolve_module_by_host(request.headers.get("host"))
        module = host_module or "default"
        path_parts = [module, module]

    config_file, module_name, page_name = _find_config(path_parts)

    if not config_file:
        raise HTTPException(status_code=404, detail=f"Config for {module_path} not found")

    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 1. Handle default_page
    if config.get('default_page'):
        dp_name = config['default_page']
        dp_path = config_file.parent / f"{dp_name}.json"
        if dp_path.exists() and dp_path.is_file():
            with open(dp_path, 'r', encoding='utf-8') as f:
                dp_config = json.load(f)
            config = {**config, **dp_config}

    # 2. Handle extend
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

    # 3. Substitute {{ ... }}
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

    # 4. Drop service fields
    config.pop('default_page', None)
    config.pop('extend', None)

    # 5. Rewrite links for dev
    if DEBUG:
        base_url = f"/core/engine/{module_name}"
        config = _resolve_links(config, base_url)

    return JSONResponse(config)


# ============================================
# HTML — returns the module page
# ============================================

@router.get("/{module_path:path}", response_class=HTMLResponse)
async def engine_module(request: Request, module_path: str):
    """
    Return the HTML page for a module.

    Algorithm:
      1. Parse the URL: path_parts + params_list (digits).
      2. Resolve Host → module when path_parts is empty.
      3. Find the config file by path_parts.
      4. If not found → 404.
      5. Read the config (auth_required, auth_redirect).
      6. Compute nav_id:
         - if the URL looks like /core/engine/pages/<nav_id>/...
           — take it from the URL;
         - otherwise — resolve from the session (current user's first nav);
         - if nothing — None.
      7. Pass module_name, config_path, params_list, nav_id to the template.
    """
    path_parts, params_list = _parse_path(module_path)

    # If the URL path is empty (/core/engine/ hit directly) — resolve
    # the module from the Host header. Fallback: "default".
    if not path_parts:
        host_module = _resolve_module_by_host(request.headers.get("host"))
        module = host_module or "default"
        path_parts = [module, module]

    config_file, module_name, page_name = _find_config(path_parts)

    if not config_file:
        raise HTTPException(status_code=404, detail=f"Page {module_path} not found")

    # config_path for the API = path of the file relative to MOD_ROOT, no .json
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

    # ===== nav_id =====
    # Priority:
    #   1. URL form /core/engine/pages/<nav_id>/... — nav_id is params_list[0]
    #      when path_parts[0] == "pages".
    #   2. Session — first nav of the authenticated user (by id ASC).
    #      This is what makes admin pages carry a nav_id, so the frontend
    #      can build /core/engine/pages/<nav_id>/<date>/<time> links.
    nav_id = None

    if path_parts and path_parts[0] == "pages" and len(params_list) > 0:
        try:
            nav_id = int(params_list[0])
        except (TypeError, ValueError):
            nav_id = None

    if nav_id is None:
        # Fall back to the current user's first nav.
        try:
            from sqlalchemy import select
            from neurocad.core.models.nav import Nav
            from neurocad.utils.sqlite import get_db_sqlite

            current_user = await _extract_current_user(request)
            user_id = _user_id_from(current_user)

            if user_id:
                async for session in get_db_sqlite():
                    stmt = (
                        select(Nav)
                        .where(Nav.user_id == user_id, Nav.is_delete == False)
                        .order_by(Nav.id.asc())
                        .limit(1)
                    )
                    nav = (await session.execute(stmt)).scalar_one_or_none()
                    if nav:
                        nav_id = nav.id
                    break
        except Exception as e:
            print(f"[Engine] nav_id resolution failed: {e}")
            nav_id = None

    return templates.TemplateResponse(
        request=request,
        name="core/engine/engine.html",
        context={
            "module_name": module_name,
            "config_path": config_path,
            "params_list": params_list,
            "nav_id": nav_id,
            "static_version": STATIC_VERSION,
            "is_authenticated": True,
            "username": "Гость",
            "auth_required": auth_required,
            "auth_redirect": auth_redirect,
        }
    )


# ============================================
# BLOCK — returns a block JSON config by $ref
# ============================================

@router.get("/block/{block_path:path}")
async def engine_block_config(block_path: str):
    """
    Return the JSON config of a block by $ref (used by the frontend
    to inline sub-configs into the page config).
    """
    full_path = MOD_ROOT / block_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail=f"Block {block_path} not found")

    with open(full_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    return JSONResponse(config)