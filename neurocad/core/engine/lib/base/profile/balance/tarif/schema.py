# neurocad/core/engine/lib/base/profile/balance/tarif/schema.py

"""
Tariff change schemas.

Endpoints:
    GET  /core/engine/lib/base/profile/balance/tarif/list
    POST /core/engine/lib/base/profile/balance/tarif/change

GET /list returns:
    - the list of available tariffs with prices and limits;
    - the current user's tariff and `sum` (to show in the modal);
    - the SBP payment URL (from env) — for the "недостаточно средств" case;
    - the SBP QR image URL (from media/<nav_id>/qr.png) — if the
      admin has uploaded one.

POST /change accepts { tarif: int } and switches the user's tariff.
Limits are overwritten with TARIF_PRESETS[new_tarif]; balances
(gen, tokens, sum, mb, pages) are NOT touched.

Tariff codes:
    3 — trial  (1-day trial, same limits as llm; not selectable manually)
    0 — free
    1 — pro
    2 — llm

The UI must show them in the order 3, 0, 1, 2 (trial first).

Prices are in RUBLES (integer, no kopecks) — matches Balance.sum.

Namespace: CoreEngineLibBaseProfileBalanceTarif*
"""

from typing import List, Optional
from pydantic import BaseModel, Field


# ============================================
# TARIF CONSTANTS
# ============================================

TARIF_PRICES = {
    3: 0,      # trial — free, 1 day
    0: 0,      # free
    1: 500,    # pro,  ₽
    2: 1000,   # llm,  ₽
}

TARIF_LABELS = {
    3: "Trial",
    0: "Free",
    1: "Pro",
    2: "LLM",
}

TARIF_DESCRIPTIONS = {
    3: "Пробный доступ на 1 день. Все возможности LLM.",
    0: "Базовый доступ. 1 статья, без LLM.",
    1: "Генерации в день, больше места и статей.",
    2: "Полный доступ: LLM-токены, генерации, без ограничений.",
}

#: Display order for the tariff list. Trial first, then free, pro, llm.
TARIF_ORDER = [3, 0, 1, 2]


# ============================================
# GET /list — RESPONSE
# ============================================

class CoreEngineLibBaseProfileBalanceTarifItem(BaseModel):
    """One tariff option shown in the modal."""

    tarif: int = Field(..., description="3 — trial, 0 — free, 1 — pro, 2 — llm")
    label: str
    description: str
    price: int = Field(..., description="Price in rubles")

    # Limits that would be applied if this tariff is chosen.
    # 0 means "no limit" for limit_genday / limit_genmon /
    # limit_mb / limit_pages. For limit_tokens, 0 means "no LLM".
    limit_genday: int = 0
    limit_genmon: int = 0
    limit_mb: int = 0
    limit_pages: int = 0
    limit_tokens: int = 0


class CoreEngineLibBaseProfileBalanceTarifListResponse(BaseModel):
    """
    Response for GET /core/engine/lib/base/profile/balance/tarif/list.

    current_tarif — the user's current tariff (to highlight it in UI).
    sum           — current balance in rubles (to check affordability).
    sbp_url       — SBP payment URL from env; may be None.
    sbp_qr        — public URL of the SBP QR image (media/<nav_id>/qr.png);
                    may be None if the admin hasn't uploaded one.
    """

    success: bool = True
    tarifs: List[CoreEngineLibBaseProfileBalanceTarifItem]
    current_tarif: int
    sum: int
    sbp_url: Optional[str] = None
    sbp_qr: Optional[str] = None


# ============================================
# POST /change — REQUEST / RESPONSE
# ============================================

class CoreEngineLibBaseProfileBalanceTarifChangeData(BaseModel):
    """
    Request body for POST /tarif/change.

    Allowed values: 0 (free), 1 (pro), 2 (llm).
    Trial (3) is NOT allowed — it is granted only automatically
    on registration and cannot be selected by the user.
    """

    tarif: int = Field(
        ...,
        ge=0,
        le=2,
        description="0 — free, 1 — pro, 2 — llm",
    )


class CoreEngineLibBaseProfileBalanceTarifChangeResponse(BaseModel):
    """
    Response for POST /tarif/change.

    data — the updated balance row (same shape as the profile balance
           endpoint), so the client can refresh the screen without
           another request.
    """

    success: bool = True
    data: Optional[dict] = None
    message: Optional[str] = None