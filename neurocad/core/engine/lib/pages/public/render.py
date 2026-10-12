# neurocad/core/engine/lib/pages/public/render.py

"""
Public-page rendering helpers.

This module owns everything between "the route has a page (or a
folder path) to render" and "the Jinja template is ready to be
sent":

  - render_public_page()    — a single page (with template,
                              creative patching, CSS);
  - render_pages_catalog()  — the /pages catalog for a folder path;
  - render_unavailable()    — the "Страница недоступна" placeholder;
  - resolve_content()       — the HTML the page renders, after
                              applying the base template (if any)
                              and stripping the stray <body>.

The route layer (route.py) declares URLs and resolves the request
Host to a nav / page / folder path. It then calls one of the three
render_* functions here, and returns the HTMLResponse untouched.

Why render helpers are separate
-------------------------------
Two reasons:

  1. They are the only place in the module that touches Jinja,
     CSS files, tariff checks, and creative patching. Mixing them
     into the route handlers made route.py ~800 lines of mixed
     concerns — a change to the tariff policy or the CSS pipeline
     required editing a file that mostly talks about URLs.

  2. The catalog and the single page share a lot of plumbing
     (template CSS, page CSS, tariff guard). Keeping them in one
     module makes the shared pieces obvious.

Everything here is a pure(ish) async function: given a request
and a resolved page / nav + path, it produces an HTMLResponse.
No globals, no module state.

Namespace: CoreEngineLibPagesPublicRender*
"""

from datetime import datetime
from typing import List, Optional

from fastapi import Request
from fastapi.responses import HTMLResponse

from neurocad.utils.templates import templates
from neurocad.utils.css import ensure_css_file
from neurocad.utils.sqlite import get_db_sqlite
from neurocad.core.engine.lib.balance.checked import BalanceChecked

# Creative block patching — rewrite data-creative-id and
# data-placement-id on every core-creative section to the page's
# CURRENT active placement row. See word/creative.py for the full
# rationale on why both attributes are patched together.
from neurocad.core.engine.lib.word.creative import (
    patch_creative_blocks,
    patch_placement_blocks,
)

from .cookies import set_folder_cookie
from .hosts import resolve_nav_name, resolve_nav_owner
from .html import apply_template, strip_body_wrapper
from .service import (
    CoreEngineLibPagesPublicService,
    PAGES_CSS_DIR,
    PAGES_CSS_URL,
)
from .schema import (
    CoreEngineLibPagesPublicItem,
    CoreEngineLibPagesPublicCrumb,
)


# ============================================
# CONSTANTS
# ============================================

#: Default page size for the public catalog. Kept as a module
#: constant so a future paginated version has one place to change.
PUBLIC_CATALOG_LIMIT = 100

#: Fallback title when Nav.name is empty or the nav is missing.
PUBLIC_CATALOG_DEFAULT_TITLE = "Каталог статей"


# ============================================
# SINGLE PAGE
# ============================================

async def render_public_page(
    request: Request,
    page: CoreEngineLibPagesPublicItem,
) -> HTMLResponse:
    """
    Render public page template with content from DB.

    Before rendering, checks the owner's tariff via
    BalanceChecked.page_renderable(user_id). If blocked — returns
    the "Страница недоступна" placeholder (HTTP 200).

    If page has template_id:
      1. Loads the base template page and inserts page content
         into [data-slot="content"] of the template (see
         resolve_content).
      2. Loads the TEMPLATE's CSS and serves it as its own static
         file (<template_id>.css). Passed to the template as
         template_css_url and injected BEFORE the page's own CSS
         in public.html, so page styles can override the shared
         layout at equal specificity.

    Page CSS is written to
        static/core/engine/lib/pages/public/pages/<id>.css
    (if not already there with the same content) and passed to the
    template as page_css_url.

    Creative block patching:
      Page.content in the DB may hold a stale data-creative-id —
      it is only refreshed by word.service.save_content, and
      changing the creative via page properties (PUT /pages/item)
      does NOT re-save the HTML. After resolve_content (which may
      have inserted page content into a base template slot), the
      final HTML is passed through two patchers:

        patch_creative_blocks() — rewrites data-creative-id to
          the page's CURRENT active creative id (what block.js
          fetches for content).

        patch_placement_blocks() — rewrites data-placement-id to
          the page's CURRENT active placement id (what block.js
          POSTs to /creatives/hit for tracking).

      Both read the SAME active placement row, so a page rendered
      by this route always carries matching ids. See
      word/creative.py for the full rationale.
    """
    # ==== LAZY TARIFF CHECK ====
    user_id = await resolve_nav_owner(page.nav_id)
    if user_id is not None:
        allowed = await BalanceChecked.page_renderable(
            user_id, log=getattr(request.app.state, "log", None)
        )
        if not allowed:
            return render_unavailable(request)

    # Format datetime for display
    dt_display = None
    if page.datetime:
        try:
            if isinstance(page.datetime, str):
                dt = datetime.fromisoformat(page.datetime)
            else:
                dt = page.datetime
            dt_display = dt.strftime("%d.%m.%Y %H:%M")
        except Exception:
            dt_display = str(page.datetime)

    # Apply base template if set
    final_content = await resolve_content(page)

    # ==== PATCH CREATIVE BLOCKS ====
    # Rewrite data-creative-id and data-placement-id on every
    # core-creative section to the page's CURRENT active placement
    # row. Page.content in the DB may hold stale ids — they are
    # only updated by save_content, and changing the creative via
    # page properties (PUT /pages/item) does NOT re-save the HTML.
    # The public page must always show the current creative and
    # track hits against the current placement, so we patch at
    # render time.
    #
    # Both patchers take a session — we open one here and run both
    # inside it, so the two lookups hit the same connection and
    # cannot diverge. If the page has no core-creative sections,
    # each helper returns the HTML unchanged without touching the
    # DB.
    if final_content and 'core-creative' in final_content:
        async for session in get_db_sqlite():
            final_content = await patch_creative_blocks(
                final_content, page.id, session
            )
            final_content = await patch_placement_blocks(
                final_content, page.id, session
            )
            break

    # ==== TEMPLATE CSS (if page inherits from a base template) ====
    # Load the template's CSS and serve it as its own static file.
    # Injected BEFORE the page CSS in public.html, so the page
    # styles win on conflicts (nav/sidebar/footer vs article).
    template_css_url = None
    if page.template_id:
        template_css = await CoreEngineLibPagesPublicService.get_template_css(
            page.template_id, nav_id=page.nav_id
        )
        if template_css and template_css.strip():
            template_css_url = ensure_css_file(
                page.template_id,
                template_css,
                directory=PAGES_CSS_DIR,
                url_prefix=PAGES_CSS_URL,
            )

    # Page CSS — write derivative file (if needed) and get URL with ?v=<hash>.
    page_css_url = ensure_css_file(
        page.id,
        page.css,
        directory=PAGES_CSS_DIR,
        url_prefix=PAGES_CSS_URL,
    )

    return templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/public.html",
        context={
            "title": page.title or "Без названия",
            "description": page.description or "",
            "content": final_content,
            "datetime": dt_display,
            "logo": page.logo,
            "nav_id": page.nav_id,
            "template_css_url": template_css_url,
            "page_css_url": page_css_url,
        },
    )


# ============================================
# CATALOG
# ============================================

async def render_pages_catalog(
    request: Request,
    nav_id: int,
    path_ids: List[int],
) -> HTMLResponse:
    """
    Build and render the /pages catalog for a given folder path.

    Steps:
      1. Same lazy tariff check as a single page: if the owner's
         tariff blocks rendering, return the placeholder.
      2. Load the children of the current folder (folders + pages)
         via CoreEngineLibPagesPublicService.get_list().
      3. Build breadcrumbs via get_folder_chain().
      4. Render public/pages.html with the list, the crumbs and
         the catalog title taken from Nav.name.
      5. Rewrite the cookie to match `path_ids` — so the next bare
         /pages visit opens the same folder. When `path_ids` is
         empty (root, including the explicit `?root=1` case), the
         cookie is cleared.

    Each item already carries a ready `url`:
      - folder → /pages/<id>;
      - page   → /page/<YYYYMMDD>/<HHMMSS> or an external URL.
    The template just prints it.
    """
    # ==== LAZY TARIFF CHECK ====
    user_id = await resolve_nav_owner(nav_id)
    if user_id is not None:
        allowed = await BalanceChecked.page_renderable(
            user_id, log=getattr(request.app.state, "log", None)
        )
        if not allowed:
            response = render_unavailable(request)
            set_folder_cookie(response, [])
            return response

    # ==== ITEMS ====
    # Current folder = last id in path_ids (None = root).
    current_folder_id: Optional[int] = path_ids[-1] if path_ids else None

    items = await CoreEngineLibPagesPublicService.get_list(
        nav_id,
        parent_id=current_folder_id,
        limit=PUBLIC_CATALOG_LIMIT,
    )

    # ==== BREADCRUMBS ====
    crumbs: List[CoreEngineLibPagesPublicCrumb] = (
        await CoreEngineLibPagesPublicService.get_folder_chain(
            nav_id, path_ids
        )
    )

    # ==== TITLE ====
    # Заголовок каталога — Nav.name. Редактируется из админки
    # через PUT /core/engine/lib/pages/nav-name. Если name пуст
    # или nav отсутствует — общий фолбэк.
    nav_name = await resolve_nav_name(nav_id)
    title = (nav_name or "").strip() or PUBLIC_CATALOG_DEFAULT_TITLE

    # Если мы в папке — добавляем её имя в <title> для SEO/UX.
    if current_folder_id is not None and len(crumbs) > 1:
        folder_title = crumbs[-1].title
        if folder_title:
            title = f"{folder_title} — {title}"

    response = templates.TemplateResponse(
        request=request,
        name="core/engine/lib/pages/public/pages.html",
        context={
            "title": title,
            "description": "",
            "items": items,
            "crumbs": crumbs,
            "current_folder_id": current_folder_id,
            "nav_id": nav_id,
            "total": len(items),
        },
    )
    set_folder_cookie(response, path_ids)
    return response


# ============================================
# UNAVAILABLE PLACEHOLDER
# ============================================

def render_unavailable(request: Request) -> HTMLResponse:
    """
    Render the "Страница недоступна" placeholder (HTTP 200).

    Served when the owner's tariff blocks public rendering — the
    guest sees a friendly note rather than a 404, because the page
    genuinely exists (it is the owner's quota that is blocking
    delivery, not the page itself).
    """
    html = """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Страница недоступна</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1e293b;
        }
        .wrap {
            min-height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
        }
        .card {
            max-width: 480px;
            text-align: center;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 40px 32px;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        }
        .icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
        .title {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 8px;
        }
        .text {
            font-size: 14px;
            color: #64748b;
            margin: 0;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <div class="icon">🔒</div>
            <h1 class="title">Страница недоступна</h1>
            <p class="text">
                Владелец сайта временно не может показывать эту страницу.
                Попробуйте зайти позже.
            </p>
        </div>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


# ============================================
# TEMPLATE APPLICATION
# ============================================

async def resolve_content(page: CoreEngineLibPagesPublicItem) -> str:
    """
    Build the final HTML for the page.

    If page.template_id is set:
      1. Load the base template page (within the same nav).
      2. Insert page.content into [data-slot="content"] of the template.
      3. Return the combined HTML.

    Otherwise — return page.content as-is.

    In all cases, a stray <body>...</body> wrapper (produced by
    GrapesJS export in some paths) is stripped before returning.

    Called from render_public_page — it runs BEFORE the creative
    patch, so the patch sees the fully-assembled HTML (template
    + page content) and stamps every core-creative section it
    contains, including any that came from the template.
    """
    page_content = page.content or "<p>Пустая страница</p>"

    if not page.template_id:
        return strip_body_wrapper(page_content)

    template = await CoreEngineLibPagesPublicService.get_by_id(
        page.template_id, nav_id=page.nav_id
    )
    if not template or not template.content:
        return strip_body_wrapper(page_content)

    combined = apply_template(template.content, page_content)
    return strip_body_wrapper(combined)