"""
Phase 2 v2 — Admin diagnostic endpoints.

Read-only inspection helpers for cases where a UI number doesn't match
the source-of-truth system (WC admin, QB, Shopify admin). Lets the
analyst confirm what's in our DB without needing CLI / psql access.

Currently exposes:

  GET /api/v2/diagnostics/wc-orders
      Inspect Sani-Tred WCOrder rows for a date range. Returns:
        - count by status
        - count + sum of $0 orders that pass the successful-status
          filter (the most common cause of a +1 order count drift)
        - the rows themselves so you can spot duplicates / phantoms
"""

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.metrics import SUCCESSFUL_WC_STATUSES, WCOrder
from app.models.user import User

router = APIRouter(
    prefix="/v2/diagnostics",
    tags=["v2 · diagnostics"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden — admin only"},
    },
)


@router.get(
    "/wc-orders",
    summary="Inspect Sani-Tred WC orders for a date range (admin only)",
)
async def diagnose_wc_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    date_from: date = Query(..., description="ISO date — inclusive"),
    date_to: date = Query(..., description="ISO date — inclusive"),
) -> Dict[str, Any]:
    """
    Five rollups in one response so the analyst can see the full
    picture for a date range:

      1. status_breakdown — count + sum per status, ALL rows in range
      2. successful_total — count + sum after the dashboard's filter
      3. zero_total_in_filter — number of rows that pass the status
         filter but have total=0 (the +1 phantom-order culprit)
      4. duplicate_order_ids — order_id values appearing more than once
      5. rows — every row with a non-NULL date in the window, capped
         at 200, so you can read the data directly
    """
    base_where = and_(
        WCOrder.date_created >= date_from,
        WCOrder.date_created <= date_to,
        WCOrder.division == "sanitred",
    )

    # 1. Per-status rollup — every status that appears in the window
    status_q = await db.execute(
        select(
            WCOrder.status,
            func.count(WCOrder.id).label("count"),
            func.coalesce(func.sum(WCOrder.total), 0).label("revenue"),
        ).where(base_where).group_by(WCOrder.status).order_by(WCOrder.status)
    )
    status_breakdown = [
        {"status": r.status, "count": int(r.count or 0), "revenue": round(float(r.revenue or 0), 2)}
        for r in status_q.all()
    ]

    # 2. After the dashboard's filter (status IN successful)
    succ_q = await db.execute(
        select(
            func.count(WCOrder.id),
            func.coalesce(func.sum(WCOrder.total), 0),
        ).where(and_(base_where, WCOrder.status.in_(SUCCESSFUL_WC_STATUSES)))
    )
    succ_count, succ_revenue = succ_q.one()
    successful_total = {
        "count": int(succ_count or 0),
        "revenue": round(float(succ_revenue or 0), 2),
    }

    # 2b. After the new full filter (status IN successful AND total > 0)
    succ_nz_q = await db.execute(
        select(
            func.count(WCOrder.id),
            func.coalesce(func.sum(WCOrder.total), 0),
        ).where(and_(
            base_where,
            WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            WCOrder.total > 0,
        ))
    )
    succ_nz_count, succ_nz_revenue = succ_nz_q.one()
    successful_nonzero_total = {
        "count": int(succ_nz_count or 0),
        "revenue": round(float(succ_nz_revenue or 0), 2),
    }

    # 3. The phantom $0 orders that pass the status filter
    phantom_q = await db.execute(
        select(
            WCOrder.id,
            WCOrder.order_id,
            WCOrder.order_number,
            WCOrder.status,
            WCOrder.total,
            WCOrder.items_count,
            WCOrder.date_created,
        )
        .where(and_(
            base_where,
            WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            WCOrder.total <= 0,
        ))
        .order_by(WCOrder.date_created)
    )
    zero_total_rows = [
        {
            "id": r.id,
            "order_id": r.order_id,
            "order_number": r.order_number,
            "status": r.status,
            "total": float(r.total or 0),
            "items_count": r.items_count,
            "date_created": r.date_created.isoformat() if r.date_created else None,
        }
        for r in phantom_q.all()
    ]

    # 4. Duplicate order_id check (the unique constraint should prevent
    # this but verify defensively)
    dup_q = await db.execute(
        select(WCOrder.order_id, func.count(WCOrder.id).label("dup_count"))
        .where(base_where)
        .group_by(WCOrder.order_id)
        .having(func.count(WCOrder.id) > 1)
    )
    duplicate_order_ids = [
        {"order_id": r.order_id, "rows_in_db": int(r.dup_count or 0)}
        for r in dup_q.all()
    ]

    # 5. Raw rows so the analyst can scan
    rows_q = await db.execute(
        select(
            WCOrder.id,
            WCOrder.order_id,
            WCOrder.order_number,
            WCOrder.status,
            WCOrder.total,
            WCOrder.items_count,
            WCOrder.date_created,
        )
        .where(base_where)
        .order_by(WCOrder.date_created, WCOrder.id)
        .limit(200)
    )
    rows: List[Dict[str, Any]] = [
        {
            "id": r.id,
            "order_id": r.order_id,
            "order_number": r.order_number,
            "status": r.status,
            "total": float(r.total or 0),
            "items_count": r.items_count,
            "date_created": r.date_created.isoformat() if r.date_created else None,
        }
        for r in rows_q.all()
    ]

    return {
        "window": {
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        },
        "status_breakdown": status_breakdown,
        "successful_total": successful_total,
        "successful_nonzero_total": successful_nonzero_total,
        "delta": {
            "count": successful_total["count"] - successful_nonzero_total["count"],
            "explanation": (
                "If non-zero count is lower, those rows are $0 orders the new "
                "filter excludes. They appear in zero_total_rows below."
            ),
        },
        "zero_total_rows": zero_total_rows,
        "duplicate_order_ids": duplicate_order_ids,
        "rows_sample": rows,
        "rows_returned": len(rows),
    }
