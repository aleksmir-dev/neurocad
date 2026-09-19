# neurocad/cli.py

"""CLI for NeuroCad."""

import argparse


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


def main(argv=None):
    parser = argparse.ArgumentParser(prog="neurocad", description="NeuroCad CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="Start uvicorn")
    p_run.add_argument("--host", default=None)
    p_run.add_argument("--port", type=int, default=None)
    p_run.add_argument("--reload", action="store_true")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()