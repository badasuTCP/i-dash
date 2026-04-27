"""
Phase 2 — /api/v2/projections.

Read-only over the metrics_projections table populated by
services/forecasting_service.run_projection_pass(). Plus a manual
trigger endpoint guarded to admin only — useful for "run a fresh
projection now without waiting for the scheduler."

The frontend does NOT consume this yet (Hard Freeze through demo).
"""

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.projections import MetricsProjection
from app.models.user import User
from app.services.forecasting_service import run_projection_pass

router = APIRouter(
    prefix="/v2/projections",
    tags=["v2 · projections"],
    responses={
        401: {"description": "Unauthorized"},
    },
)


@router.get(
    "",
    summary="List the most recent month-end projections",
)
async def list_projections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    metric_type: Optional[str] = Query(None, description="'spend' | 'leads'"),
    division: Optional[str] = Query(None, description="'cp' | 'sanitred' | 'ibos' | 'all'"),
    period_start: Optional[date] = Query(None, description="ISO date — match a specific month start"),
) -> Dict[str, Any]:
    """
    Return the latest projection rows.

    Filters are optional and AND-combined. With no filters this returns
    every (metric × division) projection currently stored, sorted by
    last_updated descending.
    """
    stmt = select(MetricsProjection)
    if metric_type:
        stmt = stmt.where(MetricsProjection.metric_type == metric_type)
    if division:
        stmt = stmt.where(MetricsProjection.division == division)
    if period_start:
        stmt = stmt.where(MetricsProjection.period_start == period_start)
    stmt = stmt.order_by(desc(MetricsProjection.last_updated))

    rows = (await db.execute(stmt)).scalars().all()

    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append({
            "id": r.id,
            "metric_type": r.metric_type,
            "division": r.division,
            "period_start": r.period_start.isoformat(),
            "period_end": r.period_end.isoformat(),
            "as_of": r.as_of.isoformat(),
            "mtd_actual": r.mtd_actual,
            "run_rate_daily": r.run_rate_daily,
            "days_observed": r.days_observed,
            "projected_total": r.projected_total,
            "days_remaining": r.days_remaining,
            "confidence": r.confidence,
            "notes": r.notes,
            "last_updated": r.last_updated.isoformat() if r.last_updated else None,
        })

    return {"projections": items, "count": len(items)}


@router.post(
    "/run",
    summary="Manually trigger a projection pass (admin only)",
)
async def trigger_projection_pass(
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> Dict[str, Any]:
    """Refresh every projection row right now. Same logic the scheduler runs."""
    return await run_projection_pass()
