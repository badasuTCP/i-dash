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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, get_db
from app.core.security import get_current_user, role_required
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.user import User
from app.services.pipeline_service import PipelineService

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


async def _run_pipeline_bg(name: str, pipeline_service: PipelineService) -> None:
    """Background coroutine that runs a single pipeline and stores the result."""
    started_at = datetime.now(timezone.utc)
    _running_pipelines[name] = {
        "status": "running",
        "started_at": started_at.isoformat(),
    }
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
            "error": str(exc),
            "completed_at": completed_at.isoformat(),
        }
        logger.error("Background pipeline '%s' failed: %s", name, exc)
        await _persist_pipeline_log(
            name, PipelineStatus.FAILED, 0, started_at, completed_at, str(exc),
        )


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
    date_from: Optional[date] = Query(None, description="Override start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Override end date (YYYY-MM-DD)"),
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

    # Apply date overrides to the pipeline before dispatching
    pipeline_obj = pipeline_service.pipelines.get(name)
    if pipeline_obj and (date_from or date_to):
        end_dt = date_to or date.today()
        start_dt = date_from or (end_dt - timedelta(days=30))
        pipeline_obj.start_date = start_dt
        pipeline_obj.end_date = end_dt
        logger.info("Pipeline '%s' date range overridden to %s → %s", name, start_dt, end_dt)

    # Dispatch to background using asyncio.create_task for proper async support
    asyncio.create_task(_run_pipeline_bg(name, pipeline_service))

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
    from sqlalchemy import desc, select

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
