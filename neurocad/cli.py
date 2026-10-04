# neurocad/cli.py

"""CLI for NeuroCad."""

import argparse


# ============================================
# run — start the development server
# ============================================

def cmd_run(args):
    import sys
    import os
    import uvicorn
    from .config import settings
    from .utils.paths import ensure_workdirs

    # Ensure cwd is in sys.path (so uvicorn can find main:app)
    cwd = os.getcwd()
    if cwd not in sys.path:
        sys.path.insert(0, cwd)

    # Create working dirs and files (main.py, .env, app/, etc.)
    ensure_workdirs()

    host = args.host or settings.APP_HOST
    port = args.port or settings.APP_PORT
    reload = args.reload

    print(f"neurocad run — http://{host}:{port}")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        app_dir=cwd,
        reload_dirs=[cwd] if reload else None,
    )


# ============================================
# create-user — create a user (including short logins)
# ============================================

def cmd_create_user(args):
    """
    Create a user through the same code path as a normal signup.

    Why this exists: the registration form requires a login of at
    least 8 characters, so that short names (www, api, dev, admin,
    …) stay reserved for system subdomains. But an operator with
    shell access sometimes needs a technical account with a short
    login — for example "demo" for a demo site.

    This command calls CoreAuthRegisterService.register_user with
    skip_login_length_check=True. Every side-record (User, Nav,
    and — via ensure_user_balance — the trial Balance row) is set
    up exactly as it would be for a normal user. No direct INSERTs,
    no skipped bootstrap steps.
    """
    import asyncio

    async def _run() -> int:
        # Import heavy modules lazily: `neurocad --help` and
        # `neurocad run` must not pay for SQLAlchemy / models.
        from .core.auth.register.service import CoreAuthRegisterService
        from .utils.sqlite import (
            init_sqlite,
            close_sqlite,
            ensure_user_balance,
        )

        # Prepare the schema and bootstrap rows (superadmin, default
        # nav, admin balance). On an already-initialized DB this is
        # a no-op — apply_migrations() and ensure_* are idempotent.
        try:
            await init_sqlite(log=None)
        except Exception as e:
            print(f"Ошибка инициализации БД: {e}")
            return 1

        try:
            result = await CoreAuthRegisterService.register_user(
                login=args.login,
                password=args.password,
                password_confirm=args.password,
                name=args.name,
                email=args.email,
                skip_login_length_check=True,
                log=None,
            )

            if not result.get("success"):
                print(f"Ошибка: {result.get('message') or 'не удалось создать пользователя'}")
                return 1

            data = result.get("data") or {}
            user_id = data.get("id")
            if user_id is None:
                print("Ошибка: сервер не вернул id пользователя")
                return 1

            print(f"Пользователь создан: id={user_id}, login={data.get('login')}")

            # Guarantee a Balance row. register_user does not create
            # one (Balance is normally created lazily on the first
            # LLM / page request, or manually from the admin page).
            # For a technical account we want it right away, with
            # the same trial defaults the admin gets on first start.
            bal_id = await ensure_user_balance(user_id, log=None)
            if bal_id:
                print(f"Баланс создан: id={bal_id} (trial, 2 000 000 токенов)")
            else:
                print("Предупреждение: баланс не создан (проверьте логи)")

            return 0
        finally:
            try:
                await close_sqlite(log=None)
            except Exception:
                pass

    exit_code = asyncio.run(_run())
    raise SystemExit(exit_code)


# ============================================
# main
# ============================================

def main(argv=None):
    parser = argparse.ArgumentParser(prog="neurocad", description="NeuroCad CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # ---- run ----
    p_run = sub.add_parser("run", help="Start uvicorn")
    p_run.add_argument("--host", default=None)
    p_run.add_argument("--port", type=int, default=None)
    p_run.add_argument("--reload", action="store_true")
    p_run.set_defaults(func=cmd_run)

    # ---- create-user ----
    p_cu = sub.add_parser(
        "create-user",
        help="Create a user (allows short logins via shell access)",
    )
    p_cu.add_argument(
        "--login", required=True,
        help='Login, e.g. "demo". May be shorter than 8 characters.',
    )
    p_cu.add_argument(
        "--password", required=True,
        help="Password (min 8 characters).",
    )
    p_cu.add_argument(
        "--name", default=None,
        help="Display name (default: same as login).",
    )
    p_cu.add_argument(
        "--email", default=None,
        help="Email (optional).",
    )
    p_cu.set_defaults(func=cmd_create_user)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()