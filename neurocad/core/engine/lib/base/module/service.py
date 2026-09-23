# neurocad/core/engine/lib/base/module/service.py

"""
Module resolution utilities.

Resolves the current module (Module model + mod_id) from a FastAPI
request. Used by every engine component that needs per-module data:
    - assets (media library)
    - word (pages)
    - pages (catalog)
    - and others.

Module name resolution priority:
    1. ?module=<name>                (passed by frontend)
    2. Referer: /core/engine/<name>/...  (fallback)

Raises HTTPException(400) if module cannot be resolved,
HTTPException(404) if module not found in DB.
"""

from typing import Optional

from fastapi import HTTPException, Request
from sqlalchemy import select

from .....models.module import Module
from ......utils.sqlite import get_db_sqlite


# ============================================
# PUBLIC API
# ============================================

def resolve_module_name(request: Request) -> str:
    """
    Resolve module name from a request.

    Priority:
      1. ?module=<name>  — passed by frontend
      2. Referer: /core/engine/<name>/...  — fallback

    Raises HTTPException(400) if module cannot be resolved.
    """
    # 1. Query param
    module_name = request.query_params.get("module")
    if module_name:
        return module_name

    # 2. Referer
    referer = request.headers.get("referer", "")
    if "/core/engine/" in referer:
        module_name = referer.split("/core/engine/", 1)[1].split("/")[0]
        if module_name:
            return module_name

    raise HTTPException(status_code=400, detail="Модуль не определён")


async def resolve_module(request: Request) -> Module:
    """
    Resolve Module instance from a request.

    Uses resolve_module_name() to get the name, then looks it up in DB.

    Raises HTTPException(400) if module cannot be resolved,
    HTTPException(404) if module not found.
    """
    module_name = resolve_module_name(request)

    async for session in get_db_sqlite():
        stmt = select(Module).where(
            Module.name == module_name,
            Module.is_delete == False,
        )
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()

        if not module:
            raise HTTPException(
                status_code=404,
                detail=f"Модуль {module_name} не найден",
            )
        return module

    raise HTTPException(status_code=500, detail="DB error")


async def resolve_module_id(request: Request) -> int:
    """
    Resolve module id (mod_id) from a request.

    Convenience wrapper around resolve_module() when only the id is needed.
    """
    module = await resolve_module(request)
    return module.id


async def get_module_name_by_id(mod_id: int) -> Optional[str]:
    """
    Resolve module name by mod_id.

    Returns None if module not found.
    """
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == mod_id)
        result = await session.execute(stmt)
        module = result.scalar_one_or_none()
        return module.name if module else None
    return None


async def get_module_by_id(mod_id: int) -> Optional[Module]:
    """
    Resolve Module instance by mod_id.

    Returns None if module not found.
    """
    async for session in get_db_sqlite():
        stmt = select(Module).where(Module.id == mod_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    return None