# neurocad/core/engine/lib/word/llm/websocket/cancel.py

"""
CancelMixin — cancellation flags, terminal send helpers, and the
last-resort error path for the WebSocket endpoint.

Responsibilities:

  1. _get_cancel_event(run_id)
     Returns the asyncio.Event associated with a run. Creates it on
     first access. The event is SET by `type: "cancel"` messages and
     by WebSocket disconnect / supersession by a new run. Long-running
     agents check `event.is_set()` after every external call.

  2. _clear_cancel_event(run_id)
     Drops the event once the run is fully finished. Called in the
     `finally` block of every dispatcher.

  3. _finish_cancelled(websocket, run_id)
     Marks the run as cancelled in the DB, sends `{type: "cancelled"}`
     to the client. Idempotent — safe to call from multiple paths.

  4. _finish_error(websocket, run_id, message)
     Marks the run as failed in the DB, sends `{type: "error"}` to the
     client. Used as the last-resort handler from every dispatcher's
     except-block.

  5. _safe_send(websocket, payload)
     Sends a JSON payload, swallowing WebSocketDisconnect and
     RuntimeError (closed socket). All outgoing WS traffic goes
     through this — no exception ever escapes.

Cancel events live in a class-level dict on the base class
(`_cancel_events`). Mixins access it via `self._cancel_events` — the
dict itself is shared across all connections on purpose, because a
run_id is unique per run and only one connection owns it at a time.

These methods used to be @staticmethod on CoreEngineLibWordLlmWS.
They are now regular methods on a mixin, so they are called as
`self._get_cancel_event(...)` / `self._safe_send(...)`.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

import asyncio
from typing import Dict

from fastapi import WebSocket, WebSocketDisconnect


class CancelMixin:
    """Cancellation flags and terminal send helpers."""

    #: Per-run cancel events. Actual dict is declared on the base
    #: class (`_cancel_events: Dict[int, asyncio.Event] = {}`).
    #: Declared here only for static type-checkers — a mixin cannot
    #: hold instance state on its own.
    _cancel_events: Dict[int, asyncio.Event]

    # ============================================
    # CANCEL EVENTS
    # ============================================

    def _get_cancel_event(self, run_id: int) -> asyncio.Event:
        """
        Return the cancel event for a run, creating it on first use.

        Never returns None: if the key is missing, a fresh Event is
        created and stored. The caller does not need to check for
        existence before `.is_set()` / `.set()`.
        """
        ev = self._cancel_events.get(run_id)
        if ev is None:
            ev = asyncio.Event()
            self._cancel_events[run_id] = ev
        return ev

    def _clear_cancel_event(self, run_id: int) -> None:
        """
        Drop the cancel event once the run is finished.

        Called from the `finally` block of every dispatcher. If the
        key is already gone — no-op.
        """
        self._cancel_events.pop(run_id, None)

    # ============================================
    # TERMINAL SEND HELPERS
    # ============================================

    async def _finish_cancelled(self, websocket: WebSocket, run_id: int) -> None:
        """
        Mark a run as cancelled in the DB and notify the client.

        The DB write is best-effort — if it fails (network, DB down),
        we still send `{type: "cancelled"}`. The client must not be
        left waiting.
        """
        from ..runs import CoreEngineLibWordLlmRuns

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="cancelled",
                message="Отменено пользователем",
            )
        except Exception as e:
            print(f"[ws-cancel] failed to update run {run_id}: {e}", flush=True)

        await self._safe_send(websocket, {"type": "cancelled", "run_id": run_id})

    async def _finish_error(
        self,
        websocket: WebSocket,
        run_id: int,
        message: str,
    ) -> None:
        """
        Mark a run as failed in the DB and notify the client.

        Used as the last-resort handler from every dispatcher's
        except-block. The DB write is best-effort; the client always
        receives `{type: "error"}` with the human-readable message.
        """
        from ..runs import CoreEngineLibWordLlmRuns

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="failed",
                message="Ошибка",
                error=message,
            )
        except Exception as e:
            print(f"[ws-error] failed to update run {run_id}: {e}", flush=True)

        await self._safe_send(websocket, {"type": "error", "message": message})

    # ============================================
    # SAFE SEND
    # ============================================

    async def _safe_send(self, websocket: WebSocket, payload: dict) -> None:
        """
        Send JSON, swallowing the two expected "socket is gone" errors.

        Called from everywhere (routers, agents' `emit` callbacks,
        finish handlers). Should never raise — the WS handler must not
        crash because the client closed the tab.
        """
        try:
            await websocket.send_json(payload)
        except (WebSocketDisconnect, RuntimeError):
            pass