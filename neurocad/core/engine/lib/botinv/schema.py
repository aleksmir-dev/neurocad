# neurocad/core/engine/lib/botinv/schema.py

"""
Pydantic schemas for the inventory module (botinv).

All request bodies live here. Response bodies are returned as plain
dicts (see service.py → _sheet_to_dict / _item_to_dict) — the route
layer wraps them in the { success, data } envelope, same as every
other module in this project. Response models are NOT defined as
Pydantic classes for the same reason: service.py is the single
source of truth for the shape, and duplicating it in Pydantic would
mean two places to update.

Endpoint mapping:

    POST  /botinv/mark                          → CoreEngineLibBotInvMarkRequest
    POST  /botinv/room                          → CoreEngineLibBotInvRoomRequest
    PATCH /botinv/sheets/{id}                   → CoreEngineLibBotInvSheetUpdateRequest

The upload endpoint (POST /botinv/sheets/import) uses
multipart/form-data — file, name, batch_date — and is NOT defined
as a Pydantic model. FastAPI parses the form fields directly via
Form(...). See route.py → import_sheet.
"""

from pydantic import BaseModel, Field
from typing import Optional


# ============================================
# MARK — find an item by inventory number
# ============================================

class CoreEngineLibBotInvMarkRequest(BaseModel):
    """
    Body for POST /botinv/mark.

    Two ways to identify an item:

      - inv_num   — the string the user typed. The service first
                    tries an exact (case-insensitive) match; if
                    that fails, it falls back to a substring search
                    and may return several candidates.

      - chosen_id — the id of a candidate the user picked from a
                    previously returned list (status "ambiguous").
                    When set, inv_num is ignored: the service looks
                    the item up by primary key directly.

    current_room — the room the accountant is currently in. Comes
    from the frontend (localStorage). The backend does not persist
    it; it is used only to fill "Кабинет после" and to append to
    the note. NULL means "no room selected yet" — the service will
    refuse with status "no_room".

    inv_num is required by the schema (min_length=1), even when
    chosen_id is set. The frontend sends both: chosen_id for the
    lookup, inv_num as a fallback / for logging. That keeps the
    API simple: exactly one request shape for both paths.
    """
    inv_num: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Инвентарный номер (то, что ввёл пользователь)",
    )
    current_room: Optional[str] = Field(
        None,
        max_length=64,
        description="Текущий кабинет (из localStorage на фронте)",
    )
    chosen_id: Optional[int] = Field(
        None,
        description=(
            "ID позиции, выбранной из списка кандидатов "
            "(status='ambiguous' в предыдущем ответе). "
            "Если задан — поиск идёт по этому id, inv_num игнорируется."
        ),
    )


# ============================================
# ROOM — switch the current room
# ============================================

class CoreEngineLibBotInvRoomRequest(BaseModel):
    """
    Body for POST /botinv/room.

    The room number WITHOUT the leading "#" — the frontend strips
    it before the request. The value is validated against the
    active sheet: at least one item must have room_before == room.
    """
    room: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Номер кабинета (без решётки)",
    )


# ============================================
# SHEET UPDATE — rename / change date
# ============================================

class CoreEngineLibBotInvSheetUpdateRequest(BaseModel):
    """
    Body for PATCH /botinv/sheets/{id}.

    Both fields are optional — send only what changes. Omitting a
    field leaves the current value untouched.
    """
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Новое название ведомости",
    )
    batch_date: Optional[str] = Field(
        None,
        description="Дата ведомости в формате YYYY-MM-DD",
    )