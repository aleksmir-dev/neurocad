# neurocad/utils/paths.py

"""Package paths and user working directory helpers."""

import shutil
from pathlib import Path
from importlib.resources import files


# ============================================
# PACKAGE PATHS
# ============================================

def package_dir() -> Path:
    """Package root (in site-packages)."""
    return Path(str(files("neurocad")))


def package_core_dir() -> Path:
    """Package core dir (neurocad/core/)."""
    return package_dir() / "core"


def package_engine_dir() -> Path:
    """Package engine dir (neurocad/core/engine/)."""
    return package_core_dir() / "engine"


def package_alembic_dir() -> Path:
    """Package alembic dir (neurocad/alembic/)."""
    return package_dir() / "alembic"


def package_alembic_ini() -> Path:
    """Package alembic.ini path."""
    return package_dir() / "alembic.ini"


def package_static_dir() -> Path:
    """Package static dir (neurocad/static/)."""
    return package_dir() / "static"


# ============================================
# USER PATHS (relative to cwd)
# ============================================

def user_alembic_dir() -> Path:
    """User migrations directory (relative to cwd)."""
    return Path("mig")


def user_alembic_versions_dir() -> Path:
    """User migrations versions directory."""
    return user_alembic_dir() / "versions"


def user_core_dir() -> Path:
    """User overrides directory (project1/core/)."""
    return Path("core")


def user_engine_dir() -> Path:
    """User engine overrides dir (project1/core/engine/)."""
    return user_core_dir() / "engine"


def user_static_dir() -> Path:
    """User static dir (project1/static/). Built by sync_static."""
    return Path("static")


# ============================================
# ENSURE WORKDIRS
# ============================================

def ensure_workdirs():
    """
    Create working directories and files in cwd if missing.

    Created:
      - base/, log/, media/ — working dirs
      - static/ — synced static (nginx root)
      - app/ — with copy of mod/* (if empty)
      - core/engine/ — user overrides dir
      - alembic/versions/ — user migrations
      - main.py — entry point (if missing)
      - .env — settings (if missing)
      - .gitignore — project gitignore (created or synced)
    """
    from ..config import settings

    # ===== 1. Working dirs =====
    for p in [
        settings.BASE_PATH,
        settings.LOG_PATH,
        settings.MEDIA_PATH,
        Path("app"),
        user_engine_dir(),
        user_static_dir(),
    ]:
        Path(p).mkdir(parents=True, exist_ok=True)

    # ===== 2. app/ — if empty, copy mod/* =====
    app_dir = Path("app")
    if not any(app_dir.iterdir()):
        _copy_builtin_app(app_dir)

    # ===== 3. alembic/versions/ — user migrations =====
    versions_dir = user_alembic_versions_dir()
    versions_dir.mkdir(parents=True, exist_ok=True)

    # ===== 4. main.py — if missing =====
    main_py = Path("main.py")
    if not main_py.exists():
        main_py.write_text(
            "from neurocad import NeuroCad\n"
            "\n"
            "app = NeuroCad()\n",
            encoding="utf-8",
        )

    # ===== 5. .env — if missing =====
    env = Path(".env")
    if not env.exists():
        env.write_text(
            "# NeuroCad .env\n"
            "# All settings are optional. Defaults are in config.py.\n"
            "\n"
            "# ============================================\n"
            "# APPLICATION\n"
            "# ============================================\n"
            "\n"
            "# Application host (default: 127.0.0.1)\n"
            "APP_HOST=127.0.0.1\n"
            "\n"
            "# Application port (default: 8000)\n"
            "APP_PORT=8000\n"
            "\n"
            "# Debug mode (default: True)\n"
            "DEBUG=True\n"
            "\n"
            "# ============================================\n"
            "# DATABASE\n"
            "# ============================================\n"
            "\n"
            "# Async SQLite URL (used by the app)\n"
            "SQLITE_URL=sqlite+aiosqlite:///base/neurocad.db\n"
            "\n"
            "# Sync SQLite URL (used by Alembic migrations)\n"
            "SQLITE_URL_SYNC=sqlite:///base/neurocad.db\n"
            "\n"
            "# ============================================\n"
            "# SECURITY\n"
            "# ============================================\n"
            "\n"
            "# Secret key for JWT tokens. CHANGE IN PRODUCTION!\n"
            "SECRET_KEY=change-me-in-production\n"
            "\n"
            "# JWT algorithm (default: HS256)\n"
            "ALGORITHM=HS256\n"
            "\n"
            "# Access token lifetime in minutes (default: 1440 = 24 hours)\n"
            "ACCESS_TOKEN_EXPIRE_MINUTES=1440\n"
            "\n"
            "# ============================================\n"
            "# SUPERADMIN\n"
            "# ============================================\n"
            "\n"
            "# Default superadmin login (created on first run)\n"
            "SUPERADMIN_LOGIN=admin\n"
            "\n"
            "# Default superadmin password (created on first run)\n"
            "SUPERADMIN_PASSWORD=admin\n"
            "\n"
            "# ============================================\n"
            "# LLM\n"
            "# ============================================\n"
            "\n"
            "# Active LLM provider: deepseek | yandex | gigachat | gemini\n"
            "LLM_PROVIDER=deepseek\n"
            "\n"
            "# DeepSeek API key (get it at https://platform.deepseek.com)\n"
            "DEEPSEEK_API_KEY=\n"
            "\n"
            "# DeepSeek model name (default: deepseek-flash)\n"
            "DEEPSEEK_MODEL=deepseek-flash\n",
            encoding="utf-8",
        )

    # ===== 6. .gitignore — create or sync =====
    ensure_gitignore()


# ============================================
# .gitignore
# ============================================

_GITIGNORE_BEGIN = "# === NEUROCAD BEGIN ==="
_GITIGNORE_END = "# === NEUROCAD END ==="


def ensure_gitignore():
    """
    Create or sync the project .gitignore.

    Rules:
      1. .gitignore doesn't exist            → copy package version (full).
      2. Exists, identical to package        → skip.
      3. Exists, has no NEUROCAD markers     → full overwrite (package version).
      4. Exists, both have markers, differs  → replace NEUROCAD block only.
      5. Exists, both have markers, same     → skip.

    User additions AFTER the NEUROCAD END marker are preserved
    once the file has markers.

    Source: neurocad/.gitignore (inside the installed package).
    Destination: ./.gitignore (cwd).
    """
    dst = Path(".gitignore")
    src = package_dir() / ".gitignore"

    if not src.exists():
        print("[neurocad] .gitignore template not found in package")
        return

    src_content = src.read_text(encoding="utf-8")

    # ===== Case 1: no .gitignore — copy =====
    if not dst.exists():
        shutil.copy(src, dst)
        print(f"[neurocad] .gitignore created from template: {dst}")
        return

    dst_content = dst.read_text(encoding="utf-8")

    # ===== Case 2: identical — skip =====
    if dst_content.strip() == src_content.strip():
        print("[neurocad] .gitignore already up to date — skipping")
        return

    src_has_markers = _GITIGNORE_BEGIN in src_content and _GITIGNORE_END in src_content
    dst_has_markers = _GITIGNORE_BEGIN in dst_content and _GITIGNORE_END in dst_content

    # ===== Case 3: dst has no markers — full overwrite =====
    if not dst_has_markers:
        shutil.copy(src, dst)
        print(f"[neurocad] .gitignore overwritten (no markers found): {dst}")
        return

    # ===== Case 4: both have markers — replace block only =====
    if src_has_markers and dst_has_markers:
        src_block = _extract_gitignore_block(src_content)
        dst_block = _extract_gitignore_block(dst_content)

        if src_block == dst_block:
            print("[neurocad] .gitignore NEUROCAD block up to date — skipping")
            return

        new_content = dst_content.replace(dst_block, src_block)
        dst.write_text(new_content, encoding="utf-8")
        print(f"[neurocad] .gitignore NEUROCAD block updated: {dst}")
        return

    # Fallback: src has no markers (некорректный пакет)
    print("[neurocad] .gitignore template has no markers — skipping")


def _extract_gitignore_block(content: str) -> str:
    """Extract the NEUROCAD block (BEGIN..END inclusive) from .gitignore content."""
    i = content.index(_GITIGNORE_BEGIN)
    j = content.index(_GITIGNORE_END) + len(_GITIGNORE_END)
    return content[i:j]


# ============================================
# BUILTIN APP COPY
# ============================================

def _copy_builtin_app(app_dir: Path):
    """
    Copy builtin mod/* into app/ (each module as a subfolder).

    Skips:
      - __init__.py
      - __pycache__
      - existing destinations
    """
    src = package_engine_dir() / "mod"
    if not src.exists() or not src.is_dir():
        return

    for item in src.iterdir():
        # Skip dunder/service entries
        if item.name.startswith("_"):
            continue

        dst = app_dir / item.name
        if dst.exists():
            continue

        if item.is_dir():
            shutil.copytree(item, dst)
        else:
            shutil.copy(item, dst)
