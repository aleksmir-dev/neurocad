# neurocad/core/engine/lib/word/llm/route.py

"""
API LLM-редактора: пресеты + чат.

Endpoints:
  GET    /core/engine/lib/word/llm/presets                    — список пресетов
  POST   /core/engine/lib/word/llm/presets                    — создать пресет
  GET    /core/engine/lib/word/llm/presets/{id}               — один пресет
  PUT    /core/engine/lib/word/llm/presets/{id}               — обновить пресет
  DELETE /core/engine/lib/word/llm/presets/{id}               — мягко удалить
  POST   /core/engine/lib/word/llm/presets/{id}/restore       — восстановить
  POST   /core/engine/lib/word/llm/presets/{id}/thumbnail     — загрузить миниатюру
  DELETE /core/engine/lib/word/llm/presets/{id}/thumbnail     — удалить миниатюру

  GET    /core/engine/lib/word/llm/chat/{page_id}/history     — история чата
  POST   /core/engine/lib/word/llm/chat/{page_id}             — отправить сообщение

Все эндпоинты (кроме GET-списка пресетов, GET-одного пресета и GET-истории чата) —
только для суперадмина.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from neurocad.core.auth.dependencies import get_current_user
from .service import LLMService
from .schema import (
    LLMPresetCreate,
    LLMPresetUpdate,
    LLMChatMessageCreate,
)


router = APIRouter(prefix="/llm", tags=["core/engine/lib/word/llm"])


# ============================================
# ПРЕСЕТЫ — СПИСОК
# ============================================

@router.get("/presets")
async def list_presets(
    include_deleted: bool = Query(False, description="Включая удалённые"),
) -> JSONResponse:
    """Список пресетов. Публичный эндпоинт."""
    result = await LLMService.list_presets(include_deleted=include_deleted)

    return JSONResponse({
        "success": True,
        "data": result["items"],
        "total": result["total"],
    })


# ============================================
# ПРЕСЕТЫ — ОДИН
# ============================================

@router.get("/presets/{preset_id}")
async def get_preset(preset_id: int) -> JSONResponse:
    """Получить один пресет по ID. Публичный эндпоинт."""
    item = await LLMService.get_preset(preset_id)

    if not item:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# ПРЕСЕТЫ — СОЗДАНИЕ
# ============================================

@router.post("/presets")
async def create_preset(
    data: LLMPresetCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Создать пресет. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    item = await LLMService.create_preset(
        name=data.name,
        description=data.description,
        html=data.html,
    )

    if not item:
        raise HTTPException(status_code=400, detail="Не удалось создать пресет")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# ПРЕСЕТЫ — ОБНОВЛЕНИЕ
# ============================================

@router.put("/presets/{preset_id}")
async def update_preset(
    preset_id: int,
    data: LLMPresetUpdate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Обновить пресет. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    item = await LLMService.update_preset(
        preset_id=preset_id,
        name=data.name,
        description=data.description,
        html=data.html,
    )

    if not item:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "data": item,
    })


# ============================================
# ПРЕСЕТЫ — МЯГКОЕ УДАЛЕНИЕ
# ============================================

@router.delete("/presets/{preset_id}")
async def delete_preset(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Мягко удалить пресет. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await LLMService.delete_preset(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "message": "Пресет удалён",
    })


# ============================================
# ПРЕСЕТЫ — ВОССТАНОВЛЕНИЕ
# ============================================

@router.post("/presets/{preset_id}/restore")
async def restore_preset(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Восстановить удалённый пресет. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await LLMService.restore_preset(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "message": "Пресет восстановлен",
    })


# ============================================
# ПРЕСЕТЫ — ЗАГРУЗКА МИНИАТЮРЫ
# ============================================

@router.post("/presets/{preset_id}/thumbnail")
async def upload_thumbnail(
    preset_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Загрузить PNG-миниатюру пресета. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    try:
        result = await LLMService.upload_thumbnail(preset_id, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки: {str(e)}")

    if not result:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "data": result,
    })


# ============================================
# ПРЕСЕТЫ — УДАЛЕНИЕ МИНИАТЮРЫ
# ============================================

@router.delete("/presets/{preset_id}/thumbnail")
async def delete_thumbnail(
    preset_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Удалить миниатюру пресета. Только суперадмин."""
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await LLMService.delete_thumbnail(preset_id)

    if not result:
        raise HTTPException(status_code=404, detail="Пресет не найден")

    return JSONResponse({
        "success": True,
        "message": "Миниатюра удалена",
    })


# ============================================
# ЧАТ — ИСТОРИЯ
# ============================================

@router.get("/chat/{page_id}/history")
async def get_chat_history(page_id: int) -> JSONResponse:
    """
    История чата по странице. Публичный эндпоинт —
    нужен для отображения истории при открытии LLM-редактора.
    """
    messages = await LLMService.load_chat_history(page_id)

    return JSONResponse({
        "success": True,
        "data": messages,
    })


# ============================================
# ЧАТ — ОТПРАВКА СООБЩЕНИЯ
# ============================================

@router.post("/chat/{page_id}")
async def send_chat_message(
    page_id: int,
    data: LLMChatMessageCreate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Отправить сообщение в чат по странице.

    Возвращает:
      - user_message — сохранённое сообщение пользователя;
      - assistant_message — ответ LLM;
      - html — новый HTML страницы.

    Только суперадмин.
    """
    if not current_user.get("is_superadmin", False):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    result = await LLMService.send_chat_message(
        page_id=page_id,
        user_message=data.message,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Страница не найдена")

    return JSONResponse({
        "success": True,
        "data": result,
    })