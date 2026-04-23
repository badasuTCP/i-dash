"""
Pipeline management API router for I-Dash Analytics Platform.

Handles pipeline execution, status monitoring, and execution history retrieval.
Admin-only endpoints for managing data refresh pipelines.

Pipeline runs are dispatched as background tasks so the HTTP response returns
immediately (202 Accepted) without hitting the gunicorn/proxy timeout.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, get_db
from app.core.security import get_current_user, role_required
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.pipeline_schedule import PipelineSchedule
from app.models.user import User
from app.services.pipeline_service import PipelineService
from app.services.scheduler import (
    DEFAULT_INTERVALS,
    _interval_to_trigger_kwargs,
)

logger = logging.getLogger(__name__)

# Track in-flight background pipeline runs
_running_pipelines: Dict[str, Dict[str, Any]] = {}

router = APIRouter(prefix="/pipelines", tags=["Pipeline Management"])

# Global pipeline service instance
_pipeline_service: PipelineService = None


def get_pipeline_service() -> PipelineService:
    """
    Get or initialize the pipeline service.

    Returns:
        PipelineService: Singleton pipeline service instance.
    """
    global _pipeline_service
    if _pipeline_service is None:
        _pipeline_service = PipelineService()
    return _pipeline_service


@router.get(
    "",
    summary="List all pipelines with status",
    responses={
        200: {"description": "List of pipelines with current status"},
        401: {"description": "Unauthorized"},
    },
)
async def list_pipelines(
    current_user: User = Depends(get_current_user),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """
    Get list of all available pipelines with their current status.

    Args:
        current_user: Current authenticated user.
        pipeline_service: Pipeline service instance.

    Returns:
        Dictionary with pipeline list and status information.
    """
    status_data = await pipeline_service.get_pipeline_status()

    logger.info(f"User {current_user.id} retrieved pipeline list")

    return {
        "pipelines": status_data["pipelines"],
        "total_pipelines": status_data["total_pipelines"],
        "last_updated": status_data["last_updated"],
    }


async def _persist_pipeline_log(
    name: str, status_val: PipelineStatus, records: int,
    started: datetime, completed: datetime, error_msg: str | None = None,
) -> None:
    """Write a PipelineLog row so marketing / dashboard endpoints can detect past runs."""
    try:
        async with async_session_maker() as db:
            log = PipelineLog(
                pipeline_name=name,
                status=status_val,
                records_fetched=records,
                error_message=error_msg,
                started_at=started,
                completed_at=completed,
            )
            db.add(log)
            await db.commit()
    except Exception as exc:
        logger.warning("Could not persist PipelineLog for '%s': %s", name, exc)


async def _run_pipeline_bg(
    name: str,
    pipeline_service: PipelineService,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> None:
    """Background coroutine that runs a single pipeline and stores the result.

    If ``start_date`` / ``end_date`` are provided, they are applied to the
    pipeline instance immediately before the run. The previous values are
    restored afterwards so concurrent default runs are not affected.
    """
    # Yield once so the parent request handler can finish serializing and
    # flushing the 202 response through Railway's 60s edge proxy before any
    # potentially-blocking pipeline work starts here.
    await asyncio.sleep(0)

    started_at = datetime.now(timezone.utc)
    _running_pipelines[name] = {
        "status": "running",
        "started_at": started_at.isoformat(),
    }

    pipeline_obj = pipeline_service.pipelines.get(name)
    prev_start = getattr(pipeline_obj, "start_date", None) if pipeline_obj else None
    prev_end = getattr(pipeline_obj, "end_date", None) if pipeline_obj else None
    if pipeline_obj and (start_date or end_date):
        if start_date:
            pipeline_obj.start_date = start_date
        if end_date:
            pipeline_obj.end_date = end_date
        logger.info(
            "Pipeline '%s' running with date range %s → %s",
            name, pipeline_obj.start_date, pipeline_obj.end_date,
        )

    try:
        result = await pipeline_service.run_pipeline(name)
        completed_at = datetime.now(timezone.utc)
        _running_pipelines[name] = {
            **result,
            "completed_at": completed_at.isoformat(),
        }
        logger.info("Background pipeline '%s' finished: %s records", name, result.get("records_loaded", 0))
        # Persist to DB for durable hasLiveData detection
        await _persist_pipeline_log(
            name, PipelineStatus.SUCCESS,
            result.get("records_loaded", 0), started_at, completed_at,
        )
    except Exception as exc:
        completed_at = datetime.now(timezone.utc)
        _running_pipelines[name] = {
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
            "completed_at": completed_at.isoformat(),
        }
        logger.exception("Background pipeline '%s' failed", name)
        await _persist_pipeline_log(
            name, PipelineStatus.FAILED, 0, started_at, completed_at,
            f"{type(exc).__name__}: {exc}",
        )
    finally:
        # Restore any singleton date overrides
        if pipeline_obj and (start_date or end_date):
            if prev_start is not None:
                pipeline_obj.start_date = prev_start
            if prev_end is not None:
                pipeline_obj.end_date = prev_end


@router.post(
    "/{name}/run",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a specific pipeline run (admin only)",
    responses={
        202: {"description": "Pipeline execution started in background"},
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Pipeline not found"},
    },
)
async def run_pipeline(
    name: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin", "data-analyst"])),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
    date_from: Optional[str] = Query(None, description="Override start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Override end date (YYYY-MM-DD)"),
) -> Dict[str, Any]:
    """
    Trigger execution of a specific pipeline in the background.

    Returns immediately with 202 Accepted. The pipeline runs asynchronously;
    check ``GET /pipelines/{name}/status`` or the Pipelines page for results.

    Optional ``date_from`` / ``date_to`` override the pipeline's default
    30-day window so the Global Date Picker can drive longer lookbacks.
    """
    available_pipelines = await pipeline_service.get_pipeline_list()
    if name not in available_pipelines:
        # Distinguish "not configured" from truly unknown
        if name in pipeline_service.init_errors:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline '{name}' is not configured: {pipeline_service.init_errors[name]}",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline '{name}' not found. Available: {', '.join(available_pipelines)}",
        )

    # Check if already running
    current = _running_pipelines.get(name)
    if current and current.get("status") == "running":
        return {
            "pipeline": name,
            "status": "already_running",
            "message": f"Pipeline '{name}' is already running — started at {current.get('started_at')}",
        }

    # Parse optional date overrides explicitly so bad input returns a clean 400.
    start_dt: Optional[date] = None
    end_dt: Optional[date] = None
    if date_from:
        try:
            start_dt = date.fromisoformat(date_from.strip())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_from '{date_from}' — expected YYYY-MM-DD",
            )
    if date_to:
        try:
            end_dt = date.fromisoformat(date_to.strip())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date_to '{date_to}' — expected YYYY-MM-DD",
            )
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"date_from ({start_dt}) must be <= date_to ({end_dt})",
        )
    if start_dt and not end_dt:
        end_dt = date.today()
    if end_dt and not start_dt:
        start_dt = end_dt - timedelta(days=30)

    if start_dt or end_dt:
        logger.info(
            "Pipeline '%s' requested with backfill range %s → %s",
            name, start_dt, end_dt,
        )

    # Dispatch to background using asyncio.create_task for proper async support.
    # Dates are passed through so the background task applies them atomically.
    asyncio.create_task(
        _run_pipeline_bg(name, pipeline_service, start_dt, end_dt)
    )

    logger.info("Admin %s dispatched pipeline '%s' to background", current_user.id, name)

    return {
        "pipeline": name,
        "status": "accepted",
        "message": f"Pipeline '{name}' started in background. Check pipeline status for results.",
    }


@router.get(
    "/{name}/status",
    summary="Check background pipeline run status",
)
async def get_pipeline_run_status(
    name: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return the current or most recent background run result for a pipeline."""
    bg = _running_pipelines.get(name)
    if bg:
        return {"pipeline": name, **bg}
    return {"pipeline": name, "status": "idle", "message": "No recent background run"}


async def _run_all_pipelines_bg(pipeline_service: PipelineService) -> None:
    """Background coroutine that runs all pipelines sequentially."""
    _running_pipelines["__all__"] = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = await pipeline_service.run_all_pipelines()
        _running_pipelines["__all__"] = {
            "status": "completed",
            "total_success": result["total_success"],
            "total_failed": result["total_failed"],
            "duration_seconds": result["duration_seconds"],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        _running_pipelines["__all__"] = {
            "status": "failed",
            "error": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }


@router.post(
    "/run-all",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger all pipelines in background (admin only)",
    responses={
        202: {"description": "All pipelines dispatched to background"},
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
    },
)
async def run_all_pipelines(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin", "data-analyst"])),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """
    Trigger all pipelines in background. Returns immediately with 202.
    """
    current = _running_pipelines.get("__all__")
    if current and current.get("status") == "running":
        return {
            "status": "already_running",
            "message": f"All-pipeline run already in progress — started at {current.get('started_at')}",
        }

    asyncio.create_task(_run_all_pipelines_bg(pipeline_service))

    logger.info("Admin %s dispatched all pipelines to background", current_user.id)

    return {
        "status": "accepted",
        "message": "All pipelines started in background. Check pipeline status for results.",
    }


@router.get(
    "/{name}/history",
    summary="Get pipeline execution history",
    responses={
        200: {"description": "Pipeline execution history"},
        401: {"description": "Unauthorized"},
        404: {"description": "Pipeline not found"},
    },
)
async def get_pipeline_history(
    name: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100, description="Max results (1-100)"),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """
    Get execution history for a specific pipeline.

    Args:
        name: Pipeline name.
        current_user: Current authenticated user.
        limit: Maximum number of history records to return (1-100).
        pipeline_service: Pipeline service instance.

    Returns:
        Dictionary with pipeline execution history.

    Raises:
        HTTPException: If pipeline is not found.
    """
    # Validate pipeline exists
    available_pipelines = await pipeline_service.get_pipeline_list()
    if name not in available_pipelines:
        logger.warning(
            f"User {current_user.id} requested history for non-existent pipeline: {name}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline '{name}' not found",
        )

    try:
        history = await pipeline_service.get_pipeline_history(name, limit=limit)

        logger.info(f"User {current_user.id} retrieved history for pipeline: {name}")

        return {
            "pipeline": name,
            "total_records": len(history),
            "history": history,
        }

    except ValueError as e:
        logger.error(f"ValueError getting history for pipeline {name}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error getting pipeline history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve pipeline history",
        )


VALID_INTERVALS = {"30min", "1hr", "2hrs", "4hrs", "6hrs", "12hrs", "daily"}


@router.get(
    "/schedules",
    summary="Get per-pipeline schedule configuration",
)
async def get_pipeline_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return current schedule config for every pipeline.

    Missing pipelines fall back to ``DEFAULT_INTERVALS`` — the client can
    PUT once to persist the default.
    """
    result = await db.execute(select(PipelineSchedule))
    rows = {s.pipeline_name: s for s in result.scalars().all()}
    schedules = []
    for name in DEFAULT_INTERVALS.keys():
        row = rows.get(name)
        schedules.append({
            "pipeline_name": name,
            "interval_value": row.interval_value if row else DEFAULT_INTERVALS[name],
            "enabled": row.enabled if row else True,
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            "persisted": row is not None,
        })
    return {"schedules": schedules}


@router.put(
    "/{name}/schedule",
    summary="Update a pipeline's run schedule (admin only)",
)
async def update_pipeline_schedule(
    name: str,
    payload: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin", "data-analyst"])),
    db: AsyncSession = Depends(get_db),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """Persist a new interval / enabled flag for one pipeline.

    Body: ``{"interval_value": "2hrs", "enabled": true}``. Valid interval
    values match the Pipeline Control UI dropdown.
    """
    if name not in DEFAULT_INTERVALS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown pipeline '{name}'",
        )

    interval_value = payload.get("interval_value")
    enabled = payload.get("enabled", True)

    if interval_value is not None and interval_value not in VALID_INTERVALS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid interval_value '{interval_value}' — "
                f"expected one of {sorted(VALID_INTERVALS)}"
            ),
        )
    if interval_value and not _interval_to_trigger_kwargs(interval_value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Interval '{interval_value}' has no trigger mapping",
        )

    result = await db.execute(
        select(PipelineSchedule).where(PipelineSchedule.pipeline_name == name)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = PipelineSchedule(
            pipeline_name=name,
            interval_value=interval_value or DEFAULT_INTERVALS[name],
            enabled=bool(enabled),
        )
        db.add(row)
    else:
        if interval_value:
            row.interval_value = interval_value
        row.enabled = bool(enabled)
        row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)

    # Ask the running scheduler to pick up the change immediately so the
    # user doesn't have to wait for the next reconcile tick. The global
    # instance lives in app.main; fail silently if it isn't wired in yet
    # (tests, cold start, etc.).
    try:
        from app.main import _scheduler
        if _scheduler is not None:
            asyncio.create_task(_scheduler.reconcile_now())
    except Exception as exc:
        logger.debug("Could not trigger immediate reconcile: %s", exc)

    logger.info(
        "Admin %s updated schedule for %s → %s (enabled=%s)",
        current_user.id, name, row.interval_value, row.enabled,
    )

    return {
        "pipeline_name": row.pipeline_name,
        "interval_value": row.interval_value,
        "enabled": row.enabled,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get(
    "/system/scheduler",
    summary="Scheduler health + active job list",
)
async def get_scheduler_status(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Expose APScheduler job registry for diagnostics."""
    try:
        from app.main import _scheduler
        if _scheduler is None:
            return {"is_running": False, "is_leader": False, "jobs": [], "total_jobs": 0}
        return await _scheduler.get_status()
    except Exception as exc:
        return {"error": str(exc)}


@router.get(
    "/system/recent-errors",
    summary="Recent pipeline errors for admin system log viewer",
)
async def get_recent_errors(
    current_user: User = Depends(get_current_user),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return the most recent failed pipeline executions across all pipelines."""
    from sqlalchemy import desc

    result = await db.execute(
        select(PipelineLog)
        .where(PipelineLog.status == PipelineStatus.FAILED)
        .order_by(desc(PipelineLog.started_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    return [
        {
            "pipeline": log.pipeline_name,
            "started_at": log.started_at.isoformat() if log.started_at else None,
            "error": log.error_message,
            "duration_seconds": log.duration_seconds,
        }
        for log in logs
    ]
