# neurocad/core/engine/lib/creatives/service.py

"""
Service for creatives, placements and placement stats.

Namespace: CoreEngineLibCreativesService

Entities:
  - Creative — advertising creative (name, erid, target_url, ...).
  - Placement — a creative on a specific page.
  - PlacementStat — placement statistics per day.

All methods are async and use get_db_sqlite.
"""

from datetime import datetime, date
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func

from ....models.base import Creative, Placement, PlacementStat
from ....models.base import Page
from .....utils.sqlite import get_db_sqlite


class CoreEngineLibCreativesService:
    """Static service for creatives and placements."""

    # ============================================
    # CREATIVES
    # ============================================

    @staticmethod
    async def list_creatives(nav_id: int) -> List[Dict[str, Any]]:
        """All active creatives of the nav."""
        async for session in get_db_sqlite():
            stmt = (
                select(Creative)
                .where(
                    Creative.nav_id == nav_id,
                    Creative.is_delete == 0,
                )
                .order_by(Creative.created_at.desc())
            )
            rows = (await session.execute(stmt)).scalars().all()
            return [
                CoreEngineLibCreativesService._creative_to_dict(c)
                for c in rows
            ]
        return []

    @staticmethod
    async def create_creative(
        nav_id: int,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Create a creative."""
        async for session in get_db_sqlite():
            c = Creative(
                nav_id=nav_id,
                name=(data.get("name") or "").strip(),
                erid=(data.get("erid") or "").strip() or None,
                description=data.get("description"),
                target_url=data.get("target_url"),
                media_file=data.get("media_file"),
                is_active=int(data.get("is_active", 1)),
                is_delete=0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
                # ---- Контент блока «Креатив» ----
                text=data.get("text"),
                button_text=(data.get("button_text") or "").strip() or None,
                # ---- Юридические реквизиты ----
                brand=(data.get("brand") or "").strip() or None,
                inn=(data.get("inn") or "").strip() or None,
            )
            session.add(c)
            await session.commit()
            await session.refresh(c)
            return CoreEngineLibCreativesService._creative_to_dict(c)
        return None

    @staticmethod
    async def update_creative(
        creative_id: int,
        nav_id: int,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Update a creative."""
        async for session in get_db_sqlite():
            stmt = select(Creative).where(
                Creative.id == creative_id,
                Creative.nav_id == nav_id,
                Creative.is_delete == 0,
            )
            c = (await session.execute(stmt)).scalar_one_or_none()
            if not c:
                return None

            # Строковые поля, которые нужно strip-ить. Для них
            # пустая строка после strip = None (не сохраняем
            # пустые значения — они эквивалентны отсутствию).
            #
            #   name         — обязательно, но strip-им и проверяем
            #                  на пустоту: если после strip пусто,
            #                  оставляем как есть (валидация уже
            #                  прошла через Pydantic min_length=1);
            #   erid         — необязательно;
            #   button_text  — необязательно;
            #   brand        — необязательно;
            #   inn          — необязательно.
            #
            # target_url и media_file тоже strip-им, но не превращаем
            # пустое в None — там может быть значимая пустая строка
            # (крайне редко, но возможно).
            strip_fields = {
                "name", "erid", "button_text", "brand", "inn",
            }
            passthrough_fields = {
                "description", "target_url", "media_file", "text",
            }

            for key in strip_fields:
                if key in data:
                    val = data[key]
                    if isinstance(val, str):
                        val = val.strip() or None
                    setattr(c, key, val)

            for key in passthrough_fields:
                if key in data:
                    setattr(c, key, data[key])

            if "is_active" in data:
                c.is_active = int(data["is_active"])

            c.updated_at = datetime.now()
            await session.commit()
            await session.refresh(c)
            return CoreEngineLibCreativesService._creative_to_dict(c)
        return None

    @staticmethod
    async def delete_creative(creative_id: int, nav_id: int) -> bool:
        """Soft-delete a creative."""
        async for session in get_db_sqlite():
            stmt = select(Creative).where(
                Creative.id == creative_id,
                Creative.nav_id == nav_id,
                Creative.is_delete == 0,
            )
            c = (await session.execute(stmt)).scalar_one_or_none()
            if not c:
                return False
            c.is_delete = 1
            c.updated_at = datetime.now()
            await session.commit()
            return True
        return False

    # ============================================
    # PLACEMENTS
    # ============================================

    @staticmethod
    async def list_placements(
        nav_id: int,
        creative_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """All placements of the nav (optionally for one creative)."""
        async for session in get_db_sqlite():
            stmt = (
                select(Placement, Creative)
                .join(Creative, Creative.id == Placement.creative_id)
                .where(
                    Creative.nav_id == nav_id,
                    Placement.is_delete == 0,
                    Creative.is_delete == 0,
                )
            )
            if creative_id is not None:
                stmt = stmt.where(Placement.creative_id == creative_id)

            stmt = stmt.order_by(Placement.created_at.desc())
            rows = (await session.execute(stmt)).all()

            return [
                CoreEngineLibCreativesService._placement_to_dict(p, c)
                for p, c in rows
            ]
        return []

    @staticmethod
    async def create_placement(
        nav_id: int,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Create a placement."""
        creative_id = data.get("creative_id")
        page_id = data.get("page_id")
        if not creative_id or not page_id:
            return None

        async for session in get_db_sqlite():
            # Ensure the creative belongs to this nav.
            c_stmt = select(Creative).where(
                Creative.id == creative_id,
                Creative.nav_id == nav_id,
                Creative.is_delete == 0,
            )
            c = (await session.execute(c_stmt)).scalar_one_or_none()
            if not c:
                return None

            p = Placement(
                creative_id=creative_id,
                page_id=page_id,
                date_start=data.get("date_start"),
                date_end=data.get("date_end"),
                is_active=int(data.get("is_active", 1)),
                is_delete=0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(p)
            await session.commit()
            await session.refresh(p)
            return CoreEngineLibCreativesService._placement_to_dict(p, c)
        return None

    @staticmethod
    async def update_placement(
        placement_id: int,
        nav_id: int,
        data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Update a placement."""
        async for session in get_db_sqlite():
            stmt = (
                select(Placement, Creative)
                .join(Creative, Creative.id == Placement.creative_id)
                .where(
                    Placement.id == placement_id,
                    Creative.nav_id == nav_id,
                    Placement.is_delete == 0,
                )
            )
            row = (await session.execute(stmt)).one_or_none()
            if not row:
                return None
            p, c = row

            if "page_id" in data:
                p.page_id = data["page_id"]
            if "date_start" in data:
                p.date_start = data["date_start"]
            if "date_end" in data:
                p.date_end = data["date_end"]
            if "is_active" in data:
                p.is_active = int(data["is_active"])

            p.updated_at = datetime.now()
            await session.commit()
            await session.refresh(p)
            return CoreEngineLibCreativesService._placement_to_dict(p, c)
        return None

    @staticmethod
    async def delete_placement(placement_id: int, nav_id: int) -> bool:
        """Soft-delete a placement."""
        async for session in get_db_sqlite():
            stmt = (
                select(Placement)
                .join(Creative, Creative.id == Placement.creative_id)
                .where(
                    Placement.id == placement_id,
                    Creative.nav_id == nav_id,
                    Placement.is_delete == 0,
                )
            )
            p = (await session.execute(stmt)).scalar_one_or_none()
            if not p:
                return False
            p.is_delete = 1
            p.updated_at = datetime.now()
            await session.commit()
            return True
        return False

    # ============================================
    # HITS — counter increment
    # ============================================

    @staticmethod
    async def register_hit(placement_id: int, hit_type: str) -> bool:
        """
        Register a hit (show / click) for today.

        Creates a PlacementStat row for today if it does not exist
        yet, then increments the corresponding counter.

        hit_type: "show" | "click"
        """
        if hit_type not in ("show", "click"):
            return False

        today = date.today()

        async for session in get_db_sqlite():
            # Ensure the placement exists and is not deleted.
            p_stmt = select(Placement).where(
                Placement.id == placement_id,
                Placement.is_delete == 0,
            )
            p = (await session.execute(p_stmt)).scalar_one_or_none()
            if not p:
                return False

            # Find the stat row for today.
            s_stmt = select(PlacementStat).where(
                PlacementStat.placement_id == placement_id,
                PlacementStat.date == today,
            )
            stat = (await session.execute(s_stmt)).scalar_one_or_none()

            if not stat:
                stat = PlacementStat(
                    placement_id=placement_id,
                    date=today,
                    shows=0,
                    clicks=0,
                    target_actions=0,
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                session.add(stat)

            if hit_type == "show":
                stat.shows = (stat.shows or 0) + 1
            elif hit_type == "click":
                stat.clicks = (stat.clicks or 0) + 1

            stat.updated_at = datetime.now()
            await session.commit()
            return True
        return False

    # ============================================
    # STATS — report for a period
    # ============================================

    @staticmethod
    async def get_stats(
        nav_id: int,
        date_from: date,
        date_to: date,
    ) -> List[Dict[str, Any]]:
        """
        Report over placements for the period [date_from, date_to].

        Returns a list with SUM(shows) / SUM(clicks) /
        SUM(target_actions) per placement, plus the destination
        page's title and public URL.

        `page_title` — Page.title, or None when the page has been
        soft-deleted since the stats were accumulated. The row is
        still returned (with page_title=None) so historical numbers
        are not lost.

        `page_url` — absolute public URL of the page on the owner's
        public host, built from the SAME base as the sitemap and
        the "Open article catalog" button:

            https://<login>.<ROOT_DOMAIN>/page/<YYYYMMDD>/<HHMMSS>
            https://<custom-domain>/page/<YYYYMMDD>/<HHMMSS>

        None when:
          - the page has no datetime (should not happen for a live
            page — datetime is NOT NULL — but folders are excluded
            from placements anyway);
          - the nav owner or their public base URL cannot be
            resolved (a misconfigured account, or a nav whose user
            was soft-deleted).

        The public base is resolved ONCE for the whole report — not
        per row. `get_public_base_url` is a chain of a few queries
        (users.domain, then settings.APP_DOMAIN); calling it for
        every row would multiply the cost of a report that is
        usually small but should not be O(n) in network-bound work.
        """
        # Resolve the public base once. Imported lazily to keep the
        # creatives module independent of the domain service at
        # import time (domain.service imports httpx/ssl — heavy).
        public_base = await CoreEngineLibCreativesService._public_base_for_nav(
            nav_id
        )

        async for session in get_db_sqlite():
            stmt = (
                select(
                    Placement.id,
                    Creative.id,
                    Creative.name,
                    Creative.erid,
                    Placement.page_id,
                    Page.title,
                    Page.datetime,
                    func.sum(PlacementStat.shows).label("shows"),
                    func.sum(PlacementStat.clicks).label("clicks"),
                    func.sum(PlacementStat.target_actions).label("target_actions"),
                )
                .join(Creative, Creative.id == Placement.creative_id)
                .join(PlacementStat, PlacementStat.placement_id == Placement.id)
                # LEFT JOIN — a placement whose page was deleted still
                # shows up in the report, with page_title=None and
                # page_url=None. An INNER JOIN would silently drop
                # those rows and shrink the totals.
                .outerjoin(Page, Page.id == Placement.page_id)
                .where(
                    Creative.nav_id == nav_id,
                    Placement.is_delete == 0,
                    Creative.is_delete == 0,
                    PlacementStat.date >= date_from,
                    PlacementStat.date <= date_to,
                )
                .group_by(Placement.id, Creative.id)
                .order_by(Creative.name, Placement.page_id)
            )
            rows = (await session.execute(stmt)).all()

            return [
                CoreEngineLibCreativesService._stats_row_to_dict(
                    r,
                    public_base=public_base,
                )
                for r in rows
            ]
        return []

    @staticmethod
    async def set_target_actions(
        placement_id: int,
        nav_id: int,
        on_date: date,
        count: int,
    ) -> bool:
        """
        Manual input of target actions for a specific day.

        If a row for that day does not exist — creates it.
        """
        async for session in get_db_sqlite():
            # Ensure the placement belongs to this nav.
            p_stmt = (
                select(Placement)
                .join(Creative, Creative.id == Placement.creative_id)
                .where(
                    Placement.id == placement_id,
                    Creative.nav_id == nav_id,
                    Placement.is_delete == 0,
                )
            )
            p = (await session.execute(p_stmt)).scalar_one_or_none()
            if not p:
                return False

            s_stmt = select(PlacementStat).where(
                PlacementStat.placement_id == placement_id,
                PlacementStat.date == on_date,
            )
            stat = (await session.execute(s_stmt)).scalar_one_or_none()

            if not stat:
                stat = PlacementStat(
                    placement_id=placement_id,
                    date=on_date,
                    shows=0,
                    clicks=0,
                    target_actions=int(count),
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                session.add(stat)
            else:
                stat.target_actions = int(count)
                stat.updated_at = datetime.now()

            await session.commit()
            return True
        return False

    # ============================================
    # HELPERS
    # ============================================

    @staticmethod
    async def _public_base_for_nav(nav_id: int) -> Optional[str]:
        """
        Resolve the public base URL (no trailing slash) for the
        owner of a nav, or None.

        Delegates to the domain service's get_public_base_url,
        which already knows the rule (custom domain, else
        https://<login>.<ROOT_DOMAIN>). We resolve the nav's user_id
        here — one cheap query — because the creatives report is
        keyed by nav, not by user.

        Never raises: any failure (nav not found, user soft-deleted,
        settings misconfigured) is treated as "no public base", and
        the caller falls back to page_url=None.
        """
        # Late import — the domain service pulls in httpx/ssl/socket
        # and would slow down every import of this module.
        from ....base.profile.domain.service.facade import (
            CoreEngineLibBaseProfileDomainService,
        )

        async for session in get_db_sqlite():
            # Nav owner.
            from ....models.nav import Nav

            u_stmt = select(Nav.user_id).where(
                Nav.id == nav_id,
                Nav.is_delete.is_(False),
            )
            user_id = (await session.execute(u_stmt)).scalar_one_or_none()
            if user_id is None:
                return None
            break

        try:
            return await CoreEngineLibBaseProfileDomainService.get_public_base_url(
                user_id
            )
        except Exception:
            return None

    @staticmethod
    def _stats_row_to_dict(
        row,
        public_base: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Turn one row of the get_stats query into a JSON-safe dict.

        The query returns a tuple in a fixed order:

            [0] placement_id       int
            [1] creative_id        int
            [2] creative_name      str
            [3] erid               str | None
            [4] page_id            int
            [5] page_title         str | None   (from LEFT JOIN)
            [6] page_datetime      datetime | None (from LEFT JOIN)
            [7] shows              int | None
            [8] clicks             int | None
            [9] target_actions     int | None

        Aggregations come back as NULL when there are no matching
        stats rows — we coalesce to 0.

        `page_url` is built only when both `public_base` and the
        page's datetime are known. Otherwise it stays None, and the
        frontend renders the page id as plain text (no link).
        """
        page_id = row[4]
        page_title = row[5]
        page_dt = row[6]

        page_url: Optional[str] = None
        if public_base and page_dt is not None:
            try:
                date_part = page_dt.strftime("%Y%m%d")
                time_part = page_dt.strftime("%H%M%S")
                page_url = f"{public_base}/page/{date_part}/{time_part}"
            except Exception:
                page_url = None

        return {
            "placement_id": row[0],
            "creative_id": row[1],
            "creative_name": row[2],
            "erid": row[3],
            "page_id": page_id,
            "page_title": page_title,
            "page_url": page_url,
            "shows": row[7] or 0,
            "clicks": row[8] or 0,
            "target_actions": row[9] or 0,
        }

    @staticmethod
    def _creative_to_dict(c: Creative) -> Dict[str, Any]:
        return {
            "id": c.id,
            "nav_id": c.nav_id,
            "name": c.name,
            "erid": c.erid,
            "description": c.description,
            "target_url": c.target_url,
            "media_file": c.media_file,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            # ---- Контент блока «Креатив» ----
            "text": c.text,
            "button_text": c.button_text,
            # ---- Юридические реквизиты ----
            "brand": c.brand,
            "inn": c.inn,
        }

    @staticmethod
    def _placement_to_dict(
        p: Placement,
        c: Optional[Creative] = None,
    ) -> Dict[str, Any]:
        data = {
            "id": p.id,
            "creative_id": p.creative_id,
            "page_id": p.page_id,
            "date_start": p.date_start.isoformat() if p.date_start else None,
            "date_end": p.date_end.isoformat() if p.date_end else None,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        if c is not None:
            data["creative_name"] = c.name
            data["erid"] = c.erid
        return data