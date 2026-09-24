# neurocad/core/engine/lib/word/llm/step.py

"""
Multi-step LLM flow: plan → fill → effects.

Namespace: CoreEngineLibWordLlmStep

Each step is an async generator that yields progress events and, in
the end, yields a final result. The caller (an agent in agent/) consumes
the events and forwards them to the client.

Generator protocol
------------------
Every yield is a dict with a "type" field:

  Progress events (intermediate, may repeat):
    {"type": "step",          "step": "planning", "message": "..."}
    {"type": "plan",          "blocks": [...]}
    {"type": "step",          "step": "filling",  "message": "..."}
    {"type": "fill_progress", "request": 1, "total": 3, "block_ids": [...]}
    {"type": "step",          "step": "effects",  "message": "..."}

  Final event (exactly one at the end):
    {"type": "result", "html": "...", "message": "..."}

On error:
    {"type": "error", "message": "..."}

Agent name
----------
Every step accepts `agent_name` — the name of the calling agent. It is
used by the dumper to prefix the dumped files with the agent name.

Dialogue history
----------------
Every step accepts an optional `history` — a list of previous
{"role": "user"|"assistant", "content": "..."} messages. They are
inserted between the system prompt and the current user message, so
the model sees the full conversation, not just the last turn.

This file does not touch the database. It only talks to the LLM
provider and yields events.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from .prompt import CoreEngineLibWordLlmPrompt
from .dumper import CoreEngineLibWordLlmDumper

logger = logging.getLogger(__name__)


class CoreEngineLibWordLlmStep:
    """Static multi-step LLM flow."""

    # ============================================
    # CONFIG
    # ============================================

    #: Default max HTML size (bytes) per fill request.
    DEFAULT_CHUNK_LIMIT = 15_000

    #: When the model reports "remaining" non-empty, shrink the limit
    #: for the next attempt.
    CHUNK_LIMIT_SHRINK = 0.7

    #: Max number of fill attempts to avoid infinite loops.
    MAX_FILL_ATTEMPTS = 10

    #: Max chars of prompt/response shown in logs.
    LOG_PREVIEW = 2000

    # ============================================
    # LOGGING HELPERS
    # ============================================

    @staticmethod
    def _dump(prefix: str, text: str, limit: int = None) -> None:
        """Print a labelled preview of a (possibly long) string."""
        if limit is None:
            limit = CoreEngineLibWordLlmStep.LOG_PREVIEW
        if text is None:
            print(f"{prefix} <None>", flush=True)
            return
        n = len(text)
        shown = text if n <= limit else text[:limit] + f"\n... [+{n - limit} chars]"
        print(f"{prefix} ({n} chars)", flush=True)
        print(shown, flush=True)

    @staticmethod
    def _dump_messages(prefix: str, messages: List[Dict[str, str]]) -> None:
        """Print a summary of the messages array sent to the LLM."""
        print(f"{prefix} messages: {len(messages)}", flush=True)
        for i, m in enumerate(messages):
            role = m.get("role", "?")
            content = m.get("content", "")
            print(f"  #{i} role={role}, len={len(content)}", flush=True)

    # ============================================
    # MESSAGES BUILDER
    # ============================================

    @staticmethod
    def _build_messages(
        system_prompt: str,
        user_content: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        """
        Build the messages array for the LLM.

        Order:
          - system prompt
          - previous dialogue turns (if any)
          - current user message
        """
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})

        messages.append({"role": "user", "content": user_content})
        return messages

    # ============================================
    # STEP 1 — PLAN
    # ============================================

    @staticmethod
    async def step_plan(
        user_message: str,
        block_catalog: List[Dict[str, Any]],
        provider,
        history: Optional[List[Dict[str, str]]] = None,
        run_id: Any = None,
        agent_name: str = "create",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Step 1: choose which blocks to use and in what order.
        """
        print("\n" + "=" * 70, flush=True)
        print("[STEP-PLAN] START", flush=True)
        print(f"[STEP-PLAN] agent: {agent_name}", flush=True)
        print(f"[STEP-PLAN] run_id: {run_id!r}", flush=True)
        print(f"[STEP-PLAN] user_message: {user_message!r}", flush=True)
        print(f"[STEP-PLAN] catalog: {len(block_catalog)} blocks", flush=True)
        print(f"[STEP-PLAN] history: {len(history) if history else 0} messages", flush=True)
        print("=" * 70, flush=True)

        yield {
            "type": "step",
            "step": "planning",
            "message": "Выбираю подходящие блоки...",
        }

        system_prompt = CoreEngineLibWordLlmPrompt.build_plan_prompt(block_catalog)
        user_content = f"Запрос: {user_message}"
        messages = CoreEngineLibWordLlmStep._build_messages(
            system_prompt, user_content, history
        )

        # ---- dump full prompt ----
        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name=agent_name,
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            logger.error(f"[step_plan] LLM error: {e}")
            yield {"type": "error", "message": f"LLM error: {e}"}
            return

        # ---- dump response ----
        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name=agent_name,
            raw_response=raw,
        )

        plan = CoreEngineLibWordLlmStep._parse_plan(raw)
        if not plan:
            yield {"type": "error", "message": "Не удалось разобрать план блоков."}
            return

        yield {"type": "plan", "blocks": plan}
        yield {"type": "result", "plan": plan}

    # ============================================
    # STEP 2 — FILL
    # ============================================

    @staticmethod
    async def step_fill(
        user_message: str,
        plan: List[Dict[str, Any]],
        block_catalog: List[Dict[str, Any]],
        provider,
        history: Optional[List[Dict[str, str]]] = None,
        chunk_limit: Optional[int] = None,
        run_id: Any = None,
        agent_name: str = "create",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Step 2: fill the chosen blocks with text, alts, links.
        """
        if chunk_limit is None:
            chunk_limit = CoreEngineLibWordLlmStep.DEFAULT_CHUNK_LIMIT

        print("\n" + "=" * 70, flush=True)
        print("[STEP-FILL] START", flush=True)
        print(f"[STEP-FILL] agent: {agent_name}", flush=True)
        print(f"[STEP-FILL] run_id: {run_id!r}", flush=True)
        print(f"[STEP-FILL] plan: {len(plan)} blocks", flush=True)
        print(f"[STEP-FILL] catalog: {len(block_catalog)} blocks", flush=True)
        print("=" * 70, flush=True)

        yield {
            "type": "step",
            "step": "filling",
            "message": "Заполняю текстом...",
        }

        html_by_id: Dict[str, str] = {
            b["id"]: b.get("html", "") for b in block_catalog
        }

        ordered_ids = [p["block_id"] for p in plan]
        if not ordered_ids:
            yield {"type": "result", "filled": {}}
            return

        filled: Dict[str, str] = {}
        remaining = list(ordered_ids)
        current_limit = chunk_limit
        attempts = 0

        while remaining and attempts < CoreEngineLibWordLlmStep.MAX_FILL_ATTEMPTS:
            attempts += 1

            chunks = CoreEngineLibWordLlmStep._split_into_chunks(
                remaining, html_by_id, current_limit
            )
            total = len(chunks)

            for i, chunk in enumerate(chunks, start=1):
                yield {
                    "type": "fill_progress",
                    "request": i,
                    "total": total,
                    "block_ids": chunk,
                }

                chunk_payload = [
                    {"block_id": bid, "html": html_by_id.get(bid, "")}
                    for bid in chunk
                ]
                system_prompt = CoreEngineLibWordLlmPrompt.build_fill_prompt()
                user_content = CoreEngineLibWordLlmPrompt.build_fill_user_message(
                    user_message, chunk_payload
                )

                messages = CoreEngineLibWordLlmStep._build_messages(
                    system_prompt, user_content, history
                )

                # ---- dump prompt ----
                CoreEngineLibWordLlmDumper.dump_step(
                    run_id=run_id,
                    agent_name=agent_name,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    history=history,
                    chunk_index=i,
                )

                try:
                    raw = await provider.generate_completion(messages)
                except Exception as e:
                    logger.error(f"[step_fill] LLM error: {e}")
                    yield {"type": "error", "message": f"LLM error: {e}"}
                    return

                # ---- dump response ----
                CoreEngineLibWordLlmDumper.dump_response(
                    run_id=run_id,
                    agent_name=agent_name,
                    raw_response=raw,
                    chunk_index=i,
                )

                parsed = CoreEngineLibWordLlmStep._parse_fill(raw)
                for item in parsed.get("filled", []):
                    bid = item.get("block_id")
                    html = item.get("html", "")
                    if bid and html:
                        filled[bid] = html

            new_remaining = [bid for bid in ordered_ids if bid not in filled]
            if new_remaining == remaining:
                current_limit = int(
                    current_limit * CoreEngineLibWordLlmStep.CHUNK_LIMIT_SHRINK
                )
                if current_limit < 500:
                    logger.error("[step_fill] chunk limit too small, giving up")
                    break
            remaining = new_remaining

        yield {"type": "result", "filled": filled}

    # ============================================
    # STEP 3 — EFFECTS
    # ============================================

    @staticmethod
    async def step_effects(
        user_message: str,
        assembled_html: str,
        provider,
        history: Optional[List[Dict[str, str]]] = None,
        run_id: Any = None,
        agent_name: str = "create",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Step 3: add <style> blocks with animations, gradients, etc.
        """
        print("\n" + "=" * 70, flush=True)
        print("[STEP-EFFECTS] START", flush=True)
        print(f"[STEP-EFFECTS] agent: {agent_name}", flush=True)
        print(f"[STEP-EFFECTS] run_id: {run_id!r}", flush=True)
        print(f"[STEP-EFFECTS] assembled_html: {len(assembled_html)} chars", flush=True)
        print("=" * 70, flush=True)

        yield {
            "type": "step",
            "step": "effects",
            "message": "Добавляю эффекты...",
        }

        system_prompt = CoreEngineLibWordLlmPrompt.build_effects_prompt()
        user_content = f"Запрос: {user_message}\n\nHTML:\n{assembled_html}"

        messages = CoreEngineLibWordLlmStep._build_messages(
            system_prompt, user_content, history
        )

        # ---- dump prompt ----
        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name=agent_name,
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            logger.error(f"[step_effects] LLM error: {e}")
            yield {"type": "result", "html": assembled_html}
            return

        # ---- dump response ----
        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name=agent_name,
            raw_response=raw,
        )

        parsed = CoreEngineLibWordLlmStep._parse_effects(raw)
        html = parsed.get("html") or assembled_html

        yield {"type": "result", "html": html}

    # ============================================
    # CHUNKING
    # ============================================

    @staticmethod
    def _split_into_chunks(
        ordered_ids: List[str],
        html_by_id: Dict[str, str],
        limit: int,
    ) -> List[List[str]]:
        chunks: List[List[str]] = []
        current: List[str] = []
        current_size = 0

        for bid in ordered_ids:
            size = len(html_by_id.get(bid, ""))

            if size > limit:
                if current:
                    chunks.append(current)
                    current = []
                    current_size = 0
                chunks.append([bid])
                continue

            if current and current_size + size > limit:
                chunks.append(current)
                current = []
                current_size = 0

            current.append(bid)
            current_size += size

        if current:
            chunks.append(current)

        return chunks

    # ============================================
    # RESPONSE PARSERS
    # ============================================

    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        if not text:
            return None

        s = text.strip()
        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]
            s = s.strip()

        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        start = s.find('{')
        end = s.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(s[start:end + 1])
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

        return None

    @staticmethod
    def _parse_plan(text: str) -> List[Dict[str, Any]]:
        data = CoreEngineLibWordLlmStep._extract_json(text)
        if not data:
            return []

        raw_plan = data.get("plan") or []
        result: List[Dict[str, Any]] = []
        for item in raw_plan:
            if not isinstance(item, dict):
                continue
            bid = item.get("block_id")
            if not bid:
                continue
            result.append({
                "block_id": str(bid),
                "purpose": str(item.get("purpose", "")).strip(),
            })
        return result

    @staticmethod
    def _parse_fill(text: str) -> Dict[str, Any]:
        data = CoreEngineLibWordLlmStep._extract_json(text)
        if not data:
            return {"filled": [], "remaining": []}

        filled_raw = data.get("filled") or []
        remaining_raw = data.get("remaining") or []

        filled: List[Dict[str, str]] = []
        for item in filled_raw:
            if not isinstance(item, dict):
                continue
            bid = item.get("block_id")
            html = item.get("html", "")
            if bid:
                filled.append({"block_id": str(bid), "html": str(html)})

        remaining = [str(x) for x in remaining_raw if x]
        return {"filled": filled, "remaining": remaining}

    @staticmethod
    def _parse_effects(text: str) -> Dict[str, str]:
        data = CoreEngineLibWordLlmStep._extract_json(text)
        if not data:
            return {"html": text.strip()}

        html = data.get("html", "")
        if not isinstance(html, str):
            html = ""
        return {"html": html.strip()}