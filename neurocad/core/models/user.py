# neurocad/core/models/user.py

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index, Text
from datetime import datetime as dt
from typing import Optional
from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    password: Mapped[str] = mapped_column(String(256), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(128))
    email: Mapped[Optional[str]] = mapped_column(String(128))
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_delete: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[Optional[dt]] = mapped_column(DateTime)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)

    # Whether this user is allowed to use the inventory module
    # (botinv). False by default — the flag is enabled MANUALLY
    # in the DB (or, later, via the lib/users admin UI):
    #
    #   UPDATE users SET use_botinv = 1 WHERE login = 'buh';
    #
    # When True:
    #   - the "Инвентаризация" menu item becomes visible;
    #   - the user's dedicated Nav for the botinv module is created
    #     lazily on first access (see botinv/route.py →
    #     _resolve_nav_id_for_botinv).
    #
    # When False (or NULL):
    #   - the menu item is hidden;
    #   - _resolve_nav_id_for_botinv returns 403;
    #   - no Nav is created — 99 users out of 100 never touch the
    #     module, so we do not pollute `nav` with empty rows.
    #
    # NULL is treated the same as False — so existing users do not
    # get access by accident after the migration.
    use_botinv: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)

    # Second-level domain attached by the user (example.com).
    # NULL — the user has not attached a custom domain.
    # The value is a lowercase FQDN. No unique and no index —
    # uniqueness is not enforced here: a domain belongs to a
    # specific person and is verified via DNS.
    domain: Mapped[Optional[str]] = mapped_column(String(253), nullable=True)

    # The user's home page.
    #
    # Used when the user opens their subdomain
    # (<login>.<APP_DOMAIN>) or their custom domain WITHOUT a path —
    # for example, https://testuser3.neurocad-dev.ru/ .
    # In that case the middleware resolves this id and redirects to
    # the public page (/page/<date>/<time>).
    #
    # NULL — no home page set. Then the first page of the nav by
    # datetime ASC is shown; if there is none either — redirect to
    # /core/engine/pages (the article catalog).
    #
    # ondelete='SET NULL' — if the page is deleted, the field is
    # nulled automatically; the user does not end up with a dangling
    # reference.
    home_page_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey('pages.id', ondelete='SET NULL'),
        nullable=True,
    )

    # robots.txt for the third-level domain (<login>.<APP_DOMAIN>).
    #
    # NULL — the user has never opened the robots.txt modal for the
    # subdomain. In that case /robots.txt on the subdomain serves
    # ROBOTS_CLOSED (closed to everyone) — the default for new users.
    #
    # Automatically managed by the domain service:
    #   - add_custom    → robots_3 = ROBOTS_CLOSED (subdomain closed
    #                     while a custom domain is active);
    #   - remove_custom → robots_3 = ROBOTS_OPEN (subdomain open
    #                     again after the custom domain is detached).
    #
    # Text, not String(N): robots.txt content can be long
    # (Allow/Disallow/Crawl-delay/Sitemap across many lines), and
    # no length limit is needed here.
    robots_3: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # robots.txt for the second-level (custom) domain.
    #
    # NULL — the user has never opened the robots.txt modal for the
    # custom domain. In that case /robots.txt on the custom domain
    # serves ROBOTS_CLOSED (closed to everyone).
    #
    # Edited by the user via the modal in
    # Profile → Domains → "Edit robots.txt". The value is stored
    # verbatim (including an empty string) — the backend does not
    # parse or validate robots.txt syntax.
    #
    # When a custom domain is attached (add_custom), this field is
    # initialized to ROBOTS_OPEN if it was NULL. When detached
    # (remove_custom), it is left alone — the text is preserved in
    # case the domain is re-attached later.
    robots_2: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Markdown body of the user's Policy page (e.g. a privacy policy
    # for the user's own site).
    #
    # NULL — the user has never touched the field. The legal modal
    # opens with an empty textarea.
    # "" — the user cleared the field on purpose. The modal also
    # opens with an empty textarea, but the DB keeps "" and NULL
    # as distinct states so "cleared" and "never touched" remain
    # distinguishable.
    #
    # Served publicly at /policy on the user's own host (subdomain
    # or custom domain). NULL on the public side → 404.
    #
    # Edited via the legal modal in
    # Profile → Domains → "Edit policy".
    #
    # Text, not String(N): a policy can be several pages long, and
    # a hard length limit here would only cause trouble later.
    policy: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Markdown body of the user's Rules page (terms of use for the
    # user's own site).
    #
    # Same semantics as `policy`:
    #   - NULL  — never touched, modal opens empty;
    #   - ""    — cleared on purpose, DB state distinct from NULL;
    #   - text  — stored verbatim, served at /rules on the user's
    #             own host (NULL → 404).
    #
    # Edited via the legal modal in
    # Profile → Domains → "Edit rules".
    rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Markdown body of the user's Contacts page (phone / email /
    # address / messengers for the user's own site).
    #
    # Same semantics as `policy` and `rules`:
    #   - NULL  — never touched, modal opens empty;
    #   - ""    — cleared on purpose, DB state distinct from NULL;
    #   - text  — stored verbatim, served at /contacts on the user's
    #             own host (NULL → fallback text).
    #
    # Contacts are stored as free-form markdown — NOT as separate
    # columns (phone / email / address) — because the exact set of
    # fields varies: some users want one phone, others want five
    # messengers, address, working hours, etc. A fixed schema would
    # either be too narrow or full of NULLs. Markdown keeps the
    # model uniform with policy / rules and lets the user shape
    # their own contacts block. If the footer ever needs a
    # machine-readable phone number, it can be parsed from the
    # rendered HTML at render time.
    #
    # Edited via the legal modal in
    # Profile → Domains → "Edit contacts".
    contacts: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index('idx_users_login', 'login'),
        Index('idx_users_is_delete', 'is_delete'),
    )