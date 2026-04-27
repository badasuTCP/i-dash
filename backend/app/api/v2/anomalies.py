"""
Phase 2 — /api/v2/anomalies.

Read-only over the anomalies table populated by
services/anomaly_service.run_anomaly_pass(). Plus a manual trigger and
a basic acknowledge endpoint so the eventual UI can mark flags
reviewed without creating a new schema for it.

Frontend doesn't consume this yet.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.anomalies import Anomaly
from app.models.user import User
from app.services.anomaly_service import run_anomaly_pass

router = APIRouter(
    prefix="/v2/anomalies",
    tags=["v2 · anomalies"],
    responses={
        401: {"description": "Unauthorized"},
    },
)


@router.get(
    "",
    summary="List anomaly flags, newest first",
)
async def list_anomalies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    metric: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """Filter + paginate over the anomalies feed."""
    stmt = select(Anomaly)
    if status_filter:
        stmt = stmt.where(Anomaly.status == status_filter)
    if severity:
        stmt = stmt.where(Anomaly.severity == severity)
    if source_type:
        stmt = stmt.where(Anomaly.source_type == source_type)
    if metric:
        stmt = stmt.where(Anomaly.metric == metric)
    stmt = stmt.order_by(desc(Anomaly.detected_at)).limit(limit).offset(offset)

    rows = (await db.execute(stmt)).scalars().all()

    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append({
            "id": r.id,
            "detected_at": r.detected_at.isoformat() if r.detected_at else None,
            "source_type": r.source_type,
            "source_id": r.source_id,
            "source_label": r.source_label,
            "metric": r.metric,
            "last24h_value": r.last24h_value,
            "baseline_7d_avg": r.baseline_7d_avg,
            "deviation_pct": r.deviation_pct,
            "severity": r.severity,
            "status": r.status,
            "notes": r.notes,
            "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
            "acknowledged_by": r.acknowledged_by,
        })
    return {"anomalies": items, "count": len(items), "limit": limit, "offset": offset}


@router.post(
    "/run",
    summary="Manually trigger an anomaly detection pass (admin only)",
)
async def trigger_anomaly_pass(
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> Dict[str, Any]:
    """Run the same logic the scheduled job runs, right now."""
    return await run_anomaly_pass()


@router.post(
    "/{anomaly_id}/acknowledge",
    summary="Mark an anomaly acknowledged or resolved (admin only)",
)
async def acknowledge_anomaly(
    anomaly_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    new_status: str = Query("acknowledged", description="'acknowledged' | 'resolved' | 'open'"),
) -> Dict[str, Any]:
    if new_status not in {"acknowledged", "resolved", "open"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be one of: acknowledged, resolved, open",
        )

    row = (await db.execute(select(Anomaly).where(Anomaly.id == anomaly_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anomaly not found")

    row.status = new_status
    if new_status in ("acknowledged", "resolved"):
        row.acknowledged_at = datetime.now(timezone.utc)
        row.acknowledged_by = current_user.email
    else:
        row.acknowledged_at = None
        row.acknowledged_by = None

    await db.commit()
    return {
        "id": row.id,
        "status": row.status,
        "acknowledged_by": row.acknowledged_by,
        "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
    }
