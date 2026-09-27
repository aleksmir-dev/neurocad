# neurocad/core/engine/lib/word/llm/websocket/endpoint.py

"""
EndpointMixin — the WebSocket endpoint and its main loop.

This is the only entry point of the LLM editor over WS:

    /core/engine/lib/word/llm/ws/{page_id}

One connection per open editor tab. The loop:

  1. Authenticates the user (cookie JWT).
  2. Accepts the connection (any authenticated user).
  3. Reads messages in a loop and dispatches by `type`:

       start         — full flow: router → agent (see _run_agent)
       effect_edit   — direct: "edit" agent (see _run_effect_edit)
       effect_rename — direct: "rename" agent (see _run_effect_rename)
       create_effect — direct: "create_effect" agent
                       (see _run_create_effect)
       cancel        — sets the cancel flag for the current run
       ping          — replies with pong

     Anything else → `error` frame.

  4. On disconnect (client closed tab, network drop): sets the cancel
     flag for the current run, marks it cancelled in the DB, and
     returns. The endpoint does not try to keep the connection alive.

One task per connection:
  The dispatcher runs in `asyncio.create_task(...)` so the main loop
  stays responsive to `cancel` and `ping` while an agent is working.
  Only ONE task can be active at a time — a new `start` (or
  effect_edit, or effect_rename, or create_effect) refuses to run
  while a task is in flight and sends an `error` frame instead.

Cancel semantics:
  Cancelling does NOT abort the in-flight LLM request. The cancel
  event is checked by the dispatcher after the current call finishes.
  See dispatch.py for the exact check points.

This method used to live on CoreEngineLibWordLlmWS as a @staticmethod.
It is now a regular method on a mixin — called as
`self.llm_ws_endpoint(...)` from route.py (via the wrapper in ws.py).

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

import asyncio
import json
import traceback
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

from .agents import _AGENTS


class EndpointMixin:
    """WebSocket endpoint + per-connection main loop."""

    async def llm_ws_endpoint(self, websocket: WebSocket, page_id: int) -> None:
        """WebSocket endpoint. Mounted as /ws/{page_id}."""
        print(f"!!!!! [ws] ENDPOINT REACHED page_id={page_id} !!!!!", flush=True)

        await self._log(
            websocket,
            "info",
            f"[ws] === incoming connection for page {page_id} ===",
        )

        # ---- Auth ----
        user = await self._authenticate_ws(websocket)
        await self._log(websocket, "info", f"[ws] auth result: user={user}")

        if not user:
            await websocket.close(code=4403)
            return

        # Any authenticated user may use the LLM chat.
        # (Previously this required is_superadmin — removed so that
        # regular users can also use the editor.)

        await websocket.accept()
        await self._log(
            websocket,
            "info",
            f"[ws] page {page_id} connected (user_id={user.get('id')})",
        )

        # Per-connection state.
        current_task: Optional[asyncio.Task] = None
        current_run_id: Optional[int] = None

        try:
            while True:
                # ---- Receive ----
                try:
                    msg = await websocket.receive_json()
                except json.JSONDecodeError as e:
                    await self._log(websocket, "warning", f"[ws] invalid JSON: {e}")
                    await self._safe_send(
                        websocket,
                        {"type": "error", "message": "Некорректный JSON"},
                    )
                    continue

                mtype = msg.get("type")

                # ---- Keepalive ----
                if mtype == "ping":
                    await self._safe_send(websocket, {"type": "pong"})
                    continue

                await self._log(
                    websocket,
                    "info",
                    f"[ws] received: type={mtype}, keys={list(msg.keys())}",
                )

                # ============================================
                # TYPE: start — full flow through the router
                # ============================================
                if mtype == "start":
                    print("=" * 60, flush=True)
                    print("[START-IN] raw message from frontend:", flush=True)
                    print(
                        json.dumps(msg, ensure_ascii=False, indent=2)[:4000],
                        flush=True,
                    )
                    print("=" * 60, flush=True)

                    # Supersede any active run for this page.
                    await self._supersede_active_run(page_id, current_run_id)

                    # Refuse a new start while a task is in flight.
                    if current_task and not current_task.done():
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Предыдущий запрос ещё выполняется",
                            },
                        )
                        continue

                    user_message = msg.get("message", "").strip()
                    block_catalog = msg.get("block_catalog") or []
                    selection = msg.get("selection") or None

                    if not user_message:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Пустой запрос"},
                        )
                        continue

                    history = await self._load_history(page_id)
                    await self._persist_user_message(page_id, user_message)

                    run = await self._create_run(
                        page_id=page_id,
                        user_message=user_message,
                        block_catalog=block_catalog,
                        user_id=user.get("id"),
                    )
                    if not run:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Не удалось создать run"},
                        )
                        continue

                    current_run_id = run["id"]
                    self._get_cancel_event(current_run_id)

                    await self._safe_send(
                        websocket,
                        {"type": "run_started", "run_id": current_run_id},
                    )

                    current_task = asyncio.create_task(
                        self._run_agent(
                            websocket=websocket,
                            page_id=page_id,
                            run_id=current_run_id,
                            user_message=user_message,
                            block_catalog=block_catalog,
                            selection=selection,
                            history=history,
                        )
                    )

                # ============================================
                # TYPE: effect_edit — direct edit agent, no router
                # ============================================
                elif mtype == "effect_edit":
                    print("=" * 60, flush=True)
                    print("[EFFECT-EDIT-IN] raw message from frontend:", flush=True)
                    print(
                        json.dumps(msg, ensure_ascii=False, indent=2)[:4000],
                        flush=True,
                    )
                    print("=" * 60, flush=True)

                    await self._supersede_active_run(page_id, current_run_id)

                    if current_task and not current_task.done():
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Предыдущий запрос ещё выполняется",
                            },
                        )
                        continue

                    user_message = msg.get("message", "").strip()
                    effect_id = (msg.get("effect_id") or "").strip()
                    effect_css = msg.get("effect_css") or ""
                    # Current human label + list of ids already taken
                    # by OTHER effects. Forwarded to the edit agent so
                    # it can decide whether to propose a rename
                    # (new_id + new_label).
                    effect_label = msg.get("effect_label") or None
                    raw_existing = msg.get("existing_effect_ids") or []
                    existing_effect_ids = [
                        str(x).strip()
                        for x in raw_existing
                        if isinstance(x, (str, int)) and str(x).strip()
                    ]

                    if not user_message:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Пустой запрос"},
                        )
                        continue

                    if not effect_id or not effect_css:
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Режим правки эффекта не активен",
                            },
                        )
                        continue

                    await self._log(
                        websocket,
                        "info",
                        f"[ws] effect_edit effect_id={effect_id} "
                        f"label={effect_label!r} "
                        f"existing={len(existing_effect_ids)}",
                    )

                    history = await self._load_history(page_id)
                    await self._persist_user_message(page_id, user_message)

                    run = await self._create_run(
                        page_id=page_id,
                        user_message=user_message,
                        block_catalog=[],
                        user_id=user.get("id"),
                    )
                    if not run:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Не удалось создать run"},
                        )
                        continue

                    current_run_id = run["id"]
                    self._get_cancel_event(current_run_id)

                    await self._safe_send(
                        websocket,
                        {"type": "run_started", "run_id": current_run_id},
                    )

                    current_task = asyncio.create_task(
                        self._run_effect_edit(
                            websocket=websocket,
                            page_id=page_id,
                            run_id=current_run_id,
                            user_message=user_message,
                            effect_id=effect_id,
                            effect_css=effect_css,
                            effect_label=effect_label,
                            existing_effect_ids=existing_effect_ids,
                            history=history,
                        )
                    )

                # ============================================
                # TYPE: effect_rename — direct rename agent, no router
                # ============================================
                elif mtype == "effect_rename":
                    print("=" * 60, flush=True)
                    print("[EFFECT-RENAME-IN] raw message from frontend:", flush=True)
                    print(
                        json.dumps(msg, ensure_ascii=False, indent=2)[:4000],
                        flush=True,
                    )
                    print("=" * 60, flush=True)

                    await self._supersede_active_run(page_id, current_run_id)

                    if current_task and not current_task.done():
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Предыдущий запрос ещё выполняется",
                            },
                        )
                        continue

                    user_message = msg.get("message", "").strip()
                    effect_id = (msg.get("effect_id") or "").strip()
                    effect_css = msg.get("effect_css") or ""
                    effect_label = msg.get("effect_label") or None
                    raw_existing = msg.get("existing_effect_ids") or []
                    existing_effect_ids = [
                        str(x).strip()
                        for x in raw_existing
                        if isinstance(x, (str, int)) and str(x).strip()
                    ]

                    if not effect_id or not effect_css:
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Режим переименования не активен",
                            },
                        )
                        continue

                    await self._log(
                        websocket,
                        "info",
                        f"[ws] effect_rename effect_id={effect_id} "
                        f"label={effect_label!r} "
                        f"existing={len(existing_effect_ids)}",
                    )

                    history = await self._load_history(page_id)
                    await self._persist_user_message(
                        page_id,
                        user_message or "переименование эффекта",
                    )

                    run = await self._create_run(
                        page_id=page_id,
                        user_message=user_message or "переименование эффекта",
                        block_catalog=[],
                        user_id=user.get("id"),
                    )
                    if not run:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Не удалось создать run"},
                        )
                        continue

                    current_run_id = run["id"]
                    self._get_cancel_event(current_run_id)

                    await self._safe_send(
                        websocket,
                        {"type": "run_started", "run_id": current_run_id},
                    )

                    current_task = asyncio.create_task(
                        self._run_effect_rename(
                            websocket=websocket,
                            page_id=page_id,
                            run_id=current_run_id,
                            user_message=user_message,
                            effect_id=effect_id,
                            effect_css=effect_css,
                            effect_label=effect_label,
                            existing_effect_ids=existing_effect_ids,
                            history=history,
                        )
                    )

                # ============================================
                # TYPE: create_effect — direct draft agent, no router
                # ============================================
                elif mtype == "create_effect":
                    print("=" * 60, flush=True)
                    print("[CREATE-EFFECT-IN] raw message from frontend:", flush=True)
                    print(
                        json.dumps(msg, ensure_ascii=False, indent=2)[:4000],
                        flush=True,
                    )
                    print("=" * 60, flush=True)

                    await self._supersede_active_run(page_id, current_run_id)

                    if current_task and not current_task.done():
                        await self._safe_send(
                            websocket,
                            {
                                "type": "error",
                                "message": "Предыдущий запрос ещё выполняется",
                            },
                        )
                        continue

                    user_message = msg.get("message", "").strip()
                    previous_draft = msg.get("previous_draft") or None

                    # Ids already registered in the palette. Passed to
                    # the create_effect agent so it can tell the LLM
                    # not to pick a colliding id.
                    raw_existing = msg.get("existing_effect_ids") or []
                    existing_effect_ids = [
                        str(x).strip()
                        for x in raw_existing
                        if isinstance(x, (str, int)) and str(x).strip()
                    ]

                    if not user_message:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Пустой запрос"},
                        )
                        continue

                    await self._log(
                        websocket,
                        "info",
                        f"[ws] create_effect existing={len(existing_effect_ids)}",
                    )

                    history = await self._load_history(page_id)
                    await self._persist_user_message(page_id, user_message)

                    run = await self._create_run(
                        page_id=page_id,
                        user_message=user_message,
                        block_catalog=[],
                        user_id=user.get("id"),
                    )
                    if not run:
                        await self._safe_send(
                            websocket,
                            {"type": "error", "message": "Не удалось создать run"},
                        )
                        continue

                    current_run_id = run["id"]
                    self._get_cancel_event(current_run_id)

                    await self._safe_send(
                        websocket,
                        {"type": "run_started", "run_id": current_run_id},
                    )

                    current_task = asyncio.create_task(
                        self._run_create_effect(
                            websocket=websocket,
                            page_id=page_id,
                            run_id=current_run_id,
                            user_message=user_message,
                            previous_draft=previous_draft,
                            existing_effect_ids=existing_effect_ids,
                            history=history,
                        )
                    )

                # ============================================
                # TYPE: cancel
                # ============================================
                elif mtype == "cancel":
                    await self._log(
                        websocket,
                        "info",
                        f"[ws] cancel received for run {current_run_id}",
                    )
                    if current_run_id:
                        ev = self._cancel_events.get(current_run_id)
                        if ev:
                            ev.set()
                        await self._cancel_run_in_db(
                            current_run_id,
                            "cancelled by user",
                        )

                # ============================================
                # Unknown type
                # ============================================
                else:
                    await self._safe_send(
                        websocket,
                        {
                            "type": "error",
                            "message": f"Неизвестный тип сообщения: {mtype}",
                        },
                    )

        # ---- Client closed the socket ----
        except WebSocketDisconnect as e:
            await self._log(
                websocket,
                "info",
                f"[ws] page {page_id} disconnected: "
                f"code={e.code} reason={e.reason!r}",
            )
            if current_run_id:
                ev = self._cancel_events.get(current_run_id)
                if ev:
                    ev.set()
                await self._cancel_run_in_db(
                    current_run_id,
                    "websocket disconnected",
                )

        # ---- Unexpected error in the main loop ----
        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[ws] unexpected error in main loop: {e}\n"
                f"{traceback.format_exc()}",
            )
            raise

        # ---- Always: clear the cancel event for the last run ----
        finally:
            if current_run_id:
                self._clear_cancel_event(current_run_id)
            await self._log(
                websocket,
                "info",
                f"[ws] handler for page {page_id} finished",
            )

    # ============================================
    # SMALL HELPERS USED ONLY BY THE ENDPOINT
    # ============================================

    async def _supersede_active_run(
        self,
        page_id: int,
        current_run_id: Optional[int],
    ) -> None:
        """
        Cancel any DB-registered active run for this page, and set its
        cancel event if we own it. Called at the start of every
        start / effect_edit / effect_rename / create_effect handler.

        Safe to call when there is no active run — a no-op.
        """
        from ..runs import CoreEngineLibWordLlmRuns

        try:
            active = await CoreEngineLibWordLlmRuns.get_active_run_for_page(page_id)
        except Exception as e:
            print(f"[ws] get_active_run failed: {e}", flush=True)
            return

        if not active:
            return

        try:
            await CoreEngineLibWordLlmRuns.cancel_run(
                active["id"],
                "superseded by a new run",
            )
        except Exception as e:
            print(f"[ws] cancel_run failed: {e}", flush=True)

        # If we still hold the event in this process, set it.
        ev = self._cancel_events.get(active["id"])
        if ev:
            ev.set()

    async def _persist_user_message(self, page_id: int, text: str) -> None:
        """
        Save the user's message into page_chat. Best-effort — a failure
        here is logged but does not abort the run.
        """
        from ..service import CoreEngineLibWordLlmService

        try:
            await CoreEngineLibWordLlmService.save_chat_message(
                page_id=page_id,
                role="user",
                content=text,
            )
        except Exception as e:
            print(f"[ws] save user msg failed: {e}", flush=True)

    async def _create_run(
        self,
        page_id: int,
        user_message: str,
        block_catalog: list,
        user_id: Optional[int],
    ) -> Optional[dict]:
        """
        Create a run row in the DB. Returns the run dict, or None on
        any failure (the caller sends an error frame).
        """
        from ..runs import CoreEngineLibWordLlmRuns

        try:
            return await CoreEngineLibWordLlmRuns.create_run(
                page_id=page_id,
                user_message=user_message,
                block_catalog=block_catalog,
                user_id=user_id,
            )
        except Exception as e:
            print(f"[ws] create_run failed: {e}", flush=True)
            return None

    async def _cancel_run_in_db(self, run_id: int, reason: str) -> None:
        """
        Mark a run as cancelled in the DB. Best-effort — a failure is
        logged and swallowed.
        """
        from ..runs import CoreEngineLibWordLlmRuns

        try:
            await CoreEngineLibWordLlmRuns.cancel_run(run_id, reason)
        except Exception as e:
            print(f"[ws] cancel_run({run_id}) failed: {e}", flush=True)