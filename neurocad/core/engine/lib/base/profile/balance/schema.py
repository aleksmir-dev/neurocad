# neurocad/core/engine/lib/base/profile/balance/schema.py

"""
Balance schemas.

Pydantic model describing the `balance` row as returned to the client.

The DB row is in neurocad/core/models/balance.py:
    user_id, tarif (0/1/2/3), day,
    gen, tokens, sum, mb, pages, price,
    refer_id,
    limit_genday, limit_genmon, limit_mb, limit_pages, limit_tokens,
    acc_at, is_delete, updated_at

API:
    GET /core/engine/lib/base/profile/balance/me

Namespace: CoreEngineLibBaseProfileBalance*
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_serializer


# Tariff codes → human-readable labels. Keep in sync with
# neurocad/core/models/balance.py and with
# core/engine/lib/base/profile/balance/tarif/service.py
# (TARIF_PRESETS): 0 free, 1 pro, 2 llm, 3 trial.
TARIF_LABELS = {
    0: "Free",
    1: "Pro",
    2: "LLM",
    3: "Trial",
}


class CoreEngineLibBaseProfileBalanceData(BaseModel):
    """Balance payload returned to the client."""

    user_id: int

    tarif: int = Field(0, description="0 — free, 1 — pro, 2 — llm, 3 — trial")
    tarif_label: str = Field("Free", description="Human-readable tariff name")

    day: Optional[int] = None

    # Remaining balances
    gen: int = 0
    tokens: int = 0
    sum: int = 0
    mb: int = 0
    pages: int = 0

    price: int = 0

    refer_id: Optional[int] = None

    # Limits. 0 means "no limit" for limit_genday / limit_genmon /
    # limit_mb / limit_pages. For limit_tokens, 0 means "no LLM".
    limit_genday: int = 0
    limit_genmon: int = 0
    limit_mb: int = 0
    limit_pages: int = 0
    limit_tokens: int = 0

    acc_at: Optional[date] = None
    updated_at: Optional[datetime] = None

    # Pydantic v2: сериализуем datetime / date → ISO-строку.
    # Иначе Starlette падает с "Object of type datetime is not
    # JSON serializable" — та же проблема, что была в админ-балансе.
    @field_serializer("updated_at", "acc_at")
    def _serialize_dates(self, value):
        if value is None:
            return None
        return value.isoformat()


class CoreEngineLibBaseProfileBalanceResponse(BaseModel):
    """Response for GET /core/engine/lib/base/profile/balance/me."""

    success: bool = True
    data: CoreEngineLibBaseProfileBalanceData