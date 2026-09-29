# neurocad/core/engine/lib/balance/edit/schema.py

"""
Balance edit schemas (admin, superadmin-only).

Pydantic models for the edit modal:

    PUT /core/engine/lib/balance/edit/{user_id}

The payload is the full set of Balance fields — the client sends
everything it shows in the form. The server upserts: creates the
row if it doesn't exist, updates it otherwise.

All fields are optional: the client may send only what it changed,
or the whole document. Missing/None fields keep the current value
on update, or fall back to model defaults on create.

Note:
    `day`, `refer_id`, `acc_at` are nullable — sending None means
    "clear". Everything else is non-null — sending None means
    "keep current".

URL:
    PUT /core/engine/lib/balance/edit/{user_id}
    GET /core/engine/lib/balance/edit/{user_id}

Namespace: CoreEngineLibBalanceEdit*
"""

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


# ============================================
# PAYLOAD
# ============================================

class CoreEngineLibBalanceEditData(BaseModel):
    """
    Full editable payload for a single Balance row.

    Mirrors the fields of neurocad/core/models/balance.py, minus
    user_id (comes from the URL) and updated_at (server-managed).
    """

    tarif: int = Field(0, description="0 — free, 1 — pro, 2 — llm")
    day: Optional[int] = Field(None, description="Расчётный день месяца (1–31)")

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

    # Accrual anchor — date of the last lazy reset.
    # Nullable: None means "clear" (reset to null).
    acc_at: Optional[date] = None

    # Soft delete
    is_delete: bool = False


# ============================================
# RESPONSE
# ============================================

class CoreEngineLibBalanceEditResponse(BaseModel):
    """
    Response for GET / PUT /core/engine/lib/balance/edit/{user_id}.

    `data` — the current (or just-saved) state of the row,
    in the same shape as one item of the list endpoint.
    """

    success: bool = True
    data: Optional[dict] = None