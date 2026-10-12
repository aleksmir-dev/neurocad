# neurocad/core/engine/lib/pages/public/html.py

"""
HTML helpers for the public page renderer.

Two transformations that the public route applies to page content
before handing it to the Jinja template:

  1. strip_body_wrapper() — remove a stray <body>...</body> wrapper
     that GrapesJS sometimes produces in the saved content.

  2. apply_template() — insert the page's own HTML into the
     [data-slot="content"] of a base template page, producing the
     combined HTML that actually gets rendered.

Both are pure string operations — no DB, no request, no side
effects. They are called from the render helpers in render.py.

Why BeautifulSoup for apply_template
------------------------------------
The slot is a normal HTML attribute (data-slot="content") on an
arbitrary element that the template author chose. Inserting into
it means parsing the template's HTML, finding that element, and
replacing its children — a task that regex is bad at (nested
tags, attributes with quotes, arbitrary whitespace) and that a
real HTML parser handles correctly. BeautifulSoup is already a
dependency (used elsewhere in the project) and its output is
good enough: it does not prettify, it round-trips the input DOM.

For strip_body_wrapper the transformation is deliberately
regex-based: we are removing two specific tag patterns, not
parsing HTML. A parser would be overkill, and the regex is safe
because <body> appears at most once in a GrapesJS export and never
nests.

Namespace: CoreEngineLibPagesPublicHtml*
"""

import re

from bs4 import BeautifulSoup


# ============================================
# BODY WRAPPER CLEANUP
# ============================================

#: Matches an opening <body ...> tag (with any attributes).
_BODY_OPEN_RE = re.compile(r"<body\b[^>]*>", re.IGNORECASE)

#: Matches a closing </body> tag (optional whitespace).
_BODY_CLOSE_RE = re.compile(r"</body\s*>", re.IGNORECASE)


def strip_body_wrapper(html: str) -> str:
    """
    Remove a <body>...</body> wrapper from an HTML fragment.

    GrapesJS may export page content wrapped in <body>...</body>
    (e.g. via getProjectData, or for pages authored in an older
    editor version). On the public page we are already inside a
    real <body>, so a nested <body> is invalid HTML — W3C, Google
    and Yandex validators flag it.

    This function removes the tags but keeps the content. It runs
    at render time only — the DB and the editor are NOT touched.

    Attributes on <body> (class, style, data-*) are dropped. In
    practice, body-level styling is applied through the CSS rule
    `body { ... }` (kept in page.css) — that rule targets the real
    <body> of the public page, so styles are preserved. Inline
    style="..." on <body> is rare and would be lost; if that
    becomes an issue, switch to a <div class="page-body-wrapper">
    rewrite instead of a strip.
    """
    if not html:
        return html
    html = _BODY_OPEN_RE.sub("", html)
    html = _BODY_CLOSE_RE.sub("", html)
    return html


# ============================================
# TEMPLATE APPLICATION
# ============================================

def apply_template(template_html: str, content_html: str) -> str:
    """
    Insert content_html into the [data-slot="content"] of template_html.

    The base-template mechanism: a page may inherit from another
    page (the template), which provides the surrounding layout
    (nav, sidebar, footer, etc.). The template marks the insertion
    point with an element carrying data-slot="content". This
    function replaces that element's children with the page's own
    content.

    Behaviour:
      - if the template has no [data-slot="content"] — the template
        is returned UNCHANGED (page content is not inserted anywhere).
        This is a deliberate fallback: a template without a slot is
        still a valid page in its own right, and rendering it as-is
        is better than failing or inventing a slot position.

      - if the slot is present — its contents are cleared and
        replaced with content_html.

    Parsing is done by BeautifulSoup; the result is serialized back
    to a string with str(). BeautifulSoup does not prettify, so the
    output is close to the input.
    """
    soup = BeautifulSoup(template_html, "html.parser")
    slot = soup.find(attrs={"data-slot": "content"})

    if not slot:
        return template_html

    slot.clear()
    slot.append(BeautifulSoup(content_html, "html.parser"))

    return str(soup)