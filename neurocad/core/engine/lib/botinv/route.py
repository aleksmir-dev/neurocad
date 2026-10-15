# neurocad/core/engine/lib/botinv/route.py

"""
HTTP endpoints for the inventory module (botinv).

URL prefix: /botinv  (mounted under /core/engine/lib by the
engine router — see core/engine/lib/route.py).

All endpoints are called from the frontend under the user's
botinv nav (see service.py → resolve_nav_id_for_botinv). The nav
is resolved lazily on the first call: if the user has
use_botinv = True but no nav yet, one is created.

current_room is NOT stored on the backend. It lives in
localStorage on the frontend and is passed back on every call
to /mark. The backend only validates it against the active sheet
(via /room) and uses it to fill the "Кабинет после" column.

Response envelope
-----------------
Every JSON endpoint returns:

    { "success": true, "data": <payload> }

The export endpoint is the only exception — it streams a binary
.xlsx file with the appropriate Content-Type and
Content-Disposition headers.

Errors
------
Every HTTPException carries a human-readable Russian `detail`
string. The frontend displays it verbatim. Structural problems
in the uploaded file (bad headers, unreadable file, empty data)
become 400 with the message from parse_inventory.
"""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibBotInvService
from .exporter import build_workbook, build_filename
from .schema import (
    CoreEngineLibBotInvMarkRequest,
    CoreEngineLibBotInvRoomRequest,
    CoreEngineLibBotInvSheetUpdateRequest,
)

router = APIRouter(prefix="/botinv", tags=["core/engine/lib/botinv"])


# ========================================
# NAV RESOLUTION
# ========================================

async def _resolve_nav_id_for_botinv(current_user: dict) -> int:
    """
    Find or create the user's botinv nav.

    Delegates to the service. If the flag use_botinv is off, or
    the user is not authenticated — raises HTTPException:

      401 — no user_id in the token payload;
      403 — use_botinv = 0 (the user is not allowed to use the
            inventory module).
    """
    user_id = current_user.get("id") if isinstance(current_user, dict) else None
    if user_id is None:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    nav_id = await CoreEngineLibBotInvService.resolve_nav_id_for_botinv(user_id)
    if nav_id is None:
        raise HTTPException(
            status_code=403,
            detail="Модуль инвентаризации не подключён для этого пользователя",
        )
    return nav_id


# ========================================
# ACTIVE SHEET
# ========================================

@router.get("/active")
async def get_active(
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Return the active sheet with all its items in one response.

    Response:
        {
          "success": true,
          "data": {
            "sheet": {...} | null,
            "items": [...],
          }
        }

    If no sheet is active, `sheet` is null and `items` is [].
    The frontend uses this as the initial data load for the
    inventory page.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    sheet = await CoreEngineLibBotInvService.get_active_sheet(nav_id)
    if sheet is None:
        return JSONResponse({
            "success": True,
            "data": {"sheet": None, "items": []},
        })

    items = await CoreEngineLibBotInvService.list_items(sheet["id"])
    return JSONResponse({
        "success": True,
        "data": {"sheet": sheet, "items": items},
    })


# ========================================
# SHEETS — LIST
# ========================================

@router.get("/sheets")
async def list_sheets(
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """All non-deleted sheets of the user's botinv nav."""
    nav_id = await _resolve_nav_id_for_botinv(current_user)
    sheets = await CoreEngineLibBotInvService.list_sheets(nav_id)
    return JSONResponse({"success": True, "data": sheets})


# ========================================
# SHEETS — IMPORT
# ========================================

@router.post("/sheets/import")
async def import_sheet(
    file: UploadFile = File(..., description="Excel (.xlsx) или CSV"),
    name: str = Form(..., description="Имя ведомости"),
    batch_date: str = Form(..., description="Дата ведомости, YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Parse an uploaded Excel/CSV file and create a new sheet.

    The file must have columns inv_num, name, room. The order of
    columns does NOT matter — they are matched by header name in
    the first row. Duplicate inv_num rows are skipped (the first
    occurrence wins).

    On any structural problem (bad headers, unreadable file, empty
    data) → 400 with a human-readable Russian message from
    parse_inventory.

    The new sheet is created INACTIVE (is_active = 0). The caller
    must explicitly activate it via POST /sheets/{id}/activate.
    This is deliberate: importing a sheet is not the same as
    deciding to start a walk on it.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    # Parse the date early so a bad date does not consume the file.
    try:
        parsed_date = date.fromisoformat(batch_date.strip())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail="Дата ведомости должна быть в формате YYYY-MM-DD",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")

    try:
        sheet = await CoreEngineLibBotInvService.create_sheet_from_file(
            nav_id=nav_id,
            name=name,
            batch_date=parsed_date,
            data=data,
            filename=file.filename or "sheet.xlsx",
        )
    except ValueError as e:
        # parse_inventory raises ValueError with a Russian message.
        raise HTTPException(status_code=400, detail=str(e))

    return JSONResponse({"success": True, "data": sheet})


# ========================================
# SHEETS — ACTIVATE
# ========================================

@router.post("/sheets/{sheet_id}/activate")
async def activate_sheet(
    sheet_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Make one sheet the active one for its nav.

    Any other active sheet of the same nav is deactivated first —
    only one sheet per nav can be active at a time.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
    if sheet is None or sheet["nav_id"] != nav_id:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    updated = await CoreEngineLibBotInvService.activate_sheet(sheet_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    return JSONResponse({"success": True, "data": updated})


# ========================================
# SHEETS — UPDATE
# ========================================

@router.patch("/sheets/{sheet_id}")
async def update_sheet(
    sheet_id: int,
    data: CoreEngineLibBotInvSheetUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Rename a sheet and/or change its date.

    Only the fields present in the payload are updated. Sending
    an empty body is a no-op (returns the sheet unchanged).
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
    if sheet is None or sheet["nav_id"] != nav_id:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    parsed_date = None
    if data.batch_date is not None:
        try:
            parsed_date = date.fromisoformat(data.batch_date.strip())
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail="Дата ведомости должна быть в формате YYYY-MM-DD",
            )

    updated = await CoreEngineLibBotInvService.update_sheet(
        sheet_id,
        name=data.name,
        batch_date=parsed_date,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    return JSONResponse({"success": True, "data": updated})


# ========================================
# SHEETS — DELETE (SOFT)
# ========================================

@router.delete("/sheets/{sheet_id}")
async def delete_sheet(
    sheet_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Soft-delete a sheet.

    The sheet is hidden from the list, is_active is cleared on
    every sheet of the nav, and the items stay in the DB — the
    soft delete is reversible at the DB level if needed.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
    if sheet is None or sheet["nav_id"] != nav_id:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    ok = await CoreEngineLibBotInvService.soft_delete_sheet(sheet_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    return JSONResponse({"success": True, "message": "Ведомость удалена"})


# ========================================
# SHEETS — ITEMS
# ========================================

@router.get("/sheets/{sheet_id}/items")
async def list_items(
    sheet_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    All items of a sheet, ordered by room_before then inv_num.

    Used by the frontend when switching to a non-active sheet
    (to preview its contents without activating it).
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
    if sheet is None or sheet["nav_id"] != nav_id:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    items = await CoreEngineLibBotInvService.list_items(sheet_id)
    return JSONResponse({"success": True, "data": items})


# ========================================
# BOT — CHANGE ROOM
# ========================================

@router.post("/room")
async def change_room(
    data: CoreEngineLibBotInvRoomRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Validate a room against the active sheet.

    The backend does not store current_room — the frontend keeps
    it in localStorage. This endpoint only checks that the room
    exists in the sheet, so the frontend can decide whether to
    update localStorage.

    Response payload:
        {
          "status": "room_changed" | "room_not_found" | "no_active_sheet",
          "message": str,
          "current_room": str | None,
        }

    On success `current_room` is the validated room. On any
    failure it is None — the frontend interprets None as "leave
    the stored value alone".
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)
    result = await CoreEngineLibBotInvService.change_room(nav_id, data.room)
    return JSONResponse({"success": True, "data": result})


# ========================================
# BOT — MARK
# ========================================

@router.post("/mark")
async def mark(
    data: CoreEngineLibBotInvMarkRequest,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Find an item by inv_num and mark it.

    Two ways to identify the item (see schema.py):

      - inv_num   — a string; the service tries an exact
                    case-insensitive match, then a substring
                    search;
      - chosen_id — the id of a candidate the user picked from a
                    previous "ambiguous" response. When set,
                    inv_num is ignored.

    current_room is passed by the frontend (localStorage). The
    backend uses it to fill "Кабинет после" and to append to note.

    Response payload:
        {
          "status": "found" | "already_found" | "not_found"
                    | "no_room" | "no_active_sheet" | "ambiguous",
          "message": str,
          "item": dict | None,
          "current_room": str | None,
          "candidates": list[dict] | None,   # only when ambiguous
          "total_matches": int | None,       # only when ambiguous
        }

    The frontend maps `status` to a chat-message variant:
        found                       → success
        already_found               → warning
        not_found / no_room /
            no_active_sheet         → error
        ambiguous                   → warning + numbered list

    and uses `item.id` to flash the corresponding table row.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)
    result = await CoreEngineLibBotInvService.find_and_mark(
        nav_id=nav_id,
        inv_num=data.inv_num,
        current_room=data.current_room,
        chosen_id=data.chosen_id,
    )
    return JSONResponse({"success": True, "data": result})


# ========================================
# SHEETS — EXPORT (XLSX)
# ========================================

#: MIME type for .xlsx (Office Open XML).
_XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


@router.get("/sheets/{sheet_id}/export")
async def export_sheet(
    sheet_id: int,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """
    Export a sheet to XLSX.

    Streams a binary .xlsx file with Content-Disposition:
    attachment — the browser saves it as a file.

    The filename is derived from the sheet name and batch_date
    (see exporter.build_filename) — for example:
        vedomost_2026-10-15_inventarizaciya.xlsx

    The workbook itself is built by exporter.build_workbook. The
    route layer does not touch openpyxl directly — it just hands
    the sheet + items over and streams the resulting bytes.
    """
    nav_id = await _resolve_nav_id_for_botinv(current_user)

    # Ownership check — a user may only export their own sheets.
    sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
    if sheet is None or sheet["nav_id"] != nav_id:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    # Fetch the data in one call (sheet + items).
    data = await CoreEngineLibBotInvService.get_export_data(sheet_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Ведомость не найдена")

    # Build the workbook and the filename.
    try:
        xlsx_bytes = build_workbook(data["sheet"], data["items"])
        filename = build_filename(data["sheet"])
    except Exception as e:
        # Anything that goes wrong inside openpyxl is reported
        # as a 500 with a Russian message. The full traceback is
        # logged by the framework.
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось сформировать Excel-файл: {e}",
        )

    return Response(
        content=xlsx_bytes,
        media_type=_XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )