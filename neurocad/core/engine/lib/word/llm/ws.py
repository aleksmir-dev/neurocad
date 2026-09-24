# neurocad/core/engine/lib/word/llm/ws.py

"""
WebSocket endpoint for the LLM editor.

Namespace: CoreEngineLibWordLlmWS

One WS connection per open editor tab. The client sends:

  {"type": "start", "message": "...", "block_catalog": [...], "selection": {...}}
  {"type": "cancel"}
  {"type": "ping"}

The server routes the request to one of the agents in agent/ and sends
back the result:

  {"type": "run_started",      "run_id": 42}
  {"type": "step",             "step": "...", "message": "..."}     ← progress
  {"type": "plan",             "blocks": [...]}                     ← create
  {"type": "fill_progress",    "request": 1, "total": 3, ...}       ← create
  {"type": "html_update",      "html": "<full page html>"}          ← create
  {"type": "element_update",   "selector": "sel-abc123", "html": "..."}  ← fill / effect
  {"type": "assistant_message","content": "..."}
  {"type": "done",             "run_id": 42}

  {"type": "cancelled",        "run_id": 42}
  {"type": "error",            "message": "..."}
  {"type": "pong"}

Intermediate events (step, plan, fill_progress) are emitted by the
router and by the agents themselves via the `emit` callback.

Dialogue history
----------------
Every `start` loads the last N messages from `page_chat` and passes them
to the agent as `history`. Both the user message and the assistant reply
are persisted back to `page_chat`.

Prompt dumping
--------------
Every LLM request and response is dumped to disk by
CoreEngineLibWordLlmDumper, one folder per run
(log/llm-prompts/run-<id>/). Each file is prefixed with the agent name.

Cancellation
------------
The server does NOT abort the in-flight LLM request. It waits for the
current call to finish, then checks the cancel flag before continuing.

Reconnection
------------
If the WebSocket drops mid-run, the run stays in the DB. On reconnect,
the client can query `GET /chat/{page_id}/run/active`.

Security
--------
Cookie-based auth: read `access_token`, decode JWT, look up the user
via CoreAuthService. Non-superadmin connections are closed with 4403.
"""

import asyncio
import inspect
import json
import traceback
from typing import Any, Dict, List, Optional

from fastapi import WebSocket, WebSocketDisconnect

from .runs import CoreEngineLibWordLlmRuns
from .service import CoreEngineLibWordLlmService
from .dumper import CoreEngineLibWordLlmDumper
from .agent.router import CoreEngineLibWordLlmRouter
from .agent.none import CoreEngineLibWordLlmAgentNone
from .agent.help import CoreEngineLibWordLlmAgentHelp
from .agent.create import CoreEngineLibWordLlmAgentCreate
from .agent.fill import CoreEngineLibWordLlmAgentFill
from .agent.effect import CoreEngineLibWordLlmAgentEffect
from ......utils.llm.factory import get_provider
from neurocad.config import settings


# ============================================
# AGENT REGISTRY
# ============================================

_AGENTS = {
    "none":   CoreEngineLibWordLlmAgentNone,
    "help":   CoreEngineLibWordLlmAgentHelp,
    "create": CoreEngineLibWordLlmAgentCreate,
    "fill":   CoreEngineLibWordLlmAgentFill,
    "effect": CoreEngineLibWordLlmAgentEffect,
}


class CoreEngineLibWordLlmWS:
    """WebSocket endpoint + agent dispatcher for the LLM editor."""

    # ============================================
    # CONFIG
    # ============================================

    #: How many previous messages (user + assistant) to include as context.
    HISTORY_LIMIT = 20

    # ============================================
    # CANCEL FLAGS
    # ============================================

    _cancel_events: Dict[int, asyncio.Event] = {}

    @classmethod
    def _get_cancel_event(cls, run_id: int) -> asyncio.Event:
        ev = cls._cancel_events.get(run_id)
        if ev is None:
            ev = asyncio.Event()
            cls._cancel_events[run_id] = ev
        return ev

    @classmethod
    def _clear_cancel_event(cls, run_id: int) -> None:
        cls._cancel_events.pop(run_id, None)

    # ============================================
    # PROVIDER FACTORY (with mock switch)
    # ============================================

    @staticmethod
    def _get_provider():
        if settings.LLM_MOCK:
            from .mock import CoreEngineLibWordLlmMock
            return CoreEngineLibWordLlmMock(delay=settings.LLM_MOCK_DELAY)
        return get_provider()

    # ============================================
    # LOGGING BRIDGE
    # ============================================

    @staticmethod
    async def _log(
        websocket: WebSocket,
        level: str,
        message: str,
        **kwargs: Any,
    ) -> None:
        """Write a log line through app.state.log, else to stderr."""
        try:
            log = getattr(websocket.app.state, "log", None)
        except Exception:
            log = None

        if log is not None:
            try:
                fn = getattr(log, f"log_{level}", None)
                if fn is None:
                    fn = getattr(log, "log_info", None)

                if fn is not None:
                    if inspect.iscoroutinefunction(fn):
                        asyncio.create_task(
                            fn(target="ws", message=message, **kwargs)
                        )
                    else:
                        fn(target="ws", message=message, **kwargs)
                    return

                fn_sync = getattr(log, f"log_{level}_sync", None)
                if fn_sync is None:
                    fn_sync = getattr(log, "log_info_sync", None)
                if fn_sync is not None:
                    fn_sync(target="ws", message=message, **kwargs)
                    return

            except Exception as e:
                print(f"[ws][log-fail] {e!r} :: {message}", flush=True)
                return

        print(f"[ws][{level}] {message}", flush=True)

    # ============================================
    # HISTORY HELPERS
    # ============================================

    @staticmethod
    async def _load_history(page_id: int) -> List[Dict[str, str]]:
        """Load the last HISTORY_LIMIT messages from page_chat."""
        try:
            rows = await CoreEngineLibWordLlmService.load_chat_history(page_id)
        except Exception as e:
            print(f"[ws-history] load failed for page {page_id}: {e}", flush=True)
            return []

        limit = CoreEngineLibWordLlmWS.HISTORY_LIMIT
        tail = rows[-limit:] if len(rows) > limit else rows
        return [
            {"role": m["role"], "content": m["content"]}
            for m in tail
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

    # ============================================
    # ENDPOINT
    # ============================================

    @staticmethod
    async def llm_ws_endpoint(websocket: WebSocket, page_id: int) -> None:
        """WebSocket endpoint. Mounted as /ws/{page_id}."""
        print(f"!!!!! [ws] ENDPOINT REACHED page_id={page_id} !!!!!", flush=True)

        await CoreEngineLibWordLlmWS._log(
            websocket, "info", f"[ws] === incoming connection for page {page_id} ==="
        )

        # ---- Auth ----
        user = await CoreEngineLibWordLlmWS._authenticate_ws(websocket)
        await CoreEngineLibWordLlmWS._log(websocket, "info", f"[ws] auth result: user={user}")

        if not user:
            await websocket.close(code=4403)
            return

        if not bool(user.get("is_superadmin")):
            await websocket.close(code=4403)
            return

        await websocket.accept()
        await CoreEngineLibWordLlmWS._log(
            websocket, "info",
            f"[ws] page {page_id} connected (user_id={user.get('id')})",
        )

        current_task: Optional[asyncio.Task] = None
        current_run_id: Optional[int] = None

        try:
            while True:
                try:
                    msg = await websocket.receive_json()
                except json.JSONDecodeError as e:
                    await CoreEngineLibWordLlmWS._log(websocket, "warning", f"[ws] invalid JSON: {e}")
                    await CoreEngineLibWordLlmWS._safe_send(websocket, {
                        "type": "error",
                        "message": "Некорректный JSON",
                    })
                    continue

                mtype = msg.get("type")

                if mtype == "ping":
                    await CoreEngineLibWordLlmWS._safe_send(websocket, {"type": "pong"})
                    continue

                await CoreEngineLibWordLlmWS._log(
                    websocket, "info",
                    f"[ws] received: type={mtype}, keys={list(msg.keys())}",
                )

                if mtype == "start":
                    print("=" * 60, flush=True)
                    print("[START-IN] raw message from frontend:", flush=True)
                    print(json.dumps(msg, ensure_ascii=False, indent=2)[:4000], flush=True)
                    print("=" * 60, flush=True)

                    # Cancel any active run for this page
                    active = await CoreEngineLibWordLlmRuns.get_active_run_for_page(page_id)
                    if active:
                        await CoreEngineLibWordLlmRuns.cancel_run(
                            active["id"], "superseded by a new run"
                        )
                        ev = CoreEngineLibWordLlmWS._cancel_events.get(active["id"])
                        if ev:
                            ev.set()

                    if current_task and not current_task.done():
                        await CoreEngineLibWordLlmWS._safe_send(websocket, {
                            "type": "error",
                            "message": "Предыдущий запрос ещё выполняется",
                        })
                        continue

                    user_message = msg.get("message", "").strip()
                    block_catalog = msg.get("block_catalog") or []
                    selection = msg.get("selection") or None

                    if not user_message:
                        await CoreEngineLibWordLlmWS._safe_send(websocket, {
                            "type": "error",
                            "message": "Пустой запрос",
                        })
                        continue

                    # History
                    history = await CoreEngineLibWordLlmWS._load_history(page_id)

                    # Save user message
                    try:
                        await CoreEngineLibWordLlmService.save_chat_message(
                            page_id=page_id,
                            role="user",
                            content=user_message,
                        )
                    except Exception as e:
                        await CoreEngineLibWordLlmWS._log(
                            websocket, "warning", f"[ws] save user msg failed: {e}"
                        )

                    # Create run
                    run = await CoreEngineLibWordLlmRuns.create_run(
                        page_id=page_id,
                        user_message=user_message,
                        block_catalog=block_catalog,
                        user_id=user.get("id"),
                    )
                    if not run:
                        await CoreEngineLibWordLlmWS._safe_send(websocket, {
                            "type": "error",
                            "message": "Не удалось создать run",
                        })
                        continue

                    current_run_id = run["id"]
                    CoreEngineLibWordLlmWS._get_cancel_event(current_run_id)

                    await CoreEngineLibWordLlmWS._safe_send(websocket, {
                        "type": "run_started",
                        "run_id": current_run_id,
                    })

                    current_task = asyncio.create_task(
                        CoreEngineLibWordLlmWS._run_agent(
                            websocket=websocket,
                            page_id=page_id,
                            run_id=current_run_id,
                            user_message=user_message,
                            block_catalog=block_catalog,
                            selection=selection,
                            history=history,
                        )
                    )

                elif mtype == "cancel":
                    await CoreEngineLibWordLlmWS._log(
                        websocket, "info", f"[ws] cancel received for run {current_run_id}"
                    )
                    if current_run_id:
                        ev = CoreEngineLibWordLlmWS._cancel_events.get(current_run_id)
                        if ev:
                            ev.set()
                        await CoreEngineLibWordLlmRuns.cancel_run(current_run_id, "cancelled by user")

                else:
                    await CoreEngineLibWordLlmWS._safe_send(websocket, {
                        "type": "error",
                        "message": f"Неизвестный тип сообщения: {mtype}",
                    })

        except WebSocketDisconnect as e:
            await CoreEngineLibWordLlmWS._log(
                websocket, "info",
                f"[ws] page {page_id} disconnected: code={e.code} reason={e.reason!r}",
            )
            if current_run_id:
                ev = CoreEngineLibWordLlmWS._cancel_events.get(current_run_id)
                if ev:
                    ev.set()
                try:
                    await CoreEngineLibWordLlmRuns.cancel_run(
                        current_run_id, "websocket disconnected"
                    )
                except Exception:
                    pass

        except Exception as e:
            await CoreEngineLibWordLlmWS._log(
                websocket, "error",
                f"[ws] unexpected error in main loop: {e}\n{traceback.format_exc()}",
            )
            raise

        finally:
            if current_run_id:
                CoreEngineLibWordLlmWS._clear_cancel_event(current_run_id)
            await CoreEngineLibWordLlmWS._log(
                websocket, "info", f"[ws] handler for page {page_id} finished"
            )

    # ============================================
    # AGENT DISPATCHER
    # ============================================

    @staticmethod
    async def _run_agent(
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        block_catalog: list,
        selection: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """
        Route the request to one agent and send the result to the client.
        """
        print(f"[RUN-AGENT] ENTER run={run_id}", flush=True)

        cancel_event = CoreEngineLibWordLlmWS._get_cancel_event(run_id)
        provider = CoreEngineLibWordLlmWS._get_provider()
        history = history or []

        # Dump meta for this run
        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=block_catalog,
        )

        # Load current page HTML (for router state + agents)
        current_html = await CoreEngineLibWordLlmWS._load_current_page_html(page_id)

        # ---- EMIT helper ----
        async def _emit(msg: dict) -> None:
            await CoreEngineLibWordLlmWS._safe_send(websocket, msg)

        try:
            # ---- ROUTER ----
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id, status="planning", step=1, message="Определяю действие..."
            )

            routing = await CoreEngineLibWordLlmRouter.route(
                provider=provider,
                user_message=user_message,
                selection=selection,
                current_html=current_html,
                run_id=run_id,
                emit=_emit,
            )
            agent_name = routing.get("agent", "help")
            target = routing.get("target")

            print(f"[RUN-AGENT] run={run_id} agent={agent_name} target={target}", flush=True)

            if cancel_event.is_set():
                await CoreEngineLibWordLlmWS._finish_cancelled(websocket, run_id)
                return

            # ---- NO TARGET FOR fill / effect ----
            has_element = bool((selection or {}).get("selector"))
            if agent_name in ("fill", "effect") and not has_element:
                msg_text = (
                    "Выделите элемент на странице мышкой и повторите запрос."
                )
                await CoreEngineLibWordLlmWS._log(
                    websocket, "info",
                    f"[run-agent] run {run_id} {agent_name} without selection — asking user to select",
                )
                try:
                    await CoreEngineLibWordLlmService.save_chat_message(
                        page_id=page_id,
                        role="assistant",
                        content=msg_text,
                    )
                except Exception as e:
                    await CoreEngineLibWordLlmWS._log(
                        websocket, "warning", f"[ws] save assistant msg failed: {e}"
                    )
                await CoreEngineLibWordLlmRuns.update_run_status(
                    run_id, status="failed",
                    message="Не выделен элемент",
                    error="selection required",
                )
                await CoreEngineLibWordLlmWS._safe_send(
                    websocket, {"type": "assistant_message", "content": msg_text}
                )
                await CoreEngineLibWordLlmWS._safe_send(
                    websocket, {"type": "done", "run_id": run_id}
                )
                return

            # ---- AGENT ----
            agent_cls = _AGENTS.get(agent_name)
            if agent_cls is None:
                agent_cls = _AGENTS["help"]

            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id, status="filling", step=2, message="Обрабатываю запрос..."
            )

            agent = agent_cls()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=selection,
                block_catalog=block_catalog,
                current_html=current_html,
                history=history,
            )

            if cancel_event.is_set():
                await CoreEngineLibWordLlmWS._finish_cancelled(websocket, run_id)
                return

            # ---- RESULT ----
            message = result.get("message") or ""
            html = result.get("html")
            selector = result.get("selector")
            element_html = result.get("element_html")

            # ---- SAFETY: element_html must look like HTML ----
            # If the agent already rejected the model output (e.g. the
            # LLM returned an error message), it will have set
            # selector=None and element_html=None. But we double-check
            # here as well, in case an agent forgot to do it.
            if selector and element_html:
                trimmed = str(element_html).strip()
                if not trimmed.startswith("<"):
                    print(
                        f"[ws-run] run={run_id} element_html does not look "
                        f"like HTML (starts with {trimmed[:40]!r}) — "
                        f"refusing to send element_update",
                        flush=True,
                    )
                    selector = None
                    element_html = None

            # Save assistant message
            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await CoreEngineLibWordLlmWS._log(
                    websocket, "warning", f"[ws] save assistant msg failed: {e}"
                )

            # Persist final HTML for the run
            if html and str(html).strip().startswith("<"):
                final_html = html
            elif element_html and str(element_html).strip().startswith("<"):
                final_html = element_html
            else:
                final_html = ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id, final_html, message=message
            )

            # Send to client
            if html and str(html).strip().startswith("<"):
                # Whole page replacement (create)
                await CoreEngineLibWordLlmWS._safe_send(
                    websocket, {"type": "html_update", "html": html}
                )
            if selector and element_html:
                # Single element replacement (fill / effect)
                await CoreEngineLibWordLlmWS._safe_send(
                    websocket,
                    {
                        "type": "element_update",
                        "selector": selector,
                        "html": element_html,
                    },
                )
            if message:
                await CoreEngineLibWordLlmWS._safe_send(
                    websocket, {"type": "assistant_message", "content": message}
                )

            await CoreEngineLibWordLlmWS._safe_send(
                websocket, {"type": "done", "run_id": run_id}
            )

            print(f"[RUN-AGENT] run={run_id} DONE agent={agent_name}", flush=True)

        except Exception as e:
            await CoreEngineLibWordLlmWS._log(
                websocket, "error",
                f"[run-agent] run {run_id} crashed: {e}\n{traceback.format_exc()}",
            )
            print(f"[RUN-AGENT] run={run_id} CRASHED: {e}", flush=True)
            await CoreEngineLibWordLlmWS._finish_error(
                websocket, run_id, f"Внутренняя ошибка: {e}"
            )

        finally:
            CoreEngineLibWordLlmWS._clear_cancel_event(run_id)

    # ============================================
    # HELPERS
    # ============================================

    @staticmethod
    async def _load_current_page_html(page_id: int) -> Optional[str]:
        """Load the current page HTML from the Page table."""
        try:
            from .....models.base import Page
            from ......utils.sqlite import get_db_sqlite
            from sqlalchemy import select

            async for session in get_db_sqlite():
                stmt = select(Page).where(Page.id == page_id, Page.is_delete == 0)
                result = await session.execute(stmt)
                page = result.scalar_one_or_none()
                if not page:
                    return None
                return page.content or None
        except Exception as e:
            print(f"[ws] load current page failed: {e}", flush=True)
            return None

    @staticmethod
    async def _finish_cancelled(websocket: WebSocket, run_id: int) -> None:
        await CoreEngineLibWordLlmRuns.update_run_status(
            run_id, status="cancelled", message="Отменено пользователем"
        )
        await CoreEngineLibWordLlmWS._safe_send(
            websocket, {"type": "cancelled", "run_id": run_id}
        )

    @staticmethod
    async def _finish_error(websocket: WebSocket, run_id: int, message: str) -> None:
        await CoreEngineLibWordLlmRuns.update_run_status(
            run_id, status="failed", message="Ошибка", error=message
        )
        await CoreEngineLibWordLlmWS._safe_send(
            websocket, {"type": "error", "message": message}
        )

    @staticmethod
    async def _safe_send(websocket: WebSocket, payload: dict) -> None:
        try:
            await websocket.send_json(payload)
        except (WebSocketDisconnect, RuntimeError):
            pass

    # ============================================
    # AUTH
    # ============================================

    @staticmethod
    async def _authenticate_ws(websocket: WebSocket) -> Optional[dict]:
        try:
            token = websocket.cookies.get("access_token")
            if not token:
                return None

            from jose import jwt, JWTError
            from neurocad.config import settings

            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                )
            except JWTError:
                return None

            user_id = payload.get("sub")
            if user_id is None:
                return None

            from neurocad.core.auth.service import CoreAuthService
            user = await CoreAuthService.get_user_by_id(int(user_id))
            return user

        except Exception as e:
            print(f"[ws-auth] unexpected error: {e}", flush=True)
            return None


# ============================================
# MODULE-LEVEL ENDPOINT (for router mounting)
# ============================================

llm_ws_endpoint = CoreEngineLibWordLlmWS.llm_ws_endpoint