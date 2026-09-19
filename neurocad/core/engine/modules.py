# neurocad/core/engine/modules.py

"""
Module registry — fills `modules` table from mod/ directory.

Each JSON config in mod/ with component == "module"
is registered as a Module row (INSERT if missing).

Idempotent: existing rows are skipped, nothing is deleted.

NOTE: temporary bootstrap for 0.1.x.
Later this will be replaced by a web UI (module tree + JSON editor).
"""

import json
from pathlib import Path

from sqlalchemy import select

from ...utils.sqlite import get_db_sqlite


async def ensure_modules(mod_root: Path, log=None) -> int:
    """
    Scan mod_root/**/*.json, register modules in DB.

    A JSON file is considered a module config if it has
    component == "module".

    Module.name = config_file.stem  (folder/file name, matches route.py)
    Module.url  = data["url"] or "/{stem}"  (client-facing path prefix)

    Returns number of new modules created.
    """
    from ..models.module import Module

    if not mod_root.exists():
        if log:
            await log.log_info(
                target="modules",
                message=f"mod_root does not exist: {mod_root}",
            )
        else:
            print(f"[Modules] mod_root does not exist: {mod_root}")
        return 0

    created = 0

    async for session in get_db_sqlite():
        for config_file in mod_root.rglob("*.json"):
            try:
                data = json.loads(config_file.read_text(encoding="utf-8"))
            except Exception:
                continue

            if data.get("component") != "module":
                continue

            name = config_file.stem
            if not name:
                continue

            # url — client-facing path prefix, e.g. "/app", "/aleksmir.ru"
            url = data.get("url") or f"/{name}"

            stmt = select(Module).where(Module.name == name)
            result = await session.execute(stmt)
            if result.scalar_one_or_none():
                continue

            module = Module(
                name=name,
                url=url,
                description=None,
                is_delete=False,
            )
            session.add(module)
            created += 1

        if created:
            await session.commit()

    if log:
        await log.log_info(target="modules", message=f"created={created}")
    else:
        print(f"[Modules] created={created}")

    return created