# neurocad/core/engine/lib/botinv/service.py

"""
Service layer for the inventory module (botinv).

Responsibilities:

  - sheets CRUD (list / get / get_active / create_from_file /
    activate / update / soft_delete);
  - items read (list_items, and get_export_data for the exporter);
  - bot operations (change_room, find_and_mark);
  - nav resolution (resolve_nav_id_for_botinv — lazy create);
  - serialization helpers (_sheet_to_dict, _item_to_dict).

The frontend never talks to the database directly. Every public
method here is called from route.py, which wraps the result in
the { success, data } envelope.

current_room is NOT stored on the backend. It lives in
localStorage on the frontend and is passed back on every call to
find_and_mark. change_room only validates that the input is a
non-empty string — it does NOT check the room against the
sheet. Real inventory sheets (ИНВ-3) do not carry a room
column, so there is nothing to validate against; and when a
sheet DOES carry rooms, we still accept anything — an operator
walking a floor may legitimately enter a room that was not on
the original plan. On failure, `current_room` is returned as
None; the frontend treats None as "leave the stored value alone".

Case-insensitive lookups
------------------------
Every item carries TWO numbers:

  inv_num      — the raw string from the Excel file, as it appeared
                 (case preserved). This is what is displayed in the
                 UI and returned in every response.
  inv_num_norm — inv_num.upper(). Used ONLY for matching. Never
                 returned to the frontend.

find_and_mark normalizes the incoming query the same way and
compares against inv_num_norm. Whitespace inside the number is
preserved: "ЧФ 0123" and "ЧФ0123" are still different items.

Substring search ("22457" → "БП-00022457")
------------------------------------------
Inventory numbers in real sheets are long ("БП-00022457"), and the
accountant will not type them in full. When an exact match fails,
the service falls back to a substring search:

  - exactly one hit  → that item is marked, as if the exact match
                       had succeeded;
  - several hits     → the item is NOT marked; the response has
                       status "ambiguous" and carries the first
                       CANDIDATE_LIMIT candidates (3) plus the
                       total count, so the frontend can render a
                       numbered list;
  - no hits          → "not_found", as before.

The frontend then re-sends the request with `chosen_id` set to the
id of the picked candidate. With chosen_id present, the service
looks the item up by primary key and skips the string search.

Note ("Примечание")
-------------------
`note` is a cumulative journal, and it is written ONLY on
REPEATS. A first find — whether the item was in its recorded
room or had been moved — produces no note. The columns
"Каб. до" and "Каб. после" already show the full picture;
extra text on a clean first find is just noise.

  - First find (any room)   → note untouched.
  - Repeat (item.found = 1) → "; найден в каб. <current_room>"
                              is appended, every time.

Without a repeat, `note` stays empty and the table stays clean.
"""

from sqlalchemy import select, func
from datetime import datetime, date
from typing import Optional, Dict, Any, List, Tuple

from ....models.base import BotInvSheet, BotInvItem, User
from ....models.nav import Nav
from neurocad.utils.sqlite import get_db_sqlite
from .importer import parse_inventory


#: How many candidates to return when a substring search matches
#: more than one item. The frontend prints them as a numbered list;
#: the user answers with 1, 2 or 3.
CANDIDATE_LIMIT = 3


class CoreEngineLibBotInvService:
    """Service for inventory sheets and items."""

    # ========================================
    # SHEETS — READ
    # ========================================

    @staticmethod
    async def list_sheets(nav_id: int) -> List[Dict[str, Any]]:
        """
        All non-deleted sheets for a nav, newest first.

        Sorted by batch_date DESC, then by id DESC as a tiebreaker
        so the order is stable when several sheets share the same
        date (which is normal — a user can upload two sheets on the
        same day).
        """
        async for session in get_db_sqlite():
            stmt = (
                select(BotInvSheet)
                .where(
                    BotInvSheet.nav_id == nav_id,
                    BotInvSheet.is_delete == 0,
                )
                .order_by(BotInvSheet.batch_date.desc(), BotInvSheet.id.desc())
            )
            rows = (await session.execute(stmt)).scalars().all()
            return [
                CoreEngineLibBotInvService._sheet_to_dict(s)
                for s in rows
            ]
        return []

    @staticmethod
    async def get_sheet(sheet_id: int) -> Optional[Dict[str, Any]]:
        """One sheet by id (non-deleted)."""
        async for session in get_db_sqlite():
            stmt = select(BotInvSheet).where(
                BotInvSheet.id == sheet_id,
                BotInvSheet.is_delete == 0,
            )
            sheet = (await session.execute(stmt)).scalar_one_or_none()
            if sheet is None:
                return None
            return CoreEngineLibBotInvService._sheet_to_dict(sheet)
        return None

    @staticmethod
    async def get_active_sheet(nav_id: int) -> Optional[Dict[str, Any]]:
        """
        The one active sheet for a nav, or None.

        Only one sheet per nav can be active — the activate_sheet
        method enforces this. If, due to a race or manual DB edit,
        several rows have is_active = 1, the lowest id wins (the
        order_by + limit(1) makes the choice deterministic).
        """
        async for session in get_db_sqlite():
            stmt = (
                select(BotInvSheet)
                .where(
                    BotInvSheet.nav_id == nav_id,
                    BotInvSheet.is_active == 1,
                    BotInvSheet.is_delete == 0,
                )
                .order_by(BotInvSheet.id.asc())
                .limit(1)
            )
            sheet = (await session.execute(stmt)).scalar_one_or_none()
            if sheet is None:
                return None
            return CoreEngineLibBotInvService._sheet_to_dict(sheet)
        return None

    # ========================================
    # SHEETS — WRITE
    # ========================================

    @staticmethod
    async def create_sheet_from_file(
        nav_id: int,
        name: str,
        batch_date: date,
        data: bytes,
        filename: str,
    ) -> Dict[str, Any]:
        """
        Parse an Excel/CSV file and create a new sheet with its items.

        The parse happens BEFORE the transaction: if the file is
        malformed, `parse_inventory` raises ValueError and no sheet
        is created. The route translates the error into HTTP 400.

        Both inv_num and inv_num_norm are written:
          - inv_num      — as it appeared in the file;
          - inv_num_norm — inv_num.upper(), used for lookups.

        After insert:
          - items_count = number of rows inserted;
          - marked_count = 0;
          - is_active = 0 — the caller must activate explicitly
            (see activate_sheet).
        """
        items = parse_inventory(data, filename)

        async for session in get_db_sqlite():
            now = datetime.now()

            sheet = BotInvSheet(
                nav_id=nav_id,
                name=name.strip(),
                batch_date=batch_date,
                source_file=filename,
                is_active=0,
                is_delete=0,
                items_count=len(items),
                marked_count=0,
                created_at=now,
                updated_at=now,
            )
            session.add(sheet)
            await session.flush()   # need sheet.id for the items

            for item in items:
                session.add(BotInvItem(
                    sheet_id=sheet.id,
                    inv_num=item["inv_num"],
                    inv_num_norm=item["inv_num_norm"],
                    name=item["name"],
                    room_before=item.get("room_before"),
                    room_after=None,
                    found=0,
                    note=None,
                    marked_at=None,
                ))

            await session.commit()
            await session.refresh(sheet)
            return CoreEngineLibBotInvService._sheet_to_dict(sheet)
        return {}

    @staticmethod
    async def activate_sheet(sheet_id: int) -> Optional[Dict[str, Any]]:
        """
        Make one sheet active for its nav.

        Deactivates every other sheet of the same nav_id, then
        activates the chosen one. Both steps in one transaction.
        """
        async for session in get_db_sqlite():
            stmt = select(BotInvSheet).where(
                BotInvSheet.id == sheet_id,
                BotInvSheet.is_delete == 0,
            )
            sheet = (await session.execute(stmt)).scalar_one_or_none()
            if sheet is None:
                return None

            now = datetime.now()

            # Deactivate all other sheets of this nav.
            others_stmt = select(BotInvSheet).where(
                BotInvSheet.nav_id == sheet.nav_id,
                BotInvSheet.id != sheet.id,
                BotInvSheet.is_active == 1,
            )
            others = (await session.execute(others_stmt)).scalars().all()
            for other in others:
                other.is_active = 0
                other.updated_at = now

            sheet.is_active = 1
            sheet.updated_at = now

            await session.commit()
            await session.refresh(sheet)
            return CoreEngineLibBotInvService._sheet_to_dict(sheet)
        return None

    @staticmethod
    async def update_sheet(
        sheet_id: int,
        name: Optional[str] = None,
        batch_date: Optional[date] = None,
    ) -> Optional[Dict[str, Any]]:
        """Rename a sheet and/or change its date."""
        async for session in get_db_sqlite():
            stmt = select(BotInvSheet).where(
                BotInvSheet.id == sheet_id,
                BotInvSheet.is_delete == 0,
            )
            sheet = (await session.execute(stmt)).scalar_one_or_none()
            if sheet is None:
                return None

            if name is not None:
                sheet.name = name.strip()
            if batch_date is not None:
                sheet.batch_date = batch_date

            sheet.updated_at = datetime.now()
            await session.commit()
            await session.refresh(sheet)
            return CoreEngineLibBotInvService._sheet_to_dict(sheet)
        return None

    @staticmethod
    async def soft_delete_sheet(sheet_id: int) -> bool:
        """
        Soft-delete a sheet.

        - is_delete = 1 on the target sheet;
        - is_active = 0 on EVERY sheet of the same nav — not just
          the target. This guards against the (rare) case where a
          second sheet was left with is_active = 1 by a race or a
          manual edit: after a soft-delete the nav is guaranteed to
          have no active sheet.

        Items are NOT touched — they stay in the DB, the sheet is
        just hidden from the list.
        """
        async for session in get_db_sqlite():
            stmt = select(BotInvSheet).where(
                BotInvSheet.id == sheet_id,
                BotInvSheet.is_delete == 0,
            )
            sheet = (await session.execute(stmt)).scalar_one_or_none()
            if sheet is None:
                return False

            now = datetime.now()
            nav_id = sheet.nav_id

            # Deactivate every sheet of this nav.
            all_stmt = select(BotInvSheet).where(
                BotInvSheet.nav_id == nav_id,
                BotInvSheet.is_active == 1,
            )
            for s in (await session.execute(all_stmt)).scalars().all():
                s.is_active = 0
                s.updated_at = now

            sheet.is_delete = 1
            sheet.updated_at = now

            await session.commit()
            return True
        return False

    # ========================================
    # ITEMS — READ
    # ========================================

    @staticmethod
    async def list_items(sheet_id: int) -> List[Dict[str, Any]]:
        """
        All items of a sheet, ordered by room_before, then inv_num.

        room_before may be NULL for some rows (a sheet without a
        room column). SQLite sorts NULLs first in ASC order — that
        is fine, those rows appear at the top of the table.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(BotInvItem)
                .where(BotInvItem.sheet_id == sheet_id)
                .order_by(BotInvItem.room_before.asc(), BotInvItem.inv_num.asc())
            )
            rows = (await session.execute(stmt)).scalars().all()
            return [CoreEngineLibBotInvService._item_to_dict(i) for i in rows]
        return []

    @staticmethod
    async def get_export_data(sheet_id: int) -> Optional[Dict[str, Any]]:
        """
        Data for the XLSX exporter.

        Returns:
            {
              "sheet": {...},
              "items": [...],
            }
        or None if the sheet does not exist (or is deleted).

        The exporter uses this to build the workbook — it does not
        read the DB itself, so the service stays the single point
        of access to the models.
        """
        sheet = await CoreEngineLibBotInvService.get_sheet(sheet_id)
        if sheet is None:
            return None

        items = await CoreEngineLibBotInvService.list_items(sheet_id)
        return {"sheet": sheet, "items": items}

    # ========================================
    # BOT OPERATIONS
    # ========================================

    @staticmethod
    async def change_room(nav_id: int, room: str) -> Dict[str, Any]:
        """
        Accept a room as the current walk context.

        The backend does NOT check the room against the active
        sheet. Real inventory sheets (ИНВ-3) do not carry a room
        column, so there is nothing to check against; and when a
        sheet does carry rooms, an operator walking a floor may
        legitimately enter a room that was not on the original
        plan. Any non-empty string is accepted.

        current_room is NOT stored on the backend — it lives in
        localStorage on the frontend and is passed back on every
        call. This method only normalizes and echoes it.

        On success, `current_room` in the response carries the
        accepted room. On failure (empty input, or no active
        sheet), it is None — the frontend interprets None as
        "do not change the stored room".

        Returns:
            {
              "status": "room_changed" | "room_not_found" | "no_active_sheet",
              "message": str,
              "current_room": str | None,
            }

        "room_not_found" is used here ONLY for an empty room string
        — the name is kept for backward compatibility with the
        frontend; it does not mean "this room is not in the sheet".
        """
        room = (room or "").strip()
        if not room:
            return {
                "status": "room_not_found",
                "message": "Пустой номер кабинета.",
                "current_room": None,
            }

        sheet = await CoreEngineLibBotInvService.get_active_sheet(nav_id)
        if sheet is None:
            return {
                "status": "no_active_sheet",
                "message": "Сначала загрузите и активируйте ведомость.",
                "current_room": None,
            }

        return {
            "status": "room_changed",
            "message": f"Кабинет {room} выбран.",
            "current_room": room,
        }

    @staticmethod
    async def find_and_mark(
        nav_id: int,
        inv_num: str,
        current_room: Optional[str],
        chosen_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Find an item by inv_num and mark it.

        Two lookup paths:

          1. chosen_id is set — the user picked a candidate from a
             previously returned list. The item is looked up by
             primary key; inv_num is ignored. If the id does not
             belong to the active sheet — "not_found".

          2. chosen_id is None — the inv_num string is used:
             a) an exact (case-insensitive) match is tried first;
             b) if it fails, a substring search is done:
                  - 1 hit   → that item is marked, as if exact;
                  - 2+ hits → "ambiguous": the first CANDIDATE_LIMIT
                              items are returned; nothing is marked;
                  - 0 hits  → "not_found".

        Behaviours of the mark itself (both paths), in order:

          1. No current_room — refuse with "no_room".
          2. No active sheet — refuse with "no_active_sheet".
          3. Item already found — "already_found". Append
             "; найден в каб. <current_room>" to note. room_after
             and marked_at are NOT overwritten (they carry the
             first-find data, which is the point of "Кабинет после").
          4. Item found for the first time — "found". Set found=1,
             room_after=current_room, marked_at=now. note is NOT
             touched. Increment sheet.marked_count.

        Note policy: written ONLY on repeats. A first find — whether
        in the item's recorded room or somewhere else — produces no
        note. The columns "Каб. до" and "Каб. после" already show
        the full picture.

        The response always reports the item's `inv_num` as stored
        in the DB (the original case from the file), not the query
        the user typed.

        Returns:
            {
              "status": "found" | "already_found" | "not_found"
                        | "no_room" | "no_active_sheet" | "ambiguous",
              "message": str,
              "item": dict | None,
              "current_room": str | None,
              "candidates": list[dict] | None,   # only when ambiguous
              "total_matches": int | None,       # only when ambiguous
            }
        """
        # ---- Guard: current_room is required for any mark. ----
        if not current_room:
            return {
                "status": "no_room",
                "message": "Сначала выберите кабинет командой #NNN.",
                "item": None,
                "current_room": None,
                "candidates": None,
                "total_matches": None,
            }

        sheet = await CoreEngineLibBotInvService.get_active_sheet(nav_id)
        if sheet is None:
            return {
                "status": "no_active_sheet",
                "message": "Сначала загрузите и активируйте ведомость.",
                "item": None,
                "current_room": current_room,
                "candidates": None,
                "total_matches": None,
            }

        async for session in get_db_sqlite():
            # ========================================
            # PATH 1 — the user picked a candidate by id.
            # ========================================
            if chosen_id is not None:
                item = (await session.execute(
                    select(BotInvItem).where(
                        BotInvItem.id == chosen_id,
                        BotInvItem.sheet_id == sheet["id"],
                    )
                )).scalar_one_or_none()

                if item is None:
                    return {
                        "status": "not_found",
                        "message": "Позиция не найдена в ведомости.",
                        "item": None,
                        "current_room": current_room,
                        "candidates": None,
                        "total_matches": None,
                    }

                return await CoreEngineLibBotInvService._mark_item(
                    session, sheet, item, current_room,
                )

            # ========================================
            # PATH 2 — lookup by the typed string.
            # ========================================
            inv_num = (inv_num or "").strip()
            if not inv_num:
                return {
                    "status": "not_found",
                    "message": "Пустой инвентарный номер.",
                    "item": None,
                    "current_room": current_room,
                    "candidates": None,
                    "total_matches": None,
                }

            inv_num_norm = inv_num.upper()

            # --- 2a. Exact match. ---
            item = (await session.execute(
                select(BotInvItem).where(
                    BotInvItem.sheet_id == sheet["id"],
                    BotInvItem.inv_num_norm == inv_num_norm,
                )
            )).scalar_one_or_none()

            if item is not None:
                return await CoreEngineLibBotInvService._mark_item(
                    session, sheet, item, current_room,
                )

            # --- 2b. Substring search. ---
            like_pattern = f"%{inv_num_norm}%"

            # Count the total — needed for "и ещё N — уточните запрос".
            total = (await session.execute(
                select(func.count()).select_from(BotInvItem).where(
                    BotInvItem.sheet_id == sheet["id"],
                    BotInvItem.inv_num_norm.like(like_pattern),
                )
            )).scalar_one()

            if total == 0:
                return {
                    "status": "not_found",
                    "message": f"Номер {inv_num} не найден в ведомости.",
                    "item": None,
                    "current_room": current_room,
                    "candidates": None,
                    "total_matches": None,
                }

            # Fetch up to CANDIDATE_LIMIT to print the numbered list.
            candidates_rows = (await session.execute(
                select(BotInvItem)
                .where(
                    BotInvItem.sheet_id == sheet["id"],
                    BotInvItem.inv_num_norm.like(like_pattern),
                )
                .order_by(BotInvItem.inv_num.asc())
                .limit(CANDIDATE_LIMIT)
            )).scalars().all()

            # --- Single hit: mark it, as if it were an exact match. ---
            if total == 1:
                return await CoreEngineLibBotInvService._mark_item(
                    session, sheet, candidates_rows[0], current_room,
                )

            # --- Multiple hits: return the list, mark nothing. ---
            candidates = [
                CoreEngineLibBotInvService._candidate_to_dict(c)
                for c in candidates_rows
            ]

            return {
                "status": "ambiguous",
                "message": (
                    f"Найдено {total} позиций по запросу «{inv_num}»."
                ),
                "item": None,
                "current_room": current_room,
                "candidates": candidates,
                "total_matches": total,
            }

        return {
            "status": "no_active_sheet",
            "message": "Сначала загрузите и активируйте ведомость.",
            "item": None,
            "current_room": current_room,
            "candidates": None,
            "total_matches": None,
        }

    # ========================================
    # INTERNAL — mark a specific item
    # ========================================

    @staticmethod
    async def _mark_item(
        session,
        sheet: Dict[str, Any],
        item: BotInvItem,
        current_room: str,
    ) -> Dict[str, Any]:
        """
        Apply the mark to a concrete BotInvItem (already loaded).

        Shared by both lookup paths in find_and_mark. Handles the
        already_found / first-find branches and the sheet counter.
        Commits the session before returning.
        """
        now = datetime.now()

        # --- Already found: append to journal, keep first-find
        #     data (room_after, marked_at) intact. ---
        if item.found:
            extra = f"; найден в каб. {current_room}"
            item.note = (item.note or "") + extra
            await session.commit()
            await session.refresh(item)

            msg = (
                f"⚠️ {item.name}. Уже найдена.\n"
                f"Каб. до: {item.room_before}. "
                f"Каб. после: {item.room_after}."
            )
            if item.note:
                msg += f"\nПримечание: {item.note}"

            return {
                "status": "already_found",
                "message": msg,
                "item": CoreEngineLibBotInvService._item_to_dict(item),
                "current_room": current_room,
                "candidates": None,
                "total_matches": None,
            }

        # --- First find ---
        item.found = 1
        item.room_after = current_room
        item.marked_at = now
        # note is left untouched on the first find — it is written
        # ONLY on repeats (see the class docstring).

        # Increment the sheet's marked_count.
        sheet_stmt = select(BotInvSheet).where(BotInvSheet.id == sheet["id"])
        sheet_row = (await session.execute(sheet_stmt)).scalar_one_or_none()
        if sheet_row is not None:
            sheet_row.marked_count = (sheet_row.marked_count or 0) + 1
            sheet_row.updated_at = now

        await session.commit()
        await session.refresh(item)

        msg = (
            f"✅ {item.name}.\n"
            f"Каб. до: {item.room_before}. "
            f"Каб. после: {item.room_after}."
        )
        if item.note:
            msg += f"\nПримечание: {item.note}"

        return {
            "status": "found",
            "message": msg,
            "item": CoreEngineLibBotInvService._item_to_dict(item),
            "current_room": current_room,
            "candidates": None,
            "total_matches": None,
        }

    # ========================================
    # NAV RESOLUTION
    # ========================================

    @staticmethod
    async def resolve_nav_id_for_botinv(user_id: int) -> Optional[int]:
        """
        Find or create the user's botinv nav.

        Requires User.use_botinv = True. If the flag is off — None
        (the route translates this into HTTP 403).

        The nav is created lazily on the first call, one per user:

            card_type  = 'link'   — same as every other nav in this
                                    project;
            module_id  = None     — the botinv nav does NOT belong to
                                    any module. Setting module_id
                                    would make it visible to
                                    ensure_default_nav() in
                                    utils/sqlite.py, which expects
                                    exactly ONE nav per
                                    (user_id, module_id) and would
                                    raise MultipleResultsFound.
            name       = 'Инвентаризация'

        Identification is by (user_id, name='Инвентаризация',
        is_delete=0). The name is the marker — module_id and
        card_type are not unique enough in this project.

        A race between two simultaneous first calls is possible in
        theory (two tabs), but not handled: the project targets a
        single-user workflow. If it ever becomes an issue, add a
        UNIQUE constraint and catch IntegrityError here.
        """
        async for session in get_db_sqlite():
            # 1. Flag check.
            user_stmt = select(User.use_botinv).where(User.id == user_id)
            use_botinv = (await session.execute(user_stmt)).scalar_one_or_none()
            if not use_botinv:
                return None

            # 2. Find the user's botinv nav.
            #    limit(1) — even if a duplicate somehow appeared,
            #    the query picks one deterministically instead of
            #    raising MultipleResultsFound.
            nav_stmt = (
                select(Nav)
                .where(
                    Nav.user_id == user_id,
                    Nav.name == "Инвентаризация",
                    Nav.is_delete == False,
                )
                .order_by(Nav.id.asc())
                .limit(1)
            )
            nav = (await session.execute(nav_stmt)).scalar_one_or_none()

            # 3. Lazy-create.
            if nav is None:
                now = datetime.now()
                nav = Nav(
                    user_id=user_id,
                    parent_id=None,
                    card_type="link",
                    sort_order=1,
                    name="Инвентаризация",
                    description=None,
                    icon=None,
                    module_id=None,
                    is_delete=False,
                    created_at=now,
                    updated_at=now,
                )
                session.add(nav)
                await session.commit()
                await session.refresh(nav)

            return nav.id
        return None

    # ========================================
    # HELPERS
    # ========================================

    @staticmethod
    def _sheet_to_dict(sheet: BotInvSheet) -> Dict[str, Any]:
        """
        Serialize a BotInvSheet into a JSON-safe dict.

        The frontend list uses: id, name, batch_date, items_count,
        marked_count, is_active. The rest (nav_id, source_file,
        timestamps) is for debugging / future use.
        """
        return {
            "id": sheet.id,
            "nav_id": sheet.nav_id,
            "name": sheet.name,
            "batch_date": sheet.batch_date.isoformat() if sheet.batch_date else None,
            "source_file": sheet.source_file,
            "is_active": sheet.is_active,
            "is_delete": sheet.is_delete,
            "items_count": sheet.items_count,
            "marked_count": sheet.marked_count,
            "created_at": sheet.created_at.isoformat() if sheet.created_at else None,
            "updated_at": sheet.updated_at.isoformat() if sheet.updated_at else None,
        }

    @staticmethod
    def _item_to_dict(item: BotInvItem) -> Dict[str, Any]:
        """
        Serialize a BotInvItem into a JSON-safe dict.

        The frontend table uses: id, inv_num, name, room_before,
        room_after, found, note. sheet_id and marked_at are
        included for debugging.

        inv_num_norm is intentionally NOT exported — it is an
        internal implementation detail used only for lookups. The
        frontend never needs to see it.
        """
        return {
            "id": item.id,
            "sheet_id": item.sheet_id,
            "inv_num": item.inv_num,
            "name": item.name,
            "room_before": item.room_before,
            "room_after": item.room_after,
            "found": item.found,
            "note": item.note,
            "marked_at": item.marked_at.isoformat() if item.marked_at else None,
        }

    @staticmethod
    def _candidate_to_dict(item: BotInvItem) -> Dict[str, Any]:
        """
        Serialize a BotInvItem as a candidate entry for the
        "ambiguous" response.

        The frontend renders these as a numbered list, so the
        payload is intentionally short: id, inv_num, name,
        room_before, found. No note, no timestamps — the user only
        needs enough to tell the candidates apart.
        """
        return {
            "id": item.id,
            "inv_num": item.inv_num,
            "name": item.name,
            "room_before": item.room_before,
            "found": item.found,
        }