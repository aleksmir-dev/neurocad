# app/core/models/page.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, DateTime, Index, ForeignKey
from datetime import datetime as dt
from typing import Optional
from .base import Base


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Nav instance this page belongs to (a concrete object owned by a user).
    # Each Nav row = one object of some module ("class"); pages belong
    # to the object, not to the module/class.
    nav_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("nav.id"),
        nullable=False,
    )

    # ===== Folder mode =====
    #
    # The catalog is hierarchical. Each row is either a regular page
    # ("page") or a grouping node ("folder"). A folder carries the
    # same table row as a page but:
    #   - has no content / content_json / css / url;
    #   - has no meaningful datetime (NULL is allowed);
    #   - may have children (pages or other folders).
    #
    # `parent_id` is the folder this row lives in:
    #   - NULL → the row is at the root of its nav;
    #   - <id> → the row lives inside the folder with that id.
    #
    # `sort_order` is a manual ordering value inside the folder.
    # Lower values sort first; rows with the same sort_order are
    # sorted by title (folders) or datetime DESC (pages).
    #
    # IMPORTANT: `card_type` is intentionally NOT updatable through
    # the regular page update endpoint. Switching a page into a
    # folder (or vice versa) would leave the subtree inconsistent
    # and must go through a dedicated endpoint that also fixes up
    # children.
    card_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="page",
        server_default="page",
    )

    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("pages.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    # ===== Content =====
    #
    # `datetime` is the page's publication date and time. It is
    # nullable so folders do not have to store a fake timestamp.
    # Pages always set it (either the value provided by the caller
    # or datetime.now()). The public URL for a page is built from
    # this field.
    datetime: Mapped[Optional[dt]] = mapped_column(DateTime, nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    logo: Mapped[Optional[str]] = mapped_column(Text)

    # HTML for display
    content: Mapped[Optional[str]] = mapped_column(Text)

    # GrapesJS JSON for editor
    content_json: Mapped[Optional[str]] = mapped_column(Text)

    # CSS страницы (источник правды).
    # HTML — в content, CSS — здесь. При рендере CSS выгружается
    # в static/pages/<id>.css, в HTML идёт <link> с ?v=<hash>.
    css: Mapped[Optional[str]] = mapped_column(Text)

    # External URL for this page.
    #
    # When set, the page is treated as a "link card" — a catalog
    # entry that points to an external site instead of to an
    # internal page. The public catalog and the admin catalog both
    # open this URL on click, in the CURRENT tab (target="_self").
    #
    # The page keeps its own content / content_json / css, and the
    # editor still opens normally when the page is edited directly
    # by URL — the external URL does not lock the page, it only
    # changes how catalog cards resolve on click.
    #
    # NULL / "" → the page behaves exactly as before (internal
    # /page/<date>/<time> target).
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)

    # ===== Template system =====
    # is_template = True → this page can be used as a base template
    #   by other pages (shown in "Наследовать от" dropdown).
    # template_id = None → standalone page (renders its own content).
    # template_id = <id> → inherits layout from that template page;
    #   its own `content` is inserted into the [data-slot="content"] slot.
    is_template: Mapped[int] = mapped_column(Integer, default=0)
    template_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("pages.id"),
        nullable=True,
        default=None,
    )

    is_active: Mapped[int] = mapped_column(Integer, default=1)
    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(DateTime, default=dt.now, onupdate=dt.now)
    rss_yandex_id: Mapped[Optional[str]] = mapped_column(String(64), default=None)

    __table_args__ = (
        Index('idx_pages_nav_id', 'nav_id'),
        Index('idx_pages_nav_datetime', 'nav_id', 'datetime'),
        Index('idx_pages_datetime', 'datetime'),
        Index('idx_pages_is_delete', 'is_delete'),
        Index('idx_pages_is_active', 'is_active'),
        Index('idx_pages_rss_yandex_id', 'rss_yandex_id'),
        Index('idx_pages_is_template', 'is_template'),
        Index('idx_pages_template_id', 'template_id'),

        # Folder mode indexes:
        #   - filtering by parent_id is the hot path for GET /list;
        #   - filtering by card_type is used for the public catalog
        #     (pages only) and for the admin list (folders + pages).
        # A composite (nav_id, parent_id) index would also work,
        # but two single-column indexes are enough for the current
        # query patterns and keep the schema simpler.
        Index('idx_pages_parent_id', 'parent_id'),
        Index('idx_pages_card_type', 'card_type'),
    )