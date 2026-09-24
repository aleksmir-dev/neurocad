# neurocad/core/engine/lib/word/llm/utils.py

"""
Small helpers shared across the LLM package.

Namespace: CoreEngineLibWordLlmUtils

Converts between the single `page.content` string and the (html, css)
pair. No imports from other modules in this package — keep it
dependency-free.
"""

import re


class CoreEngineLibWordLlmUtils:
    """Static helpers for the LLM editor."""

    @staticmethod
    def split_html_css(content: str) -> tuple[str, str]:
        """
        Split page.content into (html, css).

        If content contains a `<style>...</style>` prefix — extract CSS.
        Otherwise — return content as HTML, empty CSS.
        """
        if not content:
            return "", ""

        s = content.strip()

        match = re.match(r'^\s*<style>(.*?)</style>(.*)$', s, re.DOTALL)
        if match:
            return match.group(2).strip(), match.group(1).strip()

        return s, ""

    @staticmethod
    def merge_html_css(html: str, css: str) -> str:
        """
        Merge HTML + CSS into a single content string.
        If CSS is not empty — prepend `<style>...</style>`.
        """
        html = (html or '').strip()
        css = (css or '').strip()

        if css:
            return f"<style>{css}</style>{html}"
        return html