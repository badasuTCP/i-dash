"""
Phase 2 — /api/v2/lineage  (Metadata Vault read API).

Stitches together the existing pipeline_logs (sync status / records /
duration) with the new data_lineage_events table (tables touched +
downstream impact + schema fingerprint) so Will can answer
"where did this number come from?" without touching the frontend.

Two endpoints:
  GET /api/v2/lineage/runs          most recent pipeline runs joined
                                    with their lineage event if any
  GET /api/v2/lineage/runs/{id}     full record for one run
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.lineage import DataLineageEvent
from app.models.pipeline_log import PipelineLog
from app.models.user import User

router = APIRouter(
    prefix="/v2/lineage",
    tags=["v2 · lineage"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden — admin only"},
    },
)


@router.get(
    "/runs",
    summary="Recent pipeline runs joined with their lineage metadata",
)
async def list_runs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    pipeline_name: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> Dict[str, Any]:
    """
    Returns recent pipeline_logs entries with their lineage event
    embedded (when present). The lineage event is a separate row keyed
    by pipeline_log_id; a Python join keeps the response shape simple
    and tolerates runs that pre-date the Metadata Vault.
    """
    log_stmt = select(PipelineLog)
    if pipeline_name:
        log_stmt = log_stmt.where(PipelineLog.pipeline_name == pipeline_name)
    log_stmt = log_stmt.order_by(desc(PipelineLog.started_at)).limit(limit)
    logs = (await db.execute(log_stmt)).scalars().all()

    log_ids = [log.id for log in logs]
    lineage_by_log: Dict[int, DataLineageEvent] = {}
    if log_ids:
        lin_stmt = select(DataLineageEvent).where(
            DataLineageEvent.pipeline_log_id.in_(log_ids)
        )
        for ev in (await db.execute(lin_stmt)).scalars().all():
            if ev.pipeline_log_id is not None:
                lineage_by_log[ev.pipeline_log_id] = ev

    items: List[Dict[str, Any]] = []
    for log in logs:
        ev = lineage_by_log.get(log.id)
        items.append({
            "log_id": log.id,
            "pipeline_name": log.pipeline_name,
            "status": log.status.value if log.status else None,
            "records_fetched": log.records_fetched,
            "started_at": log.started_at.isoformat() if log.started_at else None,
            "completed_at": log.completed_at.isoformat() if log.completed_at else None,
            "duration_seconds": log.duration_seconds,
            "error_message": log.error_message,
            "lineage": None if ev is None else {
                "tables_read": ev.tables_read,
                "tables_written": ev.tables_written,
                "records_inserted": ev.records_inserted,
                "records_updated": ev.records_updated,
                "records_skipped": ev.records_skipped,
                "schema_fingerprint": ev.schema_fingerprint,
                "downstream_impact": ev.downstream_impact,
                "extra": ev.extra,
            },
        })

    return {"runs": items, "count": len(items)}


@router.get(
    "/runs/{log_id}",
    summary="Full lineage detail for one pipeline run",
)
async def get_run(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> Dict[str, Any]:
    log = (await db.execute(select(PipelineLog).where(PipelineLog.id == log_id))).scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    ev = (await db.execute(
        select(DataLineageEvent).where(DataLineageEvent.pipeline_log_id == log_id)
    )).scalar_one_or_none()

    return {
        "log_id": log.id,
        "pipeline_name": log.pipeline_name,
        "status": log.status.value if log.status else None,
        "records_fetched": log.records_fetched,
        "started_at": log.started_at.isoformat() if log.started_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": log.duration_seconds,
        "error_message": log.error_message,
        "lineage": None if ev is None else {
            "id": ev.id,
            "pipeline_name": ev.pipeline_name,
            "tables_read": ev.tables_read,
            "tables_written": ev.tables_written,
            "records_inserted": ev.records_inserted,
            "records_updated": ev.records_updated,
            "records_skipped": ev.records_skipped,
            "schema_fingerprint": ev.schema_fingerprint,
            "downstream_impact": ev.downstream_impact,
            "extra": ev.extra,
            "created_at": ev.created_at.isoformat() if ev.created_at else None,
        },
    }
