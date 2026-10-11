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
        SUM(target_actions) per placement.
        """
        async for session in get_db_sqlite():
            stmt = (
                select(
                    Placement.id,
                    Creative.id,
                    Creative.name,
                    Creative.erid,
                    Placement.page_id,
                    func.sum(PlacementStat.shows).label("shows"),
                    func.sum(PlacementStat.clicks).label("clicks"),
                    func.sum(PlacementStat.target_actions).label("target_actions"),
                )
                .join(Creative, Creative.id == Placement.creative_id)
                .join(PlacementStat, PlacementStat.placement_id == Placement.id)
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
                {
                    "placement_id": r[0],
                    "creative_id": r[1],
                    "creative_name": r[2],
                    "erid": r[3],
                    "page_id": r[4],
                    "shows": r[5] or 0,
                    "clicks": r[6] or 0,
                    "target_actions": r[7] or 0,
                }
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