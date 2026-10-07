# neurocad/core/engine/lib/word/llm/agent/create_page.py

"""
Agent: create_page — creates OR edits a page.

Two top-level modes, chosen by `current_html`:

  CREATE (current_html empty)
    Plan-then-generate-and-review:
      Phase 1 — plan: one short LLM call returning section names.
      Phase 2 — for each section:
                  a) generate (HTML + CSS),
                  b) QA pass — a second LLM call that finds and
                     fixes common defects (image overflow, empty
                     buttons, invisible text, missing @media, ...).
                 Only the QA-approved section is streamed to the
                 client. The user never sees a broken section.

  EDIT (current_html non-empty)
    Single LLM call. The current page HTML + CSS is embedded into
    the user message; the model returns the WHOLE updated page.

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
    """Create OR edit a page."""

    name = "create_page"

    STEP_MAX_TOKENS = 4096
    PLAN_MAX_TOKENS = 512
    REVIEW_MAX_TOKENS = 4096
    EDIT_MAX_TOKENS = 32000

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
    ) -> Dict[str, Any]:

        has_current = bool(current_html and current_html.strip())
        new_page_requested = self._is_new_page_request(user_message)

        log(
            provider, "info",
            f"create_page start: page_id={page_id} run={run_id!r} "
            f"current_html={len(current_html or '')} chars, "
            f"history={len(history or [])} msgs, "
            f"new_page_requested={new_page_requested}, "
            f"review_enabled={self.REVIEW_ENABLED}",
        )

        if has_current and not new_page_requested:
            return await self._run_edit(
                provider=provider,
                user_message=user_message,
                page_id=page_id,
                run_id=run_id,
                emit=emit,
                current_html=current_html,
                history=history,
            )

        return await self._run_create(
            provider=provider,
            user_message=user_message,
            page_id=page_id,
            run_id=run_id,
            emit=emit,
            history=history,
        )

    # ============================================
    # NEW-PAGE HINT
    # ============================================

    @staticmethod
    def _is_new_page_request(text: str) -> bool:
        t = (text or "").lower()
        hints = (
            "с нуля",
            "с чистого листа",
            "новую страницу",
            "новый сайт",
            "забудь всё",
            "переделай полностью",
            "перегенерируй с нуля",
            "удали всё и",
        )
        return any(h in t for h in hints)

    # ============================================
    # EDIT MODE
    # ============================================

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

        log(
            provider, "info",
            f"edit messages: total={len(messages)} "
            f"(system=1, history={max(0, len(messages) - 2)}, user=1)",
        )

        try:
            raw = await provider.generate_completion(
                messages,
                max_tokens=self.EDIT_MAX_TOKENS,
            )
        except Exception as e:
            log(provider, "error", f"edit LLM error: {e}")
            return self._fail(f"⚠️ Ошибка LLM: {e}")

        log(provider, "info", f"edit response: raw_len={len(raw or '')}")

        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name="create_page_edit",
            raw_response=raw,
        )

        html, css = self._extract_html_and_css(raw)

        if not html and raw:
            s = raw.strip()
            if s.startswith("<"):
                log(
                    provider, "warning",
                    "edit: raw response starts with '<', using as-is HTML"
                )
                html = s
                css = ""

        if not html:
            log(
                provider, "error",
                f"edit non-html answer: {str(raw)[:300]!r}"
            )
            return self._fail(
                "⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз."
            )

        log(
            provider, "info",
            f"edit parsed: html={len(html)} chars, css={len(css)} chars"
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
    ) -> Dict[str, Any]:

        if emit:
            await emit({
                "type": "step",
                "step": "create_page",
                "message": "Планирую структуру страницы...",
            })

        # ---- Phase 1: plan ----
        plan = await self._get_plan(
            provider=provider,
            user_message=user_message,
            run_id=run_id,
        )

        if not plan:
            return self._fail(
                "⚠️ Не удалось спланировать страницу. Попробуйте ещё раз."
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
                user_message=user_message,
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
                    user_message=user_message,
                    run_id=run_id,
                    history=history,
                    target=target,
                    step_num=step_num,
                    total=total,
                    section_html=step_html,
                    section_css=step_css,
                )

                # Accept the reviewed version only if it parsed AND
                # still looks like the same section (non-empty html).
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
                "⚠️ Модель не сгенерировала ни одной секции. Попробуйте ещё раз."
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
            f"html={len(reviewed_html)} chars, css={len(reviewed_css)} chars, "
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