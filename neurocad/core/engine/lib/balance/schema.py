# neurocad/core/engine/lib/balance/schema.py

"""
Balance schemas (admin, superadmin-only).

Pydantic models for the balance admin page:

  LIST:
    GET /core/engine/lib/balance/list
    → returns all users (LEFT JOIN balance) with a zeroed default
      for users without a Balance row.

  EDIT (in edit/):
    PUT /core/engine/lib/balance/edit/{user_id}
    → upsert: creates a Balance row if missing, updates otherwise.

  PAID (in paid/):
    POST /core/engine/lib/balance/paid/{user_id}
    → sum += amount.

Naming:
  CoreEngineLibBalance*  — admin module classes.
  (Distinct from CoreEngineLibBaseProfileBalance* — the user-facing
  profile balance section.)

Tarif codes (see neurocad/core/models/balance.py):
  3 — trial
  0 — free
  1 — pro
  2 — llm

Datetime / date serialization:
  All datetime and date fields are serialized to ISO strings via
  @field_serializer. This makes model_dump() JSON-safe by default
  — no need for mode="json" at every call site (and no risk of
  forgetting it).

API:
  GET /core/engine/lib/balance/list

Namespace: CoreEngineLibBalance*
"""

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_serializer


# ============================================
# TARIF
# ============================================

TARIF_LABELS = {
    3: "Trial",
    0: "Free",
    1: "Pro",
    2: "LLM",
}


# ============================================
# LIST ITEM
# ============================================

class CoreEngineLibBalanceListItem(BaseModel):
    """
    One row of the balance admin table.

    Combines user identity (login, name) with the Balance fields.
    For users without a Balance row — all numeric fields are 0
    and `has_balance` is False.
    """

    # --- User identity ---
    user_id: int
    login: Optional[str] = None
    name: Optional[str] = None
    is_superadmin: bool = False

    # True if a real Balance row exists for this user.
    has_balance: bool = False

    # --- Balance fields ---
    tarif: int = Field(0, description="3 — trial, 0 — free, 1 — pro, 2 — llm")
    tarif_label: str = Field("Free", description="Human-readable tariff name")

    day: Optional[int] = None

    gen: int = 0
    tokens: int = 0
    sum: int = 0
    mb: int = 0
    pages: int = 0

    price: int = 0

    refer_id: Optional[int] = None

    limit_genday: int = 0
    limit_genmon: int = 0
    limit_mb: int = 0
    limit_pages: int = 0
    limit_tokens: int = 0

    acc_at: Optional[date] = None

    is_delete: bool = False

    updated_at: Optional[datetime] = None

    # Pydantic v2: сериализуем datetime / date → ISO-строку.
    # Без этого model_dump() оставляет datetime как объект,
    # и Starlette падает с "Object of type datetime is not JSON
    # serializable". Правило проекта: все datetime- и date-поля
    # уходят на клиент строками.
    @field_serializer("updated_at", "acc_at")
    def _serialize_dates(self, value):
        if value is None:
            return None
        return value.isoformat()


# ============================================
# LIST RESPONSE
# ============================================

class CoreEngineLibBalanceListResponse(BaseModel):
    """Response for GET /core/engine/lib/balance/list."""

    success: bool = True
    data: List[CoreEngineLibBalanceListItem]
    total: int = 0


# ============================================
# HELPERS
# ============================================

def tarif_label(tarif: Optional[int]) -> str:
    """Human-readable tariff name for a tarif code."""
    return TARIF_LABELS.get(tarif if tarif is not None else 0, "Free")