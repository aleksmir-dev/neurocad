# neurocad/core/engine/lib/word/llm/agent/create_page.py

"""
Agent: create_page — creates a page from scratch.

The agent ALWAYS creates a new page. The previous page content (if
any) is ignored — the generated page replaces the canvas entirely.
Edit mode is temporarily disabled; `_run_edit` is kept as dead code
for a future return.

Pipeline
--------
  Phase 0 — dialog (new):
             a single LLM call that looks at the chat history and
             the `brief` and decides: ask another clarifying
             question, OR stop and start generating.

             The agent asks at most ONE question per turn — the
             user answers, the next turn runs the same phase
             again. It skips questions the user has already
             answered (in the router's dialog or in the first
             message) and stops early if the user says anything
             like "вперёд" / "хватит" / "поехали".

             When the agent decides to ask, it returns
             {"question": "..."} and the dispatcher saves it
             with is_quest=1 and ends the run in
             "awaiting_answer". No HTML is produced.

  Phase 1 — plan: one short LLM call returning section names.

  Phase 2 — for each section:
             a) generate (HTML + CSS),
             b) QA pass — a second LLM call that finds and
                fixes common defects (image overflow, empty
                buttons, invisible text, missing @media, ...).
             Only the QA-approved section is streamed to the
             client. The user never sees a broken section.

Brief
-----
`brief` is a JSON dict accumulated across dialog turns. It is
stored in `Run.brief` and passed to the agent by the dispatcher.
Shape (see the Run model docstring for details):

    {
      "genre": "landing" | "longread" | "promo" | "personal" |
               "faq" | "menu" | null,
      "topic": "...",
      "audience": "...",
      "blocks": [...],
      "effects": "...",
      "texts": "...",
      "footer": "...",
      "extras": "...",
      "asked": [...],
      "ready": false
    }

The agent does NOT enforce a strict shape — it writes what the
LLM produced. The dialog phase is the only writer; the generation
phase only reads `brief["summary"]` (a free-form brief text the
dialog phase builds before setting ready=true).

Logging / dumps
---------------
Every step writes through the shared `log()` helper from
`..steps.common` and dumps prompts / responses via
`CoreEngineLibWordLlmDumper` — same pattern as fill.py, effects.py.

Namespace: CoreEngineLibWordLlmAgentCreatePage
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.create_page import (
    build_dialog_prompt,
    build_dialog_user_message,
    build_plan_prompt,
    build_plan_user_message,
    build_section_prompt,
    build_section_user_message,
    build_review_prompt,
    build_review_user_message,
    build_edit_prompt,
    build_edit_user_message,
    MAX_SECTIONS,
    MIN_SECTIONS,
)
from ..steps.common import build_messages, log
from ..dumper import CoreEngineLibWordLlmDumper


class CoreEngineLibWordLlmAgentCreatePage(CoreEngineLibWordLlmAgentBase):
    """Create a page from scratch."""

    name = "create_page"

    STEP_MAX_TOKENS = 8192
    PLAN_MAX_TOKENS = 512
    REVIEW_MAX_TOKENS = 8192
    EDIT_MAX_TOKENS = 32000
    DIALOG_MAX_TOKENS = 512

    #: Whether to run the QA pass after each generated section.
    #: Set to False to save tokens / time at the cost of possible
    #: layout bugs in the streamed result.
    REVIEW_ENABLED = True

    # ============================================
    # ENTRY POINT
    # ============================================

    async def run(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit=None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
        brief: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:

        log(
            provider, "info",
            f"create_page start: page_id={page_id} "
            f"run={run_id!r} "
            f"current_html={len(current_html or '')} chars (ignored), "
            f"history={len(history or [])} msgs, "
            f"brief_keys={list((brief or {}).keys())}, "
            f"review_enabled={self.REVIEW_ENABLED}",
        )

        # ---- Phase 0: dialog ----
        # The dialog phase decides whether we need to ask another
        # question or start generating. It also updates `brief`
        # (in-place, returned as dict).
        dialog_result = await self._run_dialog(
            provider=provider,
            user_message=user_message,
            run_id=run_id,
            history=history,
            brief=brief,
            emit=emit,
        )

        # The dialog phase returned a question — we are done for
        # this turn. The dispatcher saves it, sets the run to
        # awaiting_answer and ends.
        if dialog_result.get("question"):
            return {
                "message": "",
                "html": None,
                "css": None,
                "selector": None,
                "element_html": None,
                "question": dialog_result["question"],
                "streamed": True,
            }

        # The dialog phase is ready to generate. It returned an
        # updated brief (see _run_dialog).
        updated_brief = dialog_result.get("brief") or {}
        brief_summary = dialog_result.get("brief_summary") or ""

        # ---- Phase 1+2: create ----
        return await self._run_create(
            provider=provider,
            user_message=user_message,
            page_id=page_id,
            run_id=run_id,
            emit=emit,
            history=history,
            brief_summary=brief_summary,
        )

    # ============================================
    # PHASE 0 — DIALOG
    # ============================================

    async def _run_dialog(
        self,
        *,
        provider,
        user_message: str,
        run_id: Any,
        history: Optional[list],
        brief: Optional[Dict[str, Any]],
        emit,
    ) -> Dict[str, Any]:
        """
        Ask the user a clarifying question, or decide that the
        brief is ready.

        Returns ONE of:

            {"question": "<text>", "brief": <updated brief>}
                — ask the user; the dispatcher saves the question
                  with is_quest=1. `brief` is the updated dict
                  (usually with the just-asked field marked as
                  "asked" so we do not ask it again).

            {"brief": <updated brief>, "brief_summary": "<text>"}
                — brief is ready; the caller starts generation.
                  `brief_summary` is a short free-form summary
                  used as the user message in the generation
                  phase (it combines the original request with
                  the user's answers).

        The dialog prompt is intentionally permissive: the model
        skips questions the user already answered and stops as
        soon as it has enough info, or when the user says
        anything like "вперёд" / "хватит" / "поехали".
        """
        if emit:
            await emit({
                "type": "step",
                "step": "create_page_dialog",
                "message": "Уточняю задачу...",
            })

        system_prompt = build_dialog_prompt()
        user_content = build_dialog_user_message(
            user_message=user_message,
            history=history,
        )

        log(
            provider, "info",
            f"dialog: system={len(system_prompt)} chars, "
            f"user={len(user_content)} chars, "
            f"history={len(history or [])}, "
            f"max_tokens={self.DIALOG_MAX_TOKENS}",
        )

        messages = build_messages(system_prompt, user_content, history)

        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name="create_page_dialog",
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.DIALOG_MAX_TOKENS,
            )
        except Exception as e:
            log(provider, "error", f"dialog LLM error: {e}")
            # On dialog error — do not block the user. Skip
            # straight to generation with whatever we have.
            return {
                "brief": brief or {},
                "brief_summary": user_message,
            }

        log(provider, "info", f"dialog response: raw_len={len(raw or '')}")

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name="create_page_dialog",
            raw_response=raw,
        )

        data = self._parse_dialog_response(raw)

        # ---- parse failed → skip dialog, generate ----
        if data is None:
            log(provider, "warning",
                f"dialog unparsable: {str(raw)[:200]!r}")
            return {
                "brief": brief or {},
                "brief_summary": user_message,
            }

        # ---- explicit "ready" ----
        if data.get("ready") is True:
            return {
                "brief": brief or {},
                "brief_summary": self._build_brief_summary(
                    brief=brief,
                    user_message=user_message,
                    history=history,
                ),
            }

        # ---- question ----
        question = str(data.get("question", "")).strip()
        if not question:
            # Empty question + no ready flag → treat as ready,
            # do not leave the user hanging.
            log(provider, "warning",
                "dialog returned empty question, treating as ready")
            return {
                "brief": brief or {},
                "brief_summary": user_message,
            }

        return {
            "question": question,
            "brief": brief or {},
        }

    @staticmethod
    def _parse_dialog_response(text: str) -> Optional[Dict[str, Any]]:
        """
        Parse the dialog response.

        Expected: {"question": "..."} or {"ready": true}.
        Tolerates code fences and surrounding prose.

        If the response is NOT valid JSON but looks like a plain
        question (ends with "?"), treat it as {"question": <text>}.
        This happens when the model ignores the "JSON only" rule
        and answers with a bare question string.
        """
        if not text:
            return None

        s = text.strip()

        # Strip code fences.
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # ---- Try strict JSON ----
        data = CoreEngineLibWordLlmAgentCreatePage._try_json(s)
        if isinstance(data, dict):
            return data

        # ---- Try JSON inside prose ----
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            data = CoreEngineLibWordLlmAgentCreatePage._try_json(
                s[start:end + 1]
            )
            if isinstance(data, dict):
                return data

        # ---- Fallback: bare question text ----
        # The model ignored the JSON format and answered with a plain
        # question. Treat a text that ends with "?" as a question.
        if s.endswith("?") and len(s) < 500:
            return {"question": s}

        return None

    @staticmethod
    def _build_brief_summary(
        *,
        brief: Optional[Dict[str, Any]],
        user_message: str,
        history: Optional[list],
    ) -> str:
        """
        Build the user message for the generation phase.

        The generator works best with a single, self-contained
        description. We combine:
          - the user's own words (the last message, and — if
            short — the first message too);
          - a compact dump of the brief.

        The result is a plain text block fed to the plan and
        section prompts. Nothing fancy — the generator is a
        language model, it can read the raw dump.
        """
        parts: List[str] = []

        # First user message in history (if any) — usually the
        # original request.
        if history:
            for m in history:
                if m.get("role") == "user":
                    first = (m.get("content") or "").strip()
                    if first:
                        parts.append(first)
                    break

        # Current user message — if different from the first.
        last = (user_message or "").strip()
        if last and (not parts or last != parts[0]):
            parts.append(last)

        # The brief itself, if non-empty.
        if brief:
            try:
                brief_json = json.dumps(
                    brief, ensure_ascii=False, indent=2
                )
            except (TypeError, ValueError):
                brief_json = str(brief)
            parts.append("Собранный бриф:\n" + brief_json)

        return "\n\n".join(parts) if parts else (user_message or "")

    # ============================================
    # EDIT MODE — DISABLED
    # ============================================
    #
    # Kept as dead code so it can be re-enabled later by restoring
    # the create/edit branch in run(). Not called from anywhere
    # right now.

    async def _run_edit(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit,
        current_html: str,
        history: Optional[list],
    ) -> Dict[str, Any]:

        if emit:
            await emit({
                "type": "step",
                "step": "edit_page",
                "message": "Обновляю страницу...",
            })

        current_css = await self._load_current_page_css()

        system_prompt = build_edit_prompt()
        user_content = build_edit_user_message(
            user_request=user_message,
            current_html=current_html,
            current_css=current_css,
        )

        log(
            provider, "info",
            f"edit request: system={len(system_prompt)} chars, "
            f"user={len(user_content)} chars "
            f"(html={len(current_html)}, css={len(current_css)}), "
            f"max_tokens={self.EDIT_MAX_TOKENS}",
        )

        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name="create_page_edit",
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        messages = build_messages(system_prompt, user_content, history)

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.EDIT_MAX_TOKENS,
            )
        except Exception as e:
            log(provider, "error", f"edit LLM error: {e}")
            return self._fail(f"⚠️ Ошибка LLM: {e}")

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name="create_page_edit",
            raw_response=raw,
        )

        html, css = self._extract_html_and_css(raw)

        if not html and raw:
            s = raw.strip()
            if s.startswith("<"):
                html = s
                css = ""

        if not html:
            return self._fail(
                "⚠️ Модель вернула некорректный ответ. "
                "Попробуйте ещё раз."
            )

        html = self._ensure_scope(html)

        return {
            "message": "Страница обновлена.",
            "html": html,
            "css": css,
            "selector": None,
            "element_html": None,
            "streamed": False,
        }

    # ============================================
    # CREATE MODE (generate + review per section)
    # ============================================

    async def _run_create(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit,
        history: Optional[list],
        brief_summary: str = "",
    ) -> Dict[str, Any]:

        # The generation phase uses `brief_summary` if present —
        # that is the combined request + answers. Fall back to
        # the raw user message if there is no brief.
        generation_message = brief_summary or user_message

        if emit:
            await emit({
                "type": "step",
                "step": "create_page",
                "message": "Планирую структуру страницы...",
            })

        # ---- Phase 1: plan ----
        plan = await self._get_plan(
            provider=provider,
            user_message=generation_message,
            run_id=run_id,
        )

        if not plan:
            return self._fail(
                "⚠️ Не удалось спланировать страницу. "
                "Попробуйте ещё раз."
            )

        if emit:
            await emit({
                "type": "step",
                "step": "create_page_plan",
                "message": "План: " + ", ".join(plan),
            })

        # ---- Phase 2: generate + review each section ----
        total = len(plan)
        html_chunks: List[str] = []
        css_chunks: List[str] = []
        sections_done: List[str] = []

        for i, target in enumerate(plan):
            step_num = i + 1
            sections_remaining = plan[i + 1:]

            # ---- 2a. generate ----
            if emit:
                await emit({
                    "type": "step",
                    "step": f"create_page_{step_num}",
                    "message": (
                        f"Шаг {step_num} из {total}: "
                        f"генерирую секцию «{target}»..."
                    ),
                })

            step_html, step_css = await self._generate_section(
                provider=provider,
                user_message=generation_message,
                run_id=run_id,
                history=history,
                target=target,
                step_num=step_num,
                total=total,
                sections_done=sections_done,
                sections_remaining=sections_remaining,
            )

            if not step_html:
                log(
                    provider, "warning",
                    f"step {step_num} '{target}' empty after generate"
                )
                continue

            # ---- 2b. QA review ----
            if self.REVIEW_ENABLED:
                if emit:
                    await emit({
                        "type": "step",
                        "step": f"create_page_review_{step_num}",
                        "message": (
                            f"Шаг {step_num} из {total}: "
                            f"проверяю секцию «{target}»..."
                        ),
                    })

                reviewed_html, reviewed_css = await self._review_section(
                    provider=provider,
                    user_message=generation_message,
                    run_id=run_id,
                    history=history,
                    target=target,
                    step_num=step_num,
                    total=total,
                    section_html=step_html,
                    section_css=step_css,
                )

                if reviewed_html:
                    step_html = reviewed_html
                    if reviewed_css:
                        step_css = reviewed_css
                else:
                    log(
                        provider, "warning",
                        f"step {step_num} '{target}' review failed, "
                        f"keeping original"
                    )

            # ---- accumulate + emit ----
            sections_done.append(target)
            html_chunks.append(step_html)
            if step_css:
                css_chunks.append(step_css)

            is_last = (step_num == total)

            if emit:
                await emit({
                    "type": "page_step",
                    "step": step_num,
                    "total_hint": total,
                    "section_name": target,
                    "html": step_html,
                    "css": step_css,
                    "done": is_last,
                })

        # ---- aggregate ----
        full_html = "\n".join(h for h in html_chunks if h).strip()
        full_css = self._dedupe_imports(
            "\n\n".join(c for c in css_chunks if c).strip()
        )

        if not full_html:
            log(provider, "error", "no sections produced")
            return self._fail(
                "⚠️ Модель не сгенерировала ни одной секции. "
                "Попробуйте ещё раз."
            )

        full_html = self._ensure_scope(full_html)

        log(
            provider, "info",
            f"create done: {len(sections_done)} sections, "
            f"html={len(full_html)} chars, css={len(full_css)} chars"
        )

        return {
            "message": (
                f"Страница собрана: {len(sections_done)} "
                f"{self._plural_sections(len(sections_done))}."
            ),
            "html": full_html,
            "css": full_css,
            "selector": None,
            "element_html": None,
            "streamed": True,
        }

    # ============================================
    # GENERATE ONE SECTION
    # ============================================

    async def _generate_section(
        self,
        *,
        provider,
        user_message: str,
        run_id: Any,
        history: Optional[list],
        target: str,
        step_num: int,
        total: int,
        sections_done: List[str],
        sections_remaining: List[str],
    ) -> Tuple[str, str]:

        system_prompt = build_section_prompt(
            target_section=target,
            sections_done=sections_done,
            sections_remaining=sections_remaining,
        )
        user_content = build_section_user_message(user_message)

        log(
            provider, "info",
            f"step {step_num}/{total} '{target}' generate: "
            f"system={len(system_prompt)} chars, "
            f"max_tokens={self.STEP_MAX_TOKENS}",
        )

        messages = build_messages(system_prompt, user_content, history)

        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name=f"create_page_section_{step_num}_{target}",
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.STEP_MAX_TOKENS,
            )
        except Exception as e:
            log(
                provider, "error",
                f"step {step_num} '{target}' LLM error: {e}"
            )
            return ("", "")

        log(
            provider, "info",
            f"step {step_num}/{total} '{target}' response: "
            f"raw_len={len(raw or '')}"
        )

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name=f"create_page_section_{step_num}_{target}",
            raw_response=raw,
        )

        parsed = self._extract_step(raw)
        step_html = ""
        step_css = ""

        if parsed is not None:
            step_html = (parsed.get("html") or "").strip()
            step_css = (parsed.get("css") or "").strip()

        if not step_html:
            legacy_html, legacy_css = self._extract_html_and_css(raw)
            if legacy_html:
                step_html = legacy_html
                step_css = legacy_css or ""

        if not step_html:
            log(
                provider, "warning",
                f"step {step_num} '{target}' unparsable: "
                f"{str(raw)[:200]!r}"
            )
            return ("", "")

        log(
            provider, "info",
            f"step {step_num}/{total} '{target}' parsed: "
            f"html={len(step_html)} chars, css={len(step_css)} chars"
        )

        return (step_html, step_css)

    # ============================================
    # REVIEW ONE SECTION
    # ============================================

    async def _review_section(
        self,
        *,
        provider,
        user_message: str,
        run_id: Any,
        history: Optional[list],
        target: str,
        step_num: int,
        total: int,
        section_html: str,
        section_css: str,
    ) -> Tuple[str, str]:
        """
        QA pass over ONE generated section.

        Returns (html, css) with fixes applied, or ("", "") if the
        review failed (in which case the caller keeps the original).
        """
        system_prompt = build_review_prompt(target)
        user_content = build_review_user_message(
            target_section=target,
            section_html=section_html,
            section_css=section_css,
            user_request=user_message,
        )

        log(
            provider, "info",
            f"step {step_num}/{total} '{target}' review: "
            f"system={len(system_prompt)} chars, "
            f"user={len(user_content)} chars, "
            f"max_tokens={self.REVIEW_MAX_TOKENS}",
        )

        messages = build_messages(system_prompt, user_content, history)

        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name=f"create_page_review_{step_num}_{target}",
            system_prompt=system_prompt,
            user_content=user_content,
            history=history,
        )

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.REVIEW_MAX_TOKENS,
            )
        except Exception as e:
            log(
                provider, "error",
                f"step {step_num} '{target}' review LLM error: {e}"
            )
            return ("", "")

        log(
            provider, "info",
            f"step {step_num}/{target} review response: "
            f"raw_len={len(raw or '')}"
        )

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name=f"create_page_review_{step_num}_{target}",
            raw_response=raw,
        )

        parsed = self._extract_step(raw)
        if parsed is None:
            log(
                provider, "warning",
                f"step {step_num} '{target}' review unparsable: "
                f"{str(raw)[:200]!r}"
            )
            return ("", "")

        reviewed_html = (parsed.get("html") or "").strip()
        reviewed_css = (parsed.get("css") or "").strip()

        if not reviewed_html:
            log(
                provider, "warning",
                f"step {step_num} '{target}' review empty html"
            )
            return ("", "")

        fixed = parsed.get("fixed") or []
        notes = parsed.get("notes") or ""

        log(
            provider, "info",
            f"step {step_num}/{target} review done: "
            f"html={len(reviewed_html)} chars, "
            f"css={len(reviewed_css)} chars, "
            f"fixed={fixed!r}, notes={notes!r}"
        )

        return (reviewed_html, reviewed_css)

    # ============================================
    # LOAD CURRENT CSS
    # ============================================

    @staticmethod
    async def _load_current_page_css() -> str:
        return ""

    # ============================================
    # PHASE 1 — PLAN
    # ============================================

    async def _get_plan(
        self,
        *,
        provider,
        user_message: str,
        run_id: Any,
    ) -> Optional[List[str]]:
        system_prompt = build_plan_prompt()
        user_content = build_plan_user_message(user_message)

        log(
            provider, "info",
            f"plan request: system={len(system_prompt)} chars, "
            f"user={len(user_content)} chars, "
            f"max_tokens={self.PLAN_MAX_TOKENS}",
        )

        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name="create_page_plan",
            system_prompt=system_prompt,
            user_content=user_content,
            history=None,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.PLAN_MAX_TOKENS,
            )
        except Exception as e:
            log(provider, "error", f"plan LLM error: {e}")
            return None

        log(provider, "info", f"plan response: raw_len={len(raw or '')}")

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name="create_page_plan",
            raw_response=raw,
        )

        plan = self._parse_plan(raw)
        if not plan:
            log(
                provider, "warning",
                f"plan parse failed: {str(raw)[:200]!r}"
            )
            return None

        log(provider, "info", f"plan parsed: {plan}")
        return plan

    @staticmethod
    def _parse_plan(text: str) -> Optional[List[str]]:
        if not text:
            return None

        s = text.strip()

        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        data = None

        try:
            data = json.loads(s)
        except Exception:
            pass

        if data is None:
            start = s.find("{")
            end = s.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    data = json.loads(s[start:end + 1])
                except Exception:
                    data = None

        if not isinstance(data, dict):
            return None

        raw_sections = data.get("sections") or []
        if not isinstance(raw_sections, list):
            return None

        name_re = re.compile(r"^[a-z][a-z0-9_]{1,40}$")
        cleaned: List[str] = []
        seen: set = set()

        for item in raw_sections:
            if not isinstance(item, str):
                continue
            name = item.strip().lower()
            name = re.sub(r"[\s\-]+", "_", name)
            if not name_re.match(name):
                continue
            if name in seen:
                continue
            seen.add(name)
            cleaned.append(name)

        if len(cleaned) < MIN_SECTIONS:
            return None

        return cleaned[:MAX_SECTIONS]

    # ============================================
    # STEP PARSING
    # ============================================

    @staticmethod
    def _extract_step(text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None

        s = text.strip()

        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        data = CoreEngineLibWordLlmAgentCreatePage._try_json(s)
        if isinstance(data, dict) and "html" in data:
            return data

        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            chunk = s[start:end + 1]
            data = CoreEngineLibWordLlmAgentCreatePage._try_json(chunk)
            if isinstance(data, dict) and "html" in data:
                return data

        return None

    @staticmethod
    def _try_json(s: str) -> Optional[Any]:
        try:
            return json.loads(s)
        except Exception:
            return None

    # ============================================
    # LEGACY PARSING
    # ============================================

    @staticmethod
    def _extract_html_and_css(text: str) -> tuple[str, str]:
        if not text:
            return "", ""

        s = text.strip()

        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        try:
            data = json.loads(s)
            if isinstance(data, dict):
                html = data.get("html") or ""
                css = data.get("css") or ""
                if isinstance(html, str) and html.strip():
                    return html.strip(), (css or "").strip()
        except Exception:
            pass

        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            head = s[start:start + 60]
            if '"html"' in head or '"html"' in s[start:end + 1][:200]:
                try:
                    data = json.loads(s[start:end + 1])
                    if isinstance(data, dict):
                        html = data.get("html") or ""
                        css = data.get("css") or ""
                        if isinstance(html, str) and html.strip():
                            return html.strip(), (css or "").strip()
                except Exception:
                    pass

        style_re = re.compile(
            r"<style\b[^>]*>(.*?)</style>",
            re.DOTALL | re.IGNORECASE,
        )
        css_chunks = [m.group(1).strip() for m in style_re.finditer(s)]
        css = "\n\n".join(c for c in css_chunks if c)
        html = style_re.sub("", s).strip()

        if html.startswith("<") and ">" in html:
            return html, css

        return "", ""

    # ============================================
    # POST-PROCESSING
    # ============================================

    @staticmethod
    def _dedupe_imports(css: str) -> str:
        if not css:
            return css

        seen: set = set()
        out_lines: List[str] = []

        for line in css.splitlines():
            stripped = line.strip()
            if stripped.startswith("@import"):
                if stripped in seen:
                    continue
                seen.add(stripped)
            out_lines.append(line)

        return "\n".join(out_lines)

    @staticmethod
    def _ensure_scope(html: str) -> str:
        if not html:
            return html
        if "core-engine-lib-word-blocks" in html[:2000]:
            return html

        return (
            '<div class="core-engine-lib-word-blocks">\n'
            f'{html}\n'
            '</div>'
        )

    # ============================================
    # ERROR SHAPE
    # ============================================

    @staticmethod
    def _fail(message: str) -> Dict[str, Any]:
        return {
            "message": message,
            "html": None,
            "css": None,
            "selector": None,
            "element_html": None,
            "question": None,
            "streamed": True,
        }

    # ============================================
    # SMALL HELPERS
    # ============================================

    @staticmethod
    def _plural_sections(n: int) -> str:
        n10 = n % 10
        n100 = n % 100
        if n10 == 1 and n100 != 11:
            return "секция"
        if 2 <= n10 <= 4 and not (12 <= n100 <= 14):
            return "секции"
        return "секций"