# neurocad/core/engine/lib/balance/paid/schema.py

"""
Balance paid schemas (admin, superadmin-only).

Pydantic models for the "Оплата" modal:

    POST /core/engine/lib/balance/paid/{user_id}

The payload is a single integer `amount` — the sum to add to
the user's balance. Creates the Balance row if missing.

URL:
    POST /core/engine/lib/balance/paid/{user_id}

Namespace: CoreEngineLibBalancePaid*
"""

from typing import Optional
from pydantic import BaseModel, Field


# ============================================
# PAYLOAD
# ============================================

class CoreEngineLibBalancePaidData(BaseModel):
    """
    Request body for POST /core/engine/lib/balance/paid/{user_id}.

    amount — how much to add to the user's `sum` field.
    Must be a positive integer (1 or more).
    """

    amount: int = Field(
        ...,
        ge=1,
        description="Сумма пополнения (положительное целое, ≥ 1)",
    )


# ============================================
# RESPONSE
# ============================================

class CoreEngineLibBalancePaidResponse(BaseModel):
    """
    Response for POST /core/engine/lib/balance/paid/{user_id}.

    data    — the updated Balance row (same shape as list item).
    message — human-readable confirmation for the client.
    """

    success: bool = True
    data: Optional[dict] = None
    message: Optional[str] = None