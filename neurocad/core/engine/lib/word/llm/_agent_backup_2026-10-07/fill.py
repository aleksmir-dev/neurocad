# neurocad/core/engine/lib/word/llm/agent/fill.py

"""
Agent: fill.

Fill ONE selected element with text, alt's and links. The selected
element is whatever the user clicked in the editor — a whole block
(<section>) or any inner node (<div>, <h1>, <p>, <a>, ...).

Returns:
    {
        "selector":     "sel-abc12345",   # the marker from selection
        "element_html": "<section ...>...</section>",
        "message":      "Элемент заполнен.",
    }

The client replaces the element with `data-selected-id="sel-abc12345"`
by the new HTML.

Intermediate events: a single `step` event is emitted at the start
("Заполняю..."), then the LLM answer is returned via the standard
result shape.
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase


class CoreEngineLibWordLlmAgentFill(CoreEngineLibWordLlmAgentBase):
    """Fill one selected element with content."""

    name = "fill"

    SYSTEM_PROMPT = """Ты — редактор контента для CMS NeuroCad.

Тебе дают ОДИН HTML-элемент (секция, div, заголовок, абзац, ссылка —
любой узел) и запрос пользователя.
Ты заполняешь этот элемент текстом, alt'ами и ссылками.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "selector": "sel-abc12345",
  "html": "<section ...>...</section>"
}

ПРАВИЛА:
1. НЕ меняй структуру HTML и классы. Только тексты, alt, href.
2. Корневой тег и все его атрибуты — СОХРАНИ как есть, включая
   `data-selected-id`.
3. Поле "selector" — ровно то, что было во входе.
4. Поле "html" — ТОЛЬКО HTML этого элемента, без <html>, <head>, <body>.
5. Не добавляй inline-стили (style="...") и не вставляй <style>.
6. Сохраняй все существующие классы и вложенность.
7. Тексты — на русском, в нейтрально-деловом тоне.
8. Не добавляй пояснения до или после JSON.
9. Не оборачивай в markdown.
10. Если запрос не про заполнение контентом — верни элемент без
    изменений.
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
                "step": "fill",
                "message": "Заполняю текстом...",
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
                agent_name="fill",
                system_prompt=self.SYSTEM_PROMPT,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[fill] dump request failed: {e}", flush=True)

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
            print(f"[fill] LLM error: {e}", flush=True)
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
                agent_name="fill",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[fill] dump response failed: {e}", flush=True)

        # ---- parse ----
        new_html = self._parse(raw)
        if not new_html:
            return {
                "message": "Не удалось разобрать ответ модели.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        return {
            "message": "Элемент заполнен.",
            "html": None,
            "selector": selector,
            "element_html": new_html,
        }

    # ============================================
    # PARSE
    # ============================================

    @staticmethod
    def _parse(text: str) -> str:
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