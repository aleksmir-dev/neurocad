# neurocad/cli.py

"""CLI для NeuroCad."""

import argparse
import shutil
from pathlib import Path

from .utils.paths import (
    ensure_workdirs,
    package_alembic_dir,
    package_alembic_ini,
    package_dir,
)


def cmd_init(args):
    print("🚀 neurocad init")
    ensure_workdirs()

    dst_ini = Path("alembic.ini")
    if not dst_ini.exists():
        shutil.copy(package_alembic_ini(), dst_ini)
        print(f"  ✓ {dst_ini}")

    dst_alembic = Path("alembic")
    if not dst_alembic.exists():
        shutil.copytree(package_alembic_dir(), dst_alembic)
        print(f"  ✓ {dst_alembic}/")

    # Копируем встроенный модуль app/ в app/ проекта
    src_mod_app = package_dir() / "core" / "engine" / "mod" / "app"
    dst_app = Path("app")

    if src_mod_app.exists() and src_mod_app.is_dir():
        for item in src_mod_app.iterdir():
            # __init__.py — для Python-пакета, в проекте не нужен
            if item.name == "__init__.py":
                continue
            dst = dst_app / item.name
            if dst.exists():
                continue  # не перезаписываем пользовательское
            if item.is_dir():
                shutil.copytree(item, dst)
            else:
                shutil.copy(item, dst)
        print(f"  ✓ app/ (встроенный модуль)")

    env = Path(".env")
    if not env.exists():
        env.write_text(
            "SQLITE_URL=sqlite+aiosqlite:///base/neurocad.db\n"
            "SQLITE_URL_SYNC=sqlite:///base/neurocad.db\n"
            "SECRET_KEY=change-me-in-production\n"
            "SUPERADMIN_LOGIN=admin\n"
            "SUPERADMIN_PASSWORD=admin\n",
            encoding="utf-8",
        )
        print(f"  ✓ {env}")

    main_py = Path("main.py")
    if not main_py.exists():
        main_py.write_text(
            "from neurocad import NeuroCad\n"
            "\n"
            "app = NeuroCad()\n",
            encoding="utf-8",
        )
        print(f"  ✓ {main_py}")

    print("✅ Готово. Запусти: neurocad upgrade && neurocad run")


def cmd_upgrade(args):
    print("🔄 neurocad upgrade")
    from .utils.migrations import apply_migrations
    apply_migrations()
    print("✅ Миграции применены")


def cmd_run(args):
    import sys
    import os
    import uvicorn
    from .config import settings

    # Гарантируем, что cwd в sys.path (чтобы uvicorn нашёл main:app)
    cwd = os.getcwd()
    if cwd not in sys.path:
        sys.path.insert(0, cwd)

    host = args.host or settings.APP_HOST
    port = args.port or settings.APP_PORT
    reload = args.reload

    print(f"🚀 neurocad run — http://{host}:{port}")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        app_dir=cwd,          # ← чтобы uvicorn нашёл main в дочернем процессе
        reload_dirs=[cwd] if reload else None,
    )


def main(argv=None):
    parser = argparse.ArgumentParser(prog="neurocad", description="NeuroCad CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="Создать рабочий проект")
    p_init.set_defaults(func=cmd_init)

    p_up = sub.add_parser("upgrade", help="Применить миграции Alembic")
    p_up.set_defaults(func=cmd_upgrade)

    p_run = sub.add_parser("run", help="Запустить uvicorn")
    p_run.add_argument("--host", default=None)
    p_run.add_argument("--port", type=int, default=None)
    p_run.add_argument("--reload", action="store_true")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()