# neurocad/utils/paths.py

"""Package paths and user working directory helpers."""

import json
import shutil
import site
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


def package_demo_dir() -> Path:
    """
    Package demo dir (neurocad/base/demo/).

    Injected into the wheel from `base/demo/` in the repo via
    pyproject.toml → [tool.hatch.build.targets.wheel.force-include]:
        "base/demo" = "neurocad/base/demo"
    """
    return package_dir() / "base" / "demo"


# ============================================
# USER PATHS (relative to cwd)
# ============================================

def user_base_dir() -> Path:
    """User base dir (relative to cwd) — where neurocad.db lives."""
    from ..config import settings
    return Path(settings.BASE_PATH)


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


def user_demo_dir() -> Path:
    """
    User demo dir — `base/demo/` inside cwd, next to neurocad.db.

    The manifest.json inside this folder carries the `applied` flag:
      - applied: false → demo has never been imported into this project;
      - applied: true  → demo has been imported once; do not re-import.

    The user controls demo data by this folder:
      - keep it        → demo stays applied (applied: true);
      - delete the DB  → clean DB, demo will NOT be re-imported
                         (applied is still true);
      - delete base/demo/ → demo will be re-copied from the package
                            and re-imported on the next run.
    """
    return user_base_dir() / "demo"


# ============================================
# ENSURE WORKDIRS
# ============================================

def ensure_pth_file():
    """
    Ensure a .pth file exists in site-packages so that the project root
    is always in sys.path. This fixes imports for Jupyter Notebooks and
    other tools that don't inherit the current working directory.
    """
    # We only do this if the package is installed in editable mode
    # (i.e., it's not inside site-packages itself).
    pkg_dir = package_dir()
    if "site-packages" in str(pkg_dir) or "dist-packages" in str(pkg_dir):
        return

    project_root = str(pkg_dir.parent)
    
    try:
        # Get all possible site-packages directories
        site_dirs = site.getsitepackages()
        if hasattr(site, "getusersitepackages"):
            site_dirs.append(site.getusersitepackages())
            
        for sp_dir in site_dirs:
            pth_path = Path(sp_dir) / "neurocad.pth"
            if pth_path.exists():
                content = pth_path.read_text(encoding="utf-8").strip()
                if content == project_root:
                    continue  # Already correct
            
            # Write the path to the .pth file
            try:
                pth_path.write_text(project_root + "\n", encoding="utf-8")
                print(f"[neurocad] created .pth file: {pth_path} -> {project_root}")
            except PermissionError:
                # Ignore permission errors (should not happen in user venv)
                pass
    except Exception as e:
        print(f"[neurocad] failed to create .pth file: {e}")


def ensure_workdirs():
    """
    Create working directories and files in cwd if missing.

    Created:
      - base/, log/, media/ — working dirs
      - static/ — synced static (nginx root)
      - app/ — with copy of mod/* (if empty)
      - core/engine/ — user overrides dir
      - alembic/versions/ — user migrations
      - base/demo/ — copy of package demo, unless applied:true or DB exists
      - main.py — entry point (if missing)
      - .env — settings (if missing, copied from package .env.example)
      - .gitignore — project gitignore (created or synced)
      - .pth file in site-packages (for Jupyter/editable mode)

    Demo copy rule (see `_copy_demo_if_needed`):
      Copy package demo (neurocad/base/demo) to cwd/base/demo only when
      BOTH:
        - the DB does not exist yet (this is the first run), and
        - cwd/base/demo does not exist yet, and
        - cwd/base/demo/manifest.json is missing or has applied:false.

      Any of those being false → no copy.
    """
    from ..config import settings

    # ===== 0. Ensure .pth file for Jupyter =====
    ensure_pth_file()

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

    # ===== 4. base/demo/ — copy from package if not applied yet =====
    _copy_demo_if_needed()

    # ===== 5. main.py — if missing =====
    main_py = Path("main.py")
    if not main_py.exists():
        main_py.write_text(
            "from neurocad import NeuroCad\n"
            "\n"
            "app = NeuroCad()\n",
            encoding="utf-8",
        )

    # ===== 6. .env — if missing =====
    # Template lives in the package as neurocad/.env.example
    # (injected via pyproject.toml → force-include).
    # Single source of truth: edit the template, not this file.
    env = Path(".env")
    if not env.exists():
        try:
            env_example = package_dir() / ".env.example"
            if env_example.is_file():
                shutil.copy(env_example, env)
                print(f"[neurocad] .env created from template: {env}")
            else:
                print("[neurocad] .env.example not found in package — .env not created")
        except Exception as e:
            print(f"[neurocad] failed to create .env: {e}")

    # ===== 7. .gitignore — create or sync =====
    ensure_gitignore()


# ============================================
# DEMO COPY
# ============================================

def _read_applied(demo_dir: Path) -> bool:
    """
    Read the `applied` flag from <demo_dir>/manifest.json.

    Returns False if the file is missing, unreadable, or has no
    `applied` field. That means "treat as not yet applied" — safe
    default: we would rather re-import than silently skip demo on
    the first run.
    """
    manifest = demo_dir / "manifest.json"
    if not manifest.is_file():
        return False
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception:
        return False
    return bool(data.get("applied", False))


def _copy_demo_if_needed():
    """
    Copy `base/demo/` from the package into cwd/base/demo/ — but only
    when demo has never been applied.

    Skip the copy if ANY of these is true:
      - the DB exists (not the first run);
      - cwd/base/demo exists AND its manifest has applied:true
        (demo already imported once; respect the user's state);
      - the package has no demo.

    Otherwise — copy.

    Notes:
      - If cwd/base/demo exists with applied:false (user copied an
        unapplied demo folder by hand, or the very first copy) — we
        still don't touch it: the folder is already there, the
        importer will read it and set applied:true.
      - If cwd/base/demo exists with applied:true — never copy.
      - Deleting cwd/base/demo is the user's signal "I want demo
        again": the next run will copy it from the package and
        re-import (as long as the DB does not exist or the applied
        flag was reset by the deletion).
    """
    src = package_demo_dir()
    dst = user_demo_dir()
    db_file = user_base_dir() / "neurocad.db"

    if not src.is_dir():
        # This build ships without demo data — nothing to copy.
        return

    if dst.exists():
        # Folder already there. If applied:true — definitely skip.
        # If applied:false — also skip: the importer will pick it up.
        return

    if db_file.exists():
        # Not the first run: the DB exists, so we are past the
        # "first copy" moment. Respect the current state: base/demo
        # is gone → the user deliberately removed it.
        return

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dst)
        print(f"[neurocad] demo copied to: {dst}")
    except Exception as e:
        print(f"[neurocad] failed to copy demo: {e}")


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


# ============================================
# SERVICE INSTALL (systemd + nginx)
# ============================================

def _package_etc_dir() -> Path:
    """
    Package `etc/` dir — where the systemd / nginx templates live.

    Injected into the wheel from `etc/` in the repo via
    pyproject.toml → [tool.hatch.build.targets.wheel.force-include]:
        "etc/system.conf" = "neurocad/etc/system.conf"
        "etc/nginx.conf"  = "neurocad/etc/nginx.conf"
    """
    return package_dir() / "etc"


def _render_template(template: str, subs: dict) -> str:
    """
    Substitute {placeholders} in a template.

    Uses str.format_map with a dict that returns the placeholder
    text unchanged for unknown keys — so a stray {foo} does not
    crash the install, it just stays literal.
    """
    class _SafeDict(dict):
        def __missing__(self, key):
            return "{" + key + "}"

    return template.format_map(_SafeDict(subs))


def install_service_files(
    name: str | None = None,
    port: int | None = None,
    force: bool = False,
    install_systemd: bool = True,
    install_nginx: bool = True,
) -> None:
    """
    Install systemd unit and nginx config for this project.

    Reads templates from the installed package
    (neurocad/etc/system.conf, neurocad/etc/nginx.conf),
    substitutes placeholders, writes to /etc.

    Skips files that already exist unless force=True. This is
    intentional: users may have custom edits (extra nginx rules,
    unit tweaks) that should survive reinstalls.

    Requires root — writes to /etc/systemd/system and /etc/nginx.
    Caller (CLI `neurocad install`) should check permission and
    tell the user to run with sudo.

    Placeholders substituted in both templates:
        {name}         — service name / domain (e.g. "neurocad.ru")
        {project_dir}  — absolute path to the project (cwd)
        {venv_bin}     — absolute path to the venv bin dir
        {user}         — system user running the service
        {group}        — system group
        {home}         — HOME env var for the process
        {app_host}     — bind host (default 127.0.0.1)
        {app_port}     — bind port
        {log_dir}      — project log/ dir
        {static_dir}   — project static/ dir
        {media_dir}    — project media/ dir

    Side effects:
        - writes /etc/systemd/system/<name>.service
        - writes /etc/nginx/sites-available/<name>
        - creates symlink /etc/nginx/sites-enabled/<name>
        - creates /etc/neurocad/ and /etc/neurocad/<name>.env
          (0600, empty — for per-instance secrets)
        - runs `systemctl daemon-reload`
        - runs `nginx -t` and `systemctl reload nginx`

    Multi-instance: each project dir gets its own unit, nginx
    site, cron file, and port. No collisions between instances
    on the same host.
    """
    import getpass
    import grp
    import os
    import subprocess
    import sys

    from ..config import settings

    # ---- Resolve values ----
    name = (name or settings.APP_DOMAIN or Path.cwd().name).strip()
    if not name:
        raise ValueError(
            "Cannot determine service name: set APP_DOMAIN in .env "
            "or pass --domain"
        )

    if port is None:
        port = int(settings.APP_PORT or 8012)

    project_dir = Path.cwd().resolve()
    venv_bin = Path(sys.executable).parent.resolve()

    try:
        user = getpass.getuser()
    except Exception:
        user = "root"
    try:
        group = grp.getgrgid(os.getgid()).gr_name
    except Exception:
        group = user

    home = os.environ.get("HOME") or str(Path.home())

    subs = {
        "name": name,
        "project_dir": str(project_dir),
        "venv_bin": str(venv_bin),
        "user": user,
        "group": group,
        "home": home,
        "app_host": settings.APP_HOST or "127.0.0.1",
        "app_port": str(port),
        "log_dir": str(project_dir / "log"),
        "static_dir": str(project_dir / "static"),
        "media_dir": str(project_dir / "media"),
    }

    etc_dir = _package_etc_dir()

    # ---- Sanity check: templates present? ----
    if install_systemd and not (etc_dir / "system.conf").is_file():
        raise FileNotFoundError(
            f"systemd template not found: {etc_dir / 'system.conf'}"
        )
    if install_nginx and not (etc_dir / "nginx.conf").is_file():
        raise FileNotFoundError(
            f"nginx template not found: {etc_dir / 'nginx.conf'}"
        )

    # ---- 1. systemd unit ----
    if install_systemd:
        unit_dst = Path(f"/etc/systemd/system/{name}.service")
        if force or not unit_dst.exists():
            tpl = (etc_dir / "system.conf").read_text(encoding="utf-8")
            content = _render_template(tpl, subs)
            unit_dst.write_text(content, encoding="utf-8")
            unit_dst.chmod(0o644)
            subprocess.run(["systemctl", "daemon-reload"], check=True)
            print(f"[neurocad] installed: {unit_dst}")
        else:
            print(f"[neurocad] skip (exists): {unit_dst}")

    # ---- 2. nginx config ----
    if install_nginx:
        nginx_dst = Path(f"/etc/nginx/sites-available/{name}")
        nginx_link = Path(f"/etc/nginx/sites-enabled/{name}")

        if force or not nginx_dst.exists():
            tpl = (etc_dir / "nginx.conf").read_text(encoding="utf-8")
            content = _render_template(tpl, subs)
            nginx_dst.write_text(content, encoding="utf-8")
            nginx_dst.chmod(0o644)

            # Symlink into sites-enabled/ (only if not already there).
            if not nginx_link.exists():
                nginx_link.symlink_to(nginx_dst)

            # Verify and reload nginx.
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)
            print(f"[neurocad] installed: {nginx_dst}")
        else:
            print(f"[neurocad] skip (exists): {nginx_dst}")

    # ---- 3. /etc/neurocad/<name>.env — empty, for secrets ----
    env_dir = Path("/etc/neurocad")
    env_dir.mkdir(parents=True, exist_ok=True)
    env_dst = env_dir / f"{name}.env"
    if force or not env_dst.exists():
        env_dst.write_text(
            "# NeuroCad secrets / overrides for this instance.\n"
            f"# Loaded by {name}.service via EnvironmentFile.\n"
            "#\n"
            "# Example:\n"
            "#   PANEL_TOKEN=<openssl rand -hex 32>\n"
            "#   NEUROCAD_SECRET_KEY=<fernet key>\n",
            encoding="utf-8",
        )
        env_dst.chmod(0o600)
        print(f"[neurocad] created: {env_dst}")

    # ---- 4. Done — print next steps ----
    print()
    print("[neurocad] done.")
    print()
    print("[neurocad] next steps:")
    print(f"    1. Add secrets to /etc/neurocad/{name}.env (chmod 600)")
    print(f"    2. systemctl enable --now {name}.service")
    print(f"    3. systemctl status {name}.service")
    if install_nginx:
        print(f"    4. certbot --nginx -d {name}    # HTTPS (Let's Encrypt)")
    print()