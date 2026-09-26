# neurocad/core/engine/lib/word/llm/websocket/dispatch.py

"""
DispatchMixin — four run methods, one per WS request type.

  _run_agent(websocket, page_id, run_id, user_message,
             block_catalog, selection, history)
      Full flow for `type: "start"`. Loads the page HTML, asks the
      router which agent should handle the request, then runs that
      agent. Router + agent each get an `emit` callback so they can
      send intermediate events to the client.

  _run_effect_edit(websocket, page_id, run_id, user_message,
                   effect_id, effect_css, effect_label,
                   existing_effect_ids, history)
      Direct flow for `type: "effect_edit"`. No router, no page HTML.
      The client already told us which effect is being edited and
      sent its current CSS. It also sends the current label and the
      list of ids already taken by other effects — the agent uses
      both to decide whether the edit changes the meaning of the
      effect and should therefore propose a rename. We call the
      "edit" agent and return the new CSS (plus optional new_id /
      new_label) as `css_update`.

  _run_effect_rename(websocket, page_id, run_id, user_message,
                     effect_id, effect_css, effect_label,
                     existing_effect_ids, history)
      Direct flow for `type: "effect_rename"`. The user clicked the
      "pencil" button on an active effect; we call the "rename" agent
      to propose a NEW label and SVG miniature for the effect. The
      `id` and the CSS are NOT changed — the agent returns the same
      id and CSS it received, plus `new_label` and `new_media`. We
      forward them to the client as `css_update` with those two
      extra fields, and the client updates the block's label/icon
      in the palette. Nothing is written to disk here — that happens
      later, when the client has all the pieces (label, media) and
      applies them via the standard relabel endpoint.

  _run_create_effect(websocket, page_id, run_id, user_message,
                     previous_draft, existing_effect_ids, history)
      Direct flow for `type: "create_effect"`. The agent returns a
      JSON draft (id, label, hint, css, media). We send it as
      `effect_draft`. Nothing is written to disk here — the frontend
      POSTs to /editor/effects after the user confirms with "сохрани".

      `existing_effect_ids` — the list of effect ids already
      registered in the palette. Passed to the agent so it can tell
      the LLM not to pick a colliding id.

Every method follows the same skeleton:

    try:
        update_run_status("planning" | "filling")
        result = await agent.run(...)
        if cancel_event.is_set(): finish_cancelled; return
        save assistant message
        persist run's final state (html/css/message)
        send result to client
        send `done`
    except Exception as e:
        log the traceback
        finish_error
    finally:
        clear_cancel_event(run_id)

Cancel semantics: the server never aborts an in-flight LLM request.
We wait for the current call to finish, then check
`cancel_event.is_set()` and stop. That is why `cancel_event.is_set()`
appears after every `agent.run(...)` and why the original request
always completes on the network side.

These methods used to be @staticmethod on CoreEngineLibWordLlmWS.
Now they are regular methods on a mixin — called as
`self._run_agent(...)` / `self._run_effect_edit(...)` /
`self._run_effect_rename(...)` / `self._run_create_effect(...)`
from the endpoint.

Namespace: CoreEngineLibWordLlmWS (via Base + mixins)
"""

import traceback
from typing import Any, Dict, List, Optional

from fastapi import WebSocket

from .agents import _AGENTS


class DispatchMixin:
    """Run methods for the four WS request types."""

    # ============================================
    # TYPE: start — router then agent
    # ============================================

    async def _run_agent(
        self,
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

        Steps:
          1. Resolve the provider (mock or real, from the DB).
          2. Dump meta for this run (for post-mortem debugging).
          3. Load the current page HTML (for router state + agents).
          4. Ask the router which agent should handle the request.
          5. Run that agent and send its result to the client.

        Any exception is caught and reported as an `error` frame.
        """
        print(f"[RUN-AGENT] ENTER run={run_id}", flush=True)

        # Imports are lazy so this mixin stays importable even when the
        # DB / provider stack is not yet configured.
        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper
        from ..agent.router import CoreEngineLibWordLlmRouter

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=block_catalog,
            provider_name=provider.name,
            model=provider.model,
        )

        current_html = await self._load_current_page_html(page_id)

        # `emit` — a callback that the router and the agent use to send
        # intermediate frames back to the client (e.g. "step").
        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            # ---- ROUTER ----
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="planning",
                step=1,
                message="Определяю действие...",
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

            print(
                f"[RUN-AGENT] run={run_id} agent={agent_name} target={target}",
                flush=True,
            )

            # "edit", "create_effect" and "rename" are only reachable
            # via their explicit WS types. If the router returns them
            # in a start flow, it got confused — fall back to help.
            if agent_name in ("edit", "create_effect", "rename"):
                print(
                    f"[RUN-AGENT] run={run_id} router returned {agent_name!r} "
                    f"in a start flow — falling back to 'help'",
                    flush=True,
                )
                agent_name = "help"
                target = None

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- NO TARGET FOR fill / effect ----
            has_element = bool((selection or {}).get("selector"))
            if agent_name in ("fill", "effect") and not has_element:
                msg_text = "Выделите элемент на странице мышкой и повторите запрос."
                await self._log(
                    websocket,
                    "info",
                    f"[run-agent] run {run_id} {agent_name} without selection "
                    f"— asking user to select",
                )
                try:
                    await CoreEngineLibWordLlmService.save_chat_message(
                        page_id=page_id,
                        role="assistant",
                        content=msg_text,
                    )
                except Exception as e:
                    await self._log(
                        websocket,
                        "warning",
                        f"[ws] save assistant msg failed: {e}",
                    )
                await CoreEngineLibWordLlmRuns.update_run_status(
                    run_id,
                    status="failed",
                    message="Не выделен элемент",
                    error="selection required",
                )
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": msg_text},
                )
                await self._safe_send(
                    websocket,
                    {"type": "done", "run_id": run_id},
                )
                return

            # ---- AGENT ----
            agent_cls = _AGENTS.get(agent_name)
            if agent_cls is None:
                agent_cls = _AGENTS["help"]

            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=2,
                message="Обрабатываю запрос...",
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
                await self._finish_cancelled(websocket, run_id)
                return

            # ---- RESULT ----
            message = result.get("message") or ""
            html = result.get("html")
            selector = result.get("selector")
            element_html = result.get("element_html")

            # Sanity: element_html must look like HTML. If the model
            # returned prose, drop it — otherwise the client would
            # replace a real component with garbage.
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

            # Save assistant message (best-effort).
            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            # Persist the run's "final" payload — what the run produced.
            if html and str(html).strip().startswith("<"):
                final_html = html
            elif element_html and str(element_html).strip().startswith("<"):
                final_html = element_html
            else:
                final_html = ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            # Send frames to the client.
            if html and str(html).strip().startswith("<"):
                await self._safe_send(
                    websocket,
                    {"type": "html_update", "html": html},
                )
            if selector and element_html:
                await self._safe_send(
                    websocket,
                    {
                        "type": "element_update",
                        "selector": selector,
                        "html": element_html,
                    },
                )
            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

            print(f"[RUN-AGENT] run={run_id} DONE agent={agent_name}", flush=True)

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-agent] run {run_id} crashed: {e}\n{traceback.format_exc()}",
            )
            print(f"[RUN-AGENT] run={run_id} CRASHED: {e}", flush=True)
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: effect_edit — direct edit agent, no router
    # ============================================

    async def _run_effect_edit(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        effect_id: str,
        effect_css: str,
        effect_label: Optional[str] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """
        Run the "edit" agent directly.

        The client already told us which effect is being edited and
        sent its current CSS, its human label, and the list of ids
        already taken by OTHER effects. The agent returns a new full
        CSS; we send it back as `css_update`. If the edit changed the
        MEANING of the effect, the agent also returns `new_id` and
        `new_label` — they are forwarded to the client, which will
        create a new effect and delete the old one on save.

        The effect is NOT written to disk here. That happens later,
        when the user confirms the edit (frontend PUT for an in-place
        edit, or POST + DELETE for a rename).
        """
        print(
            f"[RUN-EFFECT-EDIT] ENTER run={run_id} effect={effect_id} "
            f"existing={len(existing_effect_ids or [])}",
            flush=True,
        )

        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Готовлю правку эффекта...",
            )

            agent = _AGENTS["edit"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                effect_id=effect_id,
                effect_css=effect_css,
                effect_label=effect_label,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            message = result.get("message") or ""
            css = result.get("css")
            result_effect_id = result.get("effect_id")
            new_id = result.get("new_id")
            new_label = result.get("new_label")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            # For an edit run, the "final" payload is the new CSS.
            final_html = css if css else ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            if css and result_effect_id:
                payload: Dict[str, Any] = {
                    "type": "css_update",
                    "effect_id": result_effect_id,
                    "css": css,
                }
                # Optional rename proposal — only present when the
                # agent decided the edit changed the meaning. Always
                # include the keys so the client can rely on their
                # presence; `None` means "no rename, in-place PUT".
                payload["new_id"] = new_id
                payload["new_label"] = new_label

                print(
                    f"[RUN-EFFECT-EDIT] run={run_id} "
                    f"css_update effect={result_effect_id} "
                    f"new_id={new_id!r} new_label={new_label!r}",
                    flush=True,
                )
                await self._safe_send(websocket, payload)

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

            print(
                f"[RUN-EFFECT-EDIT] run={run_id} DONE effect={effect_id}",
                flush=True,
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-effect-edit] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            print(f"[RUN-EFFECT-EDIT] run={run_id} CRASHED: {e}", flush=True)
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: effect_rename — direct rename agent, no router
    # ============================================

    async def _run_effect_rename(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        effect_id: str,
        effect_css: str,
        effect_label: Optional[str] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """
        Run the "rename" agent directly.

        The user clicked the "pencil" button on an active effect. The
        client sent the effect's current CSS, its human label, and
        the list of ids already taken by OTHER effects. The agent
        proposes a NEW label and a NEW SVG miniature — WITHOUT
        changing the id or the CSS.

        We send the SAME id and CSS back with `new_label` and
        `new_media` set, so the client can update the block's label
        and icon in the palette. The id and the CSS file stay exactly
        as they were — nothing on the canvas needs to be touched.

        The effect is NOT written to disk here. That happens later,
        when the client has all the pieces and applies them via the
        standard relabel endpoint.
        """
        print(
            f"[RUN-EFFECT-RENAME] ENTER run={run_id} effect={effect_id}",
            flush=True,
        )

        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Придумываю новое название...",
            )

            agent = _AGENTS["rename"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                effect_id=effect_id,
                effect_css=effect_css,
                effect_label=effect_label,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            message = result.get("message") or ""
            css = result.get("css")
            result_effect_id = result.get("effect_id")
            new_label = result.get("new_label")
            new_media = result.get("new_media")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            # The "final" payload is the (unchanged) CSS.
            final_html = css if css else ""
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                final_html,
                message=message,
            )

            if css and result_effect_id:
                payload: Dict[str, Any] = {
                    "type": "css_update",
                    "effect_id": result_effect_id,
                    "css": css,
                    "new_label": new_label,
                    "new_media": new_media,
                }
                print(
                    f"[RUN-EFFECT-RENAME] run={run_id} "
                    f"css_update effect={result_effect_id} "
                    f"new_label={new_label!r} "
                    f"new_media={(str(new_media)[:40] if new_media else '')!r}",
                    flush=True,
                )
                await self._safe_send(websocket, payload)

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

            print(
                f"[RUN-EFFECT-RENAME] run={run_id} DONE effect={effect_id}",
                flush=True,
            )

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-effect-rename] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            print(f"[RUN-EFFECT-RENAME] run={run_id} CRASHED: {e}", flush=True)
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)

    # ============================================
    # TYPE: create_effect — direct draft agent, no router
    # ============================================

    async def _run_create_effect(
        self,
        websocket: WebSocket,
        page_id: int,
        run_id: int,
        user_message: str,
        previous_draft: Optional[Dict[str, Any]] = None,
        existing_effect_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """
        Run the "create_effect" agent directly.

        The agent returns a JSON draft (id, label, hint, css, media).
        We send it as `effect_draft` and DO NOT write anything to disk.
        The frontend shows the draft to the user; when the user
        confirms with "сохрани", the frontend POSTs to /editor/effects
        — that is where persistence happens.

        `existing_effect_ids` — the list of effect ids already
        registered in the palette. Passed to the agent so it can tell
        the LLM not to pick a colliding id.
        """
        print(
            f"[RUN-CREATE-EFFECT] ENTER run={run_id} "
            f"existing={len(existing_effect_ids or [])}",
            flush=True,
        )

        from ..runs import CoreEngineLibWordLlmRuns
        from ..service import CoreEngineLibWordLlmService
        from ..dumper import CoreEngineLibWordLlmDumper

        cancel_event = self._get_cancel_event(run_id)

        log = getattr(websocket.app.state, "log", None)
        provider = await self._get_provider(log=log)

        history = history or []

        CoreEngineLibWordLlmDumper.dump_meta(
            run_id=run_id,
            page_id=page_id,
            user_message=user_message,
            block_catalog=[],
            provider_name=provider.name,
            model=provider.model,
        )

        async def _emit(msg: dict) -> None:
            await self._safe_send(websocket, msg)

        try:
            await CoreEngineLibWordLlmRuns.update_run_status(
                run_id,
                status="filling",
                step=1,
                message="Придумываю эффект...",
            )

            agent = _AGENTS["create_effect"]()
            result = await agent.run(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=_emit,
                selection=None,
                block_catalog=None,
                current_html=None,
                history=history,
                previous_draft=previous_draft,
                existing_effect_ids=existing_effect_ids,
            )

            if cancel_event.is_set():
                await self._finish_cancelled(websocket, run_id)
                return

            message = result.get("message") or ""
            draft = result.get("draft")

            try:
                await CoreEngineLibWordLlmService.save_chat_message(
                    page_id=page_id,
                    role="assistant",
                    content=message,
                )
            except Exception as e:
                await self._log(
                    websocket,
                    "warning",
                    f"[ws] save assistant msg failed: {e}",
                )

            # A draft has no "final html" — store the message only.
            await CoreEngineLibWordLlmRuns.set_run_final(
                run_id,
                "",
                message=message,
            )

            if draft:
                await self._safe_send(
                    websocket,
                    {"type": "effect_draft", "draft": draft},
                )

            if message:
                await self._safe_send(
                    websocket,
                    {"type": "assistant_message", "content": message},
                )

            await self._safe_send(
                websocket,
                {"type": "done", "run_id": run_id},
            )

            print(f"[RUN-CREATE-EFFECT] run={run_id} DONE", flush=True)

        except Exception as e:
            await self._log(
                websocket,
                "error",
                f"[run-create-effect] run {run_id} crashed: {e}\n"
                f"{traceback.format_exc()}",
            )
            print(f"[RUN-CREATE-EFFECT] run={run_id} CRASHED: {e}", flush=True)
            await self._finish_error(
                websocket,
                run_id,
                f"Внутренняя ошибка: {e}",
            )

        finally:
            self._clear_cancel_event(run_id)