# app/core/node/index/cards/route.py

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import Optional
from .....utils.templates import templates
from ...auth.dependencies import get_current_user
from .schema import CoreNodeIndexCardsNode
from .crud import create, update, delete, restore, get, get_list, get_deleted
from .shared import get_root

router = APIRouter(prefix="/cards", tags=["core/node/index/cards"])


@router.post("/node")
async def create_endpoint(
    request: Request,
    node_data: CoreNodeIndexCardsNode,
    section: int = Query(..., description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
):
    return await create(request, node_data, current_user, section)


@router.get("/nodes")
async def get_list_endpoint(
    parent_id: Optional[int] = None,
    section: int = Query(None, description="1 - общий, 2 - личный"),
    is_delete: bool = False,
    current_user: dict = Depends(get_current_user)
):
    # Если section не передан, определяем по правам пользователя
    if section is None:
        if current_user.get("is_superadmin"):
            section = 2  # суперадмин по умолчанию видит личное пространство
        else:
            section = 1  # обычный пользователь видит общие документы
    
    result = await get_list(parent_id, current_user, section, is_delete)
    print(f'result: {result}')
    return result


@router.get("/node/{node_id}")
async def get_endpoint(
    node_id: int,
    current_user: dict = Depends(get_current_user)
):
    return await get(node_id, current_user)


@router.put("/node/{node_id}")
async def update_endpoint(
    request: Request,
    node_id: int,
    section: int = Query(..., description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
):
    data = await request.json()
    return await update(request, node_id, data, current_user, section)


@router.delete("/node/{node_id}")
async def delete_endpoint(
    request: Request,
    node_id: int,
    section: int = Query(..., description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
):
    return await delete(request, node_id, current_user, section)


@router.post("/node/{node_id}/restore")
async def restore_endpoint(
    request: Request,
    node_id: int,
    section: int = Query(..., description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
):
    return await restore(request, node_id, current_user, section)


@router.get("/deleted")
async def get_deleted_endpoint(
    section: int = Query(1, description="1 - общий, 2 - личный"),
    current_user: dict = Depends(get_current_user)
):
    return await get_deleted(current_user, section)


@router.get("/shared-root")
async def get_shared_root_endpoint(
    current_user: dict = Depends(get_current_user)
):
    root_node_id = await get_root()
    return {"root_node_id": root_node_id}


@router.post("/card")
async def render_card(request: Request):
    try:
        data = await request.json()
        node = data.get("node", {})
        if not node:
            raise HTTPException(status_code=400, detail="No node data provided")
            
        return templates.TemplateResponse("core/node/index/cards/item.html", {
            "request": request,
            "node": node
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")