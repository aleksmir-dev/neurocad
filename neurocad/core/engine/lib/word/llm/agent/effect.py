# neurocad/core/engine/lib/word/llm/agent/effect.py

"""
Agent: effect.

Add visual effects to ONE selected element on the canvas: backgrounds,
gradients, animations, shadows, hover states. Any visual change that
lives in a <style> block goes here — static background and animation
alike.

The selected element is whatever the user clicked in the editor — a
whole block (<section>) or any inner node (<div>, <h1>, <a>, ...).

Returns:
    {
        "selector":     "sel-abc12345",   # the marker from selection
        "element_html": "<section ...>...</section><style>...</style>",
        "message":      "Эффект добавлен.",
    }

The client replaces the element with `data-selected-id="sel-abc12345"`
by the new HTML.

Intermediate events: a single `step` event is emitted at the start
("Добавляю эффекты..."), then the LLM answer is returned via the
standard result shape.

Safety:
  If the model returns something that does not look like HTML (an error
  message, an explanation, an empty string, a bare JSON object without
  the "html" field), the agent returns selector=None and element_html=None.
  The client will then skip the update entirely, so the page is not
  damaged by a bad response.
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase


class CoreEngineLibWordLlmAgentEffect(CoreEngineLibWordLlmAgentBase):
    """Add visual effects to one selected element."""

    name = "effect"

    SYSTEM_PROMPT = """Ты — дизайнер для CMS NeuroCad.

Тебе дают ОДИН HTML-элемент (это может быть секция, div, заголовок,
кнопка — любой узел) и запрос пользователя.
Ты добавляешь к нему визуальные эффекты.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "selector": "sel-abc12345",
  "html": "<section ...>...</section>\\n<style>.effect-xxxx { ... }</style>"
}

ПРАВИЛА:
1. НЕ меняй структуру HTML и классы. Только добавляй эффекты.
2. Корневой тег и все его атрибуты — СОХРАНИ как есть, включая
   `data-selected-id`.
3. Для эффектов используй <style>-блок:
   - сгенерируй уникальный префикс, например effect-a3f7;
   - добавь его как класс к корневому элементу;
   - в конце блока вставь <style>, каждое правило начинается
     с этого префикса.
4. Внутри <style> используй var(--theme-*) для цветов.
5. Можно: @keyframes, linear-gradient, radial-gradient, conic-gradient,
   transform, box-shadow, transition, filter, backdrop-filter, mask.
6. Не добавляй inline-стили (style="...").
7. Поле "selector" — ровно то, что было во входе.
8. Поле "html" — ТОЛЬКО HTML этого элемента + <style>.
9. Не добавляй пояснения до или после JSON.
10. Не оборачивай в markdown.

ГЛАВНОЕ ПРАВИЛО — ДЕЛАЙ РОВНО ТО, ЧТО ПРОСЯТ:
11. Не расширяй задачу. «Закрась жёлтым» = ОДНО правило
    background-color: <жёлтый>. НЕ градиент, НЕ анимация,
    НЕ ::before, НЕ box-shadow, НЕ hover.
12. «Сделай градиент» = linear-gradient или radial-gradient,
    и точка. Без анимации, без свечения.
13. «Добавь анимацию» = @keyframes + animation. Без смены фона,
    без hover.
14. Если пользователь не сказал «сделай красиво», «добавь эффектов»,
    «укрась» — НЕ добавляй больше ОДНОГО визуального приёма.
15. Простой цвет — это background-color: #xxxxxx.
    НЕ background-image. НЕ градиент.
16. Если не уверен — сделай минимальный вариант.
"""

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

        # ---- emit: step at the start ----
        if emit:
            await emit({
                "type": "step",
                "step": "effect",
                "message": "Добавляю эффекты...",
            })

        selection = selection or {}
        selector = selection.get("selector")
        target_html = selection.get("outer_html")

        if not selector or not target_html:
            return {
                "message": "Не выделен элемент. Кликните по элементу на странице и повторите.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        user_content = (
            f"Запрос пользователя: {user_message}\n\n"
            f"selector: {selector}\n\n"
            f"HTML элемента:\n{target_html}"
        )

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="effect",
                system_prompt=self.SYSTEM_PROMPT,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[effect] dump request failed: {e}", flush=True)

        # ---- build messages ----
        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]
        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": user_content})

        # ---- provider call ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            print(f"[effect] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="effect",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[effect] dump response failed: {e}", flush=True)

        # ---- parse ----
        new_html = self._parse(raw, expected_selector=selector)

        # ---- safety: html must look like html ----
        if not self._looks_like_html(new_html):
            print(
                f"[effect] model returned a non-html answer: "
                f"{new_html[:120]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        return {
            "message": "Эффект добавлен.",
            "html": None,
            "selector": selector,
            "element_html": new_html,
        }

    # ============================================
    # PARSE
    # ============================================

    @staticmethod
    def _parse(text: str, expected_selector: str = "") -> str:
        """
        Extract the `html` field from the model response.

        Tolerates markdown wrappers and surrounding text. If the model
        returned JSON without `html`, falls back to the whole text.
        """
        import json

        if not text:
            return ""

        s = text.strip()

        # strip markdown fence
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # try the whole string
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                html = data.get("html", "")
                if html:
                    return str(html).strip()
        except Exception:
            pass

        # try the first {...} block
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(s[start:end + 1])
                if isinstance(data, dict):
                    html = data.get("html", "")
                    if html:
                        return str(html).strip()
            except Exception:
                pass

        # fallback: treat the whole response as HTML
        return s

    # ============================================
    # SAFETY
    # ============================================

    @staticmethod
    def _looks_like_html(text: str) -> bool:
        """
        Cheap sanity check that the model returned actual HTML and not
        an error message, an explanation, or an empty string.

        Rules:
          - must be non-empty after strip;
          - must start with '<';
          - must contain at least one '>';
          - must NOT start with '⚠️';
          - first 60 chars must NOT contain 'Ошибка' / 'ошибка' /
            'error' (case-insensitive);
          - must contain 'data-selected-id' (the marker we sent in).
        """
        if not text:
            return False

        s = str(text).strip()

        if not s:
            return False

        if s.startswith("⚠️"):
            return False

        if not s.startswith("<"):
            return False

        if ">" not in s:
            return False

        head = s[:60].lower()
        for bad in ("ошибка", "error", "ошибк", "превышено"):
            if bad in head:
                return False

        # The marker must survive — otherwise the client cannot find
        # the element back on the next update.
        if "data-selected-id" not in s:
            return False

        return True