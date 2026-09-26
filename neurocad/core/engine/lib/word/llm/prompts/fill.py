# neurocad/core/engine/lib/word/llm/prompts/fill.py

"""
Step 2 of the three-step page-building flow: FILL.

The model receives a set of blocks (with their HTML) and fills in
text, alt attributes, and links according to the user's request. It
does NOT change structure or classes — EXCEPT in one specific case:
when a block from the "Элементы" category arrives as a bare element
(`<h2>…</h2>`, `<p>…</p>`, `<a>…</a>`, `<img>`, …), it must be wrapped
in a section, otherwise it ends up floating in <body> with no spacing.

Two builders live here:

    build_fill_prompt()
        System prompt: rules for filling, expected JSON shape.

    build_fill_user_message(user_message, chunk)
        User-side message: the original user request + the HTML of
        the blocks in `chunk` (a subset that fits into one request).

Response shape expected from the model:

    {
      "filled": [
        {"block_id": "core-hero",     "html": "<section ...>...</section>"},
        {"block_id": "core-features", "html": "<section ...>...</section>"}
      ],
      "remaining": []
    }

No static imports beyond the standard library. This module is pure —
it only builds strings.
"""

from typing import Any, Dict, List


def build_fill_prompt() -> str:
    """
    System prompt for step 2 (filling).

    The model receives a set of blocks with their HTML and fills in
    text, alts, and links. It does NOT change structure or classes
    — except for wrapping bare elements in a section (see rule 10).

    @returns the full system prompt as a string
    """
    return """Ты — редактор контента для CMS NeuroCad.

Тебе даны готовые HTML-блоки. Ты заполняешь их текстом, alt'ами и
ссылками в соответствии с запросом пользователя.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "filled": [
    {"block_id": "core-hero", "html": "<section ...>...</section>"},
    {"block_id": "core-features", "html": "<section ...>...</section>"}
  ],
  "remaining": []
}

ПРАВИЛА:
1. НЕ меняй структуру HTML и классы. Только тексты, alt, href.
2. Для каждой картинки с placeholder поставь осмысленный alt.
   Саму картинку оставь как есть (src не меняй).
3. Если пользователь просит ссылки на другие страницы — используй
   `href="page:slug"` (например, `href="page:about"`).
4. Не добавляй inline-стили (`style="..."`) и не вставляй `<style>`.
5. Сохраняй все существующие классы и вложенность.
6. Если блок не требует изменений — верни его HTML как есть.
7. Если ты не смог обработать какой-то блок (например, не хватило
   места) — верни его block_id в массиве "remaining".
8. Тексты должны быть на русском, в нейтрально-деловом тоне,
   согласованы между блоками (одна терминология, один стиль).
9. Не добавляй пояснения до или после JSON.

ОБОРАЧИВАНИЕ ЭЛЕМЕНТОВ В СЕКЦИЮ (важно):
10. Если корневой тег блока — НЕ секционный контейнер, а голый
    элемент (`<h1>`, `<h2>`, `<h3>`, `<p>`, `<a>`, `<button>`,
    `<img>`, `<ul>`, `<ol>`, `<blockquote>`, `<hr>`, `<span>`,
    голый `<div>` без класса `section`), — ОБЕРНИ его в секцию:

    <section class="section">
        <div class="container">
            ... сюда исходный элемент ...
        </div>
    </section>

    ПРИМЕРЫ:

    Было (block_id: core-heading-h2):
      <h2 class="h2" data-block="core-heading-h2">Заголовок</h2>

    Стало:
      <section class="section">
          <div class="container">
              <h2 class="h2" data-block="core-heading-h2">Заголовок</h2>
          </div>
      </section>

    Было (block_id: core-btn):
      <a href="#" class="btn" data-block="core-btn">Кнопка</a>

    Стало:
      <section class="section">
          <div class="container">
              <a href="#" class="btn" data-block="core-btn">Кнопка</a>
          </div>
      </section>

11. Если корневой тег блока УЖЕ секционный контейнер
    (`<section>`, `<article>`, `<header>`, `<footer>`, `<aside>`,
    `<main>`, `<nav>`) — ОСТАВЬ его как есть. Не добавляй
    вторую обёртку.

    Было (block_id: core-section):
      <section class="section" data-block="core-section">...</section>

    Стало:
      <section class="section" data-block="core-section">...</section>
      (без изменений)

12. Внутренние классы, атрибуты и вложенность — НЕ трогай.
    Обёртка добавляется СНАРУЖИ исходного элемента.
"""


def build_fill_user_message(
    user_message: str,
    chunk: List[Dict[str, Any]],
) -> str:
    """
    User-side message for step 2 (filling).

    The message starts with the original user request, then lists the
    blocks in `chunk` — each preceded by a `=== <block_id> ===` line,
    followed by the block's HTML.

    @param user_message — the user's original request as a string
    @param chunk        — list of {block_id, html} dicts that fit in
                          one request
    @returns the full user-side message as a string
    """
    parts: List[str] = [f"Запрос пользователя: {user_message}", ""]

    for item in chunk:
        bid = item.get("block_id", "?")
        html = item.get("html", "")
        parts.append(f"=== {bid} ===")
        parts.append(html)
        parts.append("")

    return "\n".join(parts).rstrip()