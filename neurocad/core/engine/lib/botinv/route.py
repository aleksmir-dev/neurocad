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

MAX bot webhook
---------------
POST /botinv/max/webhook receives Update objects from the MAX
platform for the inventory chat-bot. It is NOT authenticated with
a JWT — instead it verifies the X-Max-Bot-Api-Secret header
against MAX_WEBHOOK_SECRET from .env. The bot operates on behalf
of one user (the accountant walking the rooms); the mapping from
MAX user_id to the internal user is done via the
MAX_ALLOWED_USER_ID list in .env plus a "first enabled user"
lookup (see _resolve_max_user below).

Confirmation flow in the bot
----------------------------
The service (find_and_mark) NEVER marks on the string-lookup
path — it always returns "ambiguous" with 1..CANDIDATE_LIMIT
candidates, and marks only when called with an explicit
chosen_id. The web chat passes chosen_id from the button's
payload; MAX's `message` buttons cannot carry a payload, so the
bot has to reconstruct the confirmation from the button text.

The bot therefore keeps a per-user list of the candidates it
last showed (_max_candidates[user_id]). When the next message
text exactly matches one of those candidates' inv_num, the bot
treats it as a tap on that candidate and calls find_and_mark
with the corresponding chosen_id. Any other message, or a room
change, or a successful mark, clears that list.

This is why the accountant always has to confirm by tapping —
the bot cannot mark anything on the first "lookup only" pass.
"""

import logging
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import JSONResponse, Response

from neurocad.core.auth.dependencies import get_current_user
from .service import CoreEngineLibBotInvService
from .exporter import build_workbook, build_filename
from .schema import (
    CoreEngineLibBotInvMarkRequest,
    CoreEngineLibBotInvRoomRequest,
    CoreEngineLibBotInvSheetUpdateRequest,
)
from . import max as max_bot

log = logging.getLogger(__name__)

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
    All items of a sheet, in import order.

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

      - inv_num   — a string; the service does an exact match,
                    then a substring search. This path NEVER
                    marks anything — it returns "ambiguous" with
                    a list of 1..CANDIDATE_LIMIT candidates, or
                    "not_found";
      - chosen_id — the id of a candidate the user picked from a
                    previous "ambiguous" response. This is the
                    ONLY path that marks.

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
        ambiguous                   → warning + list of buttons

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


# ========================================
# MAX BOT — WEBHOOK
# ========================================
#
# The MAX bot is a second "client" of the same inventory logic
# that the web UI uses. It has no JWT — MAX identifies the user by
# their platform user_id, which arrives in every Update.
#
# Flow:
#
#   user: "#405"
#     → change_room(nav_id, "405")   → reply "Каб. 405 выбран"
#
#   user: "22457"
#     → find_and_mark(nav_id, "22457", room, chosen_id=None)
#       • not_found      → reply "❌ ..."
#       • ambiguous      → reply with the list of candidates and
#                          one "message" button per row; the
#                          candidate list is remembered per user
#
#   user taps a button
#     → MAX sends the button text back as a regular message. The
#       bot checks: does this text match one of the remembered
#       candidates' inv_num? If yes, treat it as a tap — call
#       find_and_mark with the corresponding chosen_id. If no,
#       treat it as a fresh lookup (and drop the remembered list).
#
# Confirmation state
# ------------------
# _max_candidates[user_id] holds the list of candidates the bot
# last showed this user. Cleared:
#
#   - on any successful mark (the list has served its purpose);
#   - on a room change;
#   - on any message that does not exactly match a candidate's
#     inv_num (the user has moved on to a different query).
#
# The state lives in memory only — it is tiny, and it is fine to
# lose it on restart: the accountant can just search again.

#: Per-user current room. Keyed by MAX user_id.
#: Not persisted — see the module docstring.
_max_rooms: Dict[int, Optional[str]] = {}

#: Per-user list of candidates from the last "ambiguous" reply.
#: Each entry is a dict with at least {id, inv_num}. Keyed by MAX
#: user_id. Cleared as described above.
_max_candidates: Dict[int, List[Dict[str, Any]]] = {}


async def _resolve_max_user(max_user_id: int) -> Optional[Dict[str, Any]]:
    """
    Map a MAX user_id to the internal User.

    Step 1: MAX_ALLOWED_USER_ID in .env must contain this
            max_user_id (comma-separated list). If not — reject.

    Step 2: find the first active internal user with
            use_botinv = 1. This is the "accountant account".
            If no such user exists — reject.

    Returns {"id": <internal user id>, "login": <login>} or None.
    """
    from .....config import settings

    allowed_raw = getattr(settings, "MAX_ALLOWED_USER_ID", None)
    if not allowed_raw:
        log.warning("[MAX bot] MAX_ALLOWED_USER_ID is not set — rejecting")
        return None

    allowed = {
        s.strip() for s in str(allowed_raw).split(",") if s.strip()
    }

    if str(max_user_id) not in allowed:
        log.warning(
            "[MAX bot] user_id=%s is not in MAX_ALLOWED_USER_ID", max_user_id
        )
        return None

    # Look up the internal user. The bot is single-accountant:
    # we take the FIRST active user with use_botinv = 1.
    from .....core.models.user import User
    from .....utils.sqlite import get_db_sqlite
    from sqlalchemy import select

    async for session in get_db_sqlite():
        row = (await session.execute(
            select(User)
            .where(
                User.use_botinv == 1,
                User.is_active == 1,
                User.is_delete == 0,
            )
            .order_by(User.id.asc())
            .limit(1)
        )).scalar_one_or_none()

        if row is None:
            log.warning("[MAX bot] no active user with use_botinv=1")
            return None

        return {"id": row.id, "login": row.login}

    return None


async def _bot_reply(user_id: int, text: str, keyboard=None) -> None:
    """
    Send a message from the bot to the MAX user. Swallows the
    exception if MAX refuses — the webhook must always return 200
    to MAX, otherwise MAX retries (and eventually disables the
    subscription).
    """
    try:
        await max_bot.send_message(user_id=user_id, text=text, keyboard=keyboard)
    except Exception as e:
        log.error("[MAX bot] send_message failed: %s: %s", type(e).__name__, e)


def _format_mark_reply(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a find_and_mark result into a (text, keyboard) pair
    for MAX.

    Statuses:
      - found           → plain text reply
      - already_found   → plain text reply
      - not_found       → plain text reply
      - no_room         → plain text reply asking for a room
      - no_active_sheet → plain text reply
      - ambiguous       → text with the candidate list + buttons

    Layout of the "ambiguous" reply (no header, no hint — the
    list and the buttons speak for themselves):

        • БП-00022455 — Тонер-картридж Retech 106R03745
        • БП-00022456 — Тонер-картридж Retech 106R03746
        [ БП-00022455 ]
        [ БП-00022456 ]

    Buttons use MAX's `message` type: tapping one sends its text
    back to the bot as a regular message. That text is the FULL
    inventory number; the bot matches it against its remembered
    candidate list and calls find_and_mark with chosen_id.
    """
    status = result.get("status")
    message = result.get("message") or ""

    if status == "ambiguous":
        candidates = result.get("candidates") or []

        lines = []
        for c in candidates:
            inv = c.get("inv_num") or ""
            name = (c.get("name") or "").strip()
            room = c.get("room_before")
            suffix = f" (каб. {room})" if room else ""
            lines.append(f"• {inv} — {name}{suffix}")

        # Одна кнопка на кандидата. Тип "message" — тап отправляет
        # текст кнопки (полный инвентарный номер) обратно боту как
        # обычное сообщение.
        buttons = []
        for c in candidates:
            inv = c.get("inv_num") or ""
            if not inv:
                continue
            buttons.append([{
                "type": "message",
                "text": inv,
            }])

        return {
            "text": "\n".join(lines),
            "keyboard": buttons or None,
        }

    # All other statuses: plain text.
    return {"text": message, "keyboard": None}


@router.post("/max/webhook")
async def max_webhook(request: Request) -> JSONResponse:
    """
    Webhook endpoint for the MAX bot.

    No JWT — MAX authenticates by sending the shared secret in
    the X-Max-Bot-Api-Secret header, which we compare against
    MAX_WEBHOOK_SECRET from .env.

    Always returns 200 (except for a bad secret). Any error
    inside the handler is logged; MAX must not retry on our
    internal errors — the reply to the user is best-effort.
    """
    # 1. Secret check.
    if not max_bot.verify_webhook_secret(dict(request.headers)):
        log.warning("[MAX webhook] secret mismatch or missing")
        raise HTTPException(status_code=401, detail="invalid secret")

    # 2. Parse the Update.
    try:
        update = await request.json()
    except Exception as e:
        log.warning("[MAX webhook] bad JSON: %s", e)
        return JSONResponse({"ok": True})

    parsed = max_bot.parse_update(update)
    if parsed is None:
        return JSONResponse({"ok": True})

    user_id = parsed.get("user_id")
    if not user_id:
        return JSONResponse({"ok": True})

    # Log every bot_started with the sender's identity — one line
    # in the journald log, enough to identify the accountant on
    # first contact. On INFO for other event types we stay silent.
    if parsed.get("type") == "bot_started":
        log.warning(
            "[MAX bot] /start: user_id=%s, username=%r, name=%r",
            user_id,
            parsed.get("username"),
            parsed.get("name"),
        )

    # 3. Resolve the internal user (single-accountant setup).
    internal_user = await _resolve_max_user(user_id)
    if internal_user is None:
        await _bot_reply(
            user_id,
            "Извините, у вас нет доступа к боту инвентаризации. "
            "Обратитесь к администратору.",
        )
        return JSONResponse({"ok": True})

    # 4. Resolve nav (creates one on the first call).
    nav_id = await CoreEngineLibBotInvService.resolve_nav_id_for_botinv(
        internal_user["id"]
    )
    if nav_id is None:
        await _bot_reply(user_id, "Модуль инвентаризации не подключён.")
        return JSONResponse({"ok": True})

    # 5. Dispatch.
    ptype = parsed.get("type")

    if ptype == "message":
        await _handle_bot_message(user_id, nav_id, parsed.get("text") or "")
    elif ptype == "bot_started":
        # Нажатие «Начать» в MAX. Отвечаем приветствием.
        await _bot_reply(
            user_id,
            "Здравствуйте! Я бот инвентаризации.\n"
            "Выберите кабинет командой #405, затем вводите инвентарные номера.\n"
            "Найденные вещи отмечаются автоматически.",
        )
    # `callback` больше не используется: кнопки имеют тип
    # "message" и приходят как обычные message-события.

    return JSONResponse({"ok": True})


async def _handle_bot_message(user_id: int, nav_id: int, text: str) -> None:
    """
    Handle a plain text message from the accountant.

    Three shapes are recognised:

        "#405"     — set the current room (drops the candidate list);
        <candidate> — text exactly matching one of the candidates
                      from the last "ambiguous" reply — treated as
                      a button tap: the item is marked with
                      chosen_id, the list is cleared;
        <other>     — an inventory-number lookup; the previous
                      candidate list is dropped, find_and_mark runs
                      as a fresh query.

    The candidate list is _max_candidates[user_id].
    """
    text = (text or "").strip()
    if not text:
        return

    # ---- 1. Room change (also clears the candidate list). ----
    if text.startswith("#"):
        _max_candidates.pop(user_id, None)

        room = text[1:].strip()
        if not room:
            await _bot_reply(user_id, "Укажите кабинет: #405")
            return

        result = await CoreEngineLibBotInvService.change_room(nav_id, room)
        status = result.get("status")

        if status == "room_changed":
            new_room = result.get("current_room") or room
            _max_rooms[user_id] = new_room
            await _bot_reply(
                user_id,
                f"Кабинет {new_room} выбран. Введите инвентарный номер.",
            )
        else:
            # room_not_found | no_active_sheet — both come with a
            # ready-made Russian message from the service.
            await _bot_reply(user_id, result.get("message") or "Ошибка")

        return

    # ---- 2. Room required for any lookup / mark. ----
    current_room = _max_rooms.get(user_id)
    if not current_room:
        _max_candidates.pop(user_id, None)
        await _bot_reply(
            user_id,
            "Сначала выберите кабинет командой #NNN, например #405.",
        )
        return

    # ---- 3. Candidate confirmation (a tap on a button). ----
    #     The button's text is the FULL inv_num of one of the
    #     candidates the bot last showed. If the incoming text
    #     matches one of them exactly, we treat it as a tap and
    #     mark the item by its id.
    remembered = _max_candidates.get(user_id)
    if remembered:
        picked = None
        for c in remembered:
            if (c.get("inv_num") or "") == text:
                picked = c
                break

        if picked is not None:
            _max_candidates.pop(user_id, None)

            result = await CoreEngineLibBotInvService.find_and_mark(
                nav_id=nav_id,
                inv_num=text,
                current_room=current_room,
                chosen_id=picked["id"],
            )
            reply = _format_mark_reply(result)
            await _bot_reply(user_id, reply["text"], reply.get("keyboard"))
            return

        # Text did not match any candidate — the user typed a new
        # query. Fall through to the fresh lookup, dropping the
        # stale list.
        _max_candidates.pop(user_id, None)

    # ---- 4. Fresh lookup. ----
    result = await CoreEngineLibBotInvService.find_and_mark(
        nav_id=nav_id,
        inv_num=text,
        current_room=current_room,
        chosen_id=None,
    )

    # If the lookup returned candidates, remember them so a
    # subsequent message with the exact inv_num can be treated
    # as a button tap.
    if result.get("status") == "ambiguous":
        candidates = result.get("candidates") or []
        if candidates:
            _max_candidates[user_id] = candidates
        else:
            _max_candidates.pop(user_id, None)

    reply = _format_mark_reply(result)
    await _bot_reply(user_id, reply["text"], reply.get("keyboard"))