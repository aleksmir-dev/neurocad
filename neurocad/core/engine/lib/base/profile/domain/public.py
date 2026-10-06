# neurocad/core/engine/lib/base/profile/domain/public.py

"""
Public legal routes — /policy and /rules.

These are PUBLIC pages: they are opened on the user's own host
(subdomain or custom domain), not in the admin panel. There is no
session — the visitor is just browsing the site. The user is
resolved from the Host header, exactly like /robots.txt and
/sitemap.xml (see utils/routes.py).

Resolution order (same as robots / sitemap):

    1. Host is a user subdomain (<login>.<APP_DOMAIN>):
         testuser3.neurocad.ru → users.policy / users.rules
    2. Host is a user custom domain (users.domain):
         atou.ru → users.policy / users.rules
    3. Anything else (apex APP_DOMAIN, IP, unknown host):
         404. There is no one to serve a legal page for.

Fallback when the field is empty
--------------------------------
If the user has never filled the field (NULL) or cleared it ("",
whitespace-only), the endpoint serves a universal short text from
./modal/legal/policy.md or ./modal/legal/rules.md. The text is
regenerated on every request, with today's date substituted into
the {date} placeholder.

The endpoint returns 404 only when the Host does not resolve to
any user. If the Host resolves but the field is empty, it returns
200 with the fallback — the page always exists, so a footer link
never leads to a dead end.

Content type
------------
Always text/html; charset=utf-8. The markdown is converted to
HTML on the fly by markdown-it-py ("commonmark" preset + "table"
rule). Raw HTML in the source is NOT passed through.

Cache-Control is no-cache so that a user editing their policy in
the admin modal sees the change reflected on their public site on
the next request.

Mounted at the application root (no prefix) — the URLs are
exactly /policy and /rules, on whatever host the request arrived
on. The router is registered in utils/routes.py → setup_routes().

read_default() is also imported by service/legal.py (see
LegalMixin.get_defaults), so the same fallback texts that the
public endpoints serve are the ones the admin modal seeds its
textarea with when the field is empty.

Namespace: CoreEngineLibBaseProfileDomain*
"""

from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import Response

from neurocad.utils.hosts import normalize_host, user_id_from_host


router = APIRouter(tags=["core/engine/lib/base/profile/domain/public"])


# ============================================
# DEFAULTS
# ============================================

#: Content type for the rendered legal pages.
LEGAL_MEDIA_TYPE = "text/html; charset=utf-8"

#: Directory that holds the default markdown files. Relative to
#: this module, so it does not depend on the current working
#: directory.
_DEFAULTS_DIR = Path(__file__).parent / "modal" / "legal"

#: Very short inline fallback if the .md file cannot be read.
#: Should never be used in practice — it exists so that a missing
#: file produces a valid (if minimal) legal page instead of a 500.
_INLINE_FALLBACK = {
    "policy": "# Политика обработки персональных данных\n\nТекст политики не задан.\n",
    "rules":  "# Правила использования сайта\n\nТекст правил не задан.\n",
}


def _today_iso() -> str:
    """Today's date in DD.MM.YYYY (Russian format)."""
    return date.today().strftime("%d.%m.%Y")


def read_default(which: str) -> str:
    """
    Read the default markdown for "policy" or "rules".

    Returns the file contents with {date} substituted by today's
    ISO date. Any unknown `which` value falls back to "policy".

    Never raises: a missing or unreadable file yields a short
    inline fallback so the caller can always render something.

    Public name (no leading underscore) because service/legal.py
    imports it — see LegalMixin.get_defaults. The defaults must be
    identical in both places: what the public page serves and what
    the admin modal seeds its textarea with.
    """
    key = "rules" if which == "rules" else "policy"
    path = _DEFAULTS_DIR / f"{key}.md"

    try:
        raw = path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[public] failed to read default {path}: {e}")
        raw = _INLINE_FALLBACK[key]

    try:
        return raw.format(date=_today_iso())
    except Exception:
        # If the file contains a stray "{" that is not a known
        # placeholder, str.format() raises. Fall back to the raw
        # text — better a policy without a date than a 500.
        return raw


# ============================================
# HTML HELPERS
# ============================================

def _html_escape(text: str) -> str:
    """Escape a string for safe inclusion in HTML text or attributes."""
    return (
        str(text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _md_to_html(markdown_text: str) -> str:
    """
    Convert markdown to HTML using markdown-it-py.

    "html" is disabled: raw HTML in the source is not passed
    through. "table" is enabled explicitly because GFM tables are
    not part of CommonMark and the default preset does not render
    them.
    """
    from markdown_it import MarkdownIt

    md = (
        MarkdownIt("commonmark", {"html": False, "linkify": False})
        .enable("table")
    )
    return md.render(markdown_text or "")


def _render_legal_page(title: str, markdown_text: str) -> str:
    """
    Render a legal page (policy or rules) to a complete HTML
    document.

    The stylesheet is inlined so the page has zero external
    dependencies — it must load identically on any host the user
    attaches, without relying on the admin panel's static assets
    being reachable from that host.
    """
    body_html = _md_to_html(markdown_text or "")
    safe_title = _html_escape(title)

    return (
        "<!doctype html>\n"
        "<html lang=\"ru\">\n"
        "<head>\n"
        "  <meta charset=\"utf-8\">\n"
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        f"  <title>{safe_title}</title>\n"
        "  <style>\n"
        "    :root { color-scheme: light dark; }\n"
        "    body {\n"
        "      margin: 0;\n"
        "      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',\n"
        "                   Roboto, 'Helvetica Neue', Arial, sans-serif;\n"
        "      line-height: 1.65;\n"
        "      color: #1e293b;\n"
        "      background: #ffffff;\n"
        "    }\n"
        "    main.legal {\n"
        "      max-width: 760px;\n"
        "      margin: 0 auto;\n"
        "      padding: 32px 20px 64px;\n"
        "    }\n"
        "    main.legal h1 { font-size: 28px; line-height: 1.25; margin: 0 0 20px; }\n"
        "    main.legal h2 { font-size: 22px; line-height: 1.3; margin: 32px 0 12px; }\n"
        "    main.legal h3 { font-size: 18px; line-height: 1.35; margin: 24px 0 10px; }\n"
        "    main.legal p, main.legal li { font-size: 16px; }\n"
        "    main.legal ul, main.legal ol { padding-left: 24px; }\n"
        "    main.legal code {\n"
        "      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n"
        "      font-size: 14px;\n"
        "      background: rgba(15, 23, 42, 0.06);\n"
        "      padding: 1px 5px;\n"
        "      border-radius: 4px;\n"
        "    }\n"
        "    main.legal pre {\n"
        "      background: #f8fafc;\n"
        "      border: 1px solid #e2e8f0;\n"
        "      border-radius: 8px;\n"
        "      padding: 12px 14px;\n"
        "      overflow: auto;\n"
        "    }\n"
        "    main.legal pre code { background: transparent; padding: 0; }\n"
        "    main.legal table {\n"
        "      border-collapse: collapse;\n"
        "      width: 100%;\n"
        "      margin: 12px 0;\n"
        "    }\n"
        "    main.legal th, main.legal td {\n"
        "      border: 1px solid #e2e8f0;\n"
        "      padding: 8px 12px;\n"
        "      text-align: left;\n"
        "      font-size: 15px;\n"
        "    }\n"
        "    main.legal th { background: #f8fafc; font-weight: 600; }\n"
        "    main.legal blockquote {\n"
        "      margin: 16px 0;\n"
        "      padding: 8px 16px;\n"
        "      border-left: 4px solid #cbd5e1;\n"
        "      color: #475569;\n"
        "    }\n"
        "    main.legal a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }\n"
        "    @media (prefers-color-scheme: dark) {\n"
        "      body { color: #e2e8f0; background: #0f172a; }\n"
        "      main.legal code { background: rgba(226, 232, 240, 0.12); }\n"
        "      main.legal pre { background: #1e293b; border-color: #334155; }\n"
        "      main.legal th, main.legal td { border-color: #334155; }\n"
        "      main.legal th { background: #1e293b; }\n"
        "      main.legal blockquote { border-left-color: #475569; color: #cbd5e1; }\n"
        "      main.legal a { color: #93c5fd; }\n"
        "    }\n"
        "  </style>\n"
        "</head>\n"
        "<body>\n"
        f"  <main class=\"legal\">{body_html}</main>\n"
        "</body>\n"
        "</html>\n"
    )


# ============================================
# DATA
# ============================================

async def _legal_text_for_host(host: Optional[str], which: str) -> Optional[str]:
    """
    Resolve a Host header to a user and return the requested legal
    text (users.policy or users.rules).

    `which` must be "policy" or "rules".

    Returns:
      - the user's own text, if the field is non-empty (after strip);
      - the universal fallback (see read_default), if the field is
        NULL, "", or whitespace-only;
      - None only if the host does not belong to any user — the
        caller then returns 404.

    Never raises: a DB error is treated as "not a user host" and
    the caller returns 404, which is the safest default.
    """
    from sqlalchemy import select
    from neurocad.core.models.user import User
    from neurocad.utils.sqlite import get_db_sqlite

    if which not in ("policy", "rules"):
        return None

    normalized = normalize_host(host)
    if not normalized:
        return None

    user_id = await user_id_from_host(normalized)
    if user_id is None:
        return None

    try:
        async for session in get_db_sqlite():
            stmt = select(User).where(
                User.id == user_id,
                User.is_delete.is_(False),
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                return None

            raw = getattr(user, which, None)
            if raw is None or not str(raw).strip():
                return read_default(which)
            return raw
    except Exception as e:
        print(
            f"[public] legal lookup failed for host={normalized!r} "
            f"which={which!r}: {e}"
        )
        return None


# ============================================
# ROUTES
# ============================================

@router.get("/policy")
async def policy_page(request: Request) -> Response:
    """
    Public Policy page for the current host.

    Renders users.policy for the user resolved from the Host
    header. Falls back to a universal short text (see
    read_default) when the field is empty. Returns 404 only when
    the Host does not belong to any user.
    """
    host = request.headers.get("host")
    text = await _legal_text_for_host(host, "policy")
    if text is None:
        return Response(status_code=404, content="Политика не найдена")
    html = _render_legal_page("Политика", text)
    return Response(
        content=html,
        media_type=LEGAL_MEDIA_TYPE,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/rules")
async def rules_page(request: Request) -> Response:
    """
    Public Rules page for the current host.

    Renders users.rules for the user resolved from the Host
    header. Falls back to a universal short text (see
    read_default) when the field is empty. Returns 404 only when
    the Host does not belong to any user.
    """
    host = request.headers.get("host")
    text = await _legal_text_for_host(host, "rules")
    if text is None:
        return Response(status_code=404, content="Правила не найдены")
    html = _render_legal_page("Правила", text)
    return Response(
        content=html,
        media_type=LEGAL_MEDIA_TYPE,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )