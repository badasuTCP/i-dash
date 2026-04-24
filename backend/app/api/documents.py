"""
Admin-only Documents API — browse raw Google Sheet data as ingested.

Exposes read-only views over the `google_sheet_metrics` table so the
data-analyst role (and Molly in a future audit pass) can verify that
what the Executive Summary trims or aggregates matches the source.

Two endpoints:

  GET /api/documents/sheets
      → list of distinct sheet_name with row counts + latest fetched_at

  GET /api/documents/sheets/{sheet_name}
      → full rows for one sheet, newest first, paginated

Gated to `admin` role (frontend `data-analyst`) — the raw sheet data
includes finance / operational numbers that non-admin roles should not
see in unaggregated form.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.metrics import GoogleSheetMetric
from app.models.user import User


router = APIRouter(
    prefix="/documents",
    tags=["documents"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden — admin only"},
    },
)


@router.get(
    "/sheets",
    summary="List all Google Sheet data sources ingested into I-Dash",
)
async def list_sheets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> Dict[str, Any]:
    """
    Return one entry per distinct sheet_name in google_sheet_metrics.

    For each sheet we include:
      - sheet_name
      - row_count (total metric rows ingested for that sheet)
      - last_fetched (most recent fetched_at — how fresh is this source)
      - earliest_date, latest_date (date range of the metrics themselves)
      - distinct_metric_count (how many unique metric_name values)
    """
    stmt = (
        select(
            GoogleSheetMetric.sheet_name,
            func.count(GoogleSheetMetric.id).label("row_count"),
            func.max(GoogleSheetMetric.fetched_at).label("last_fetched"),
            func.min(GoogleSheetMetric.date).label("earliest_date"),
            func.max(GoogleSheetMetric.date).label("latest_date"),
            func.count(func.distinct(GoogleSheetMetric.metric_name)).label("distinct_metric_count"),
        )
        .group_by(GoogleSheetMetric.sheet_name)
        .order_by(GoogleSheetMetric.sheet_name.asc())
    )
    rows = (await db.execute(stmt)).all()

    sheets: List[Dict[str, Any]] = []
    for r in rows:
        sheets.append({
            "sheet_name": r.sheet_name,
            "row_count": int(r.row_count or 0),
            "last_fetched": r.last_fetched.isoformat() if r.last_fetched else None,
            "earliest_date": r.earliest_date.isoformat() if r.earliest_date else None,
            "latest_date": r.latest_date.isoformat() if r.latest_date else None,
            "distinct_metric_count": int(r.distinct_metric_count or 0),
        })

    return {"sheets": sheets, "total": len(sheets)}


@router.get(
    "/sheets/{sheet_name:path}",
    summary="Raw rows from one Google Sheet source",
)
async def get_sheet_rows(
    sheet_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """
    Return raw metric rows for a specific sheet_name, newest first.

    Path parameter uses ``:path`` so sheet names containing ``::``
    (e.g. ``exec::TCP MAIN``, ``qb_revenue::Bohs``) pass through
    without URL-escaping issues.
    """
    total_q = await db.execute(
        select(func.count(GoogleSheetMetric.id))
        .where(GoogleSheetMetric.sheet_name == sheet_name)
    )
    total = int(total_q.scalar() or 0)
    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No rows found for sheet '{sheet_name}'",
        )

    rows_q = await db.execute(
        select(
            GoogleSheetMetric.id,
            GoogleSheetMetric.date,
            GoogleSheetMetric.metric_name,
            GoogleSheetMetric.metric_value,
            GoogleSheetMetric.category,
            GoogleSheetMetric.fetched_at,
        )
        .where(GoogleSheetMetric.sheet_name == sheet_name)
        .order_by(desc(GoogleSheetMetric.date), GoogleSheetMetric.metric_name.asc())
        .limit(limit)
        .offset(offset)
    )

    rows: List[Dict[str, Any]] = []
    for r in rows_q.all():
        rows.append({
            "id": r.id,
            "date": r.date.isoformat() if r.date else None,
            "metric_name": r.metric_name,
            "metric_value": float(r.metric_value or 0),
            "category": r.category,
            "fetched_at": r.fetched_at.isoformat() if r.fetched_at else None,
        })

    return {
        "sheet_name": sheet_name,
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": rows,
    }
