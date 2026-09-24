# neurocad/core/engine/lib/word/llm/parser.py

"""
Parse LLM responses into structured data.

Namespace: CoreEngineLibWordLlmParser

The LLM may return:
  - plain JSON,
  - JSON wrapped in markdown (```json ... ```),
  - JSON with some text before/after,
  - plain HTML (if it ignores the JSON instruction).

The parser is tolerant: it tries several strategies and falls back to
a safe default instead of raising. This keeps a single bad response
from breaking the whole editor flow.
"""

import json
from typing import Dict


class CoreEngineLibWordLlmParser:
    """Tolerant LLM response parser."""

    # ============================================
    # LOW-LEVEL HELPERS
    # ============================================

    @staticmethod
    def clean_html_response(text: str) -> str:
        """
        Remove markdown wrappers (```html ... ``` or ``` ... ```)
        if the LLM added them around HTML.
        """
        if not text:
            return text

        s = text.strip()

        if s.startswith('```'):
            # Drop the first line (``` or ```html)
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            # Drop trailing ```
            if s.endswith('```'):
                s = s[:-3]

        return s.strip()

    @staticmethod
    def _strip_markdown_wrapper(text: str) -> str:
        """
        Remove a leading ```json / ``` and a trailing ``` from the text.
        Returns the inner content (may still not be valid JSON).
        """
        s = text.strip()
        if s.startswith('```'):
            first_nl = s.find('\n')
            if first_nl != -1:
                s = s[first_nl + 1:]
            if s.endswith('```'):
                s = s[:-3]
            s = s.strip()
        return s

    # ============================================
    # PUBLIC API
    # ============================================

    @staticmethod
    def extract_fields(data: dict) -> Dict[str, str]:
        """
        Extract message / html from a parsed JSON dict.

        Always returns both keys, even if the model omitted one.
        Missing `message` → "Done."
        Missing `html` → "".
        """
        message = str(data.get("message", "")).strip() or "Done."
        html = str(data.get("html", "")).strip()
        return {"message": message, "html": html}

    @staticmethod
    def parse_llm_response(text: str) -> Dict[str, str]:
        """
        Parse an LLM response into {message, html}.

        Expected JSON shape:
            {"message": "...", "html": "..."}

        Tries, in order:
          1. Strip markdown wrapper (```json ... ```).
          2. Find the first {...} block inside the text and parse it.
          3. Try to parse the whole string as JSON.
          4. Fall back: treat the whole text as HTML.

        Never raises. On any failure, returns a safe default.
        """
        if not text:
            return {"message": "Empty LLM response.", "html": ""}

        s = CoreEngineLibWordLlmParser._strip_markdown_wrapper(text)

        # 1. Try to find a JSON object inside the text
        start = s.find('{')
        end = s.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = s[start:end + 1]
            try:
                data = json.loads(candidate)
                if isinstance(data, dict):
                    return CoreEngineLibWordLlmParser.extract_fields(data)
            except json.JSONDecodeError:
                pass

        # 2. Try to parse the whole string as JSON
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return CoreEngineLibWordLlmParser.extract_fields(data)
        except json.JSONDecodeError:
            pass

        # 3. Fallback: not JSON — treat the cleaned text as HTML
        return {
            "message": "Done. Changes applied.",
            "html": CoreEngineLibWordLlmParser.clean_html_response(s),
        }