"""
Pipeline management API router for I-Dash Analytics Platform.

Handles pipeline execution, status monitoring, and execution history retrieval.
Admin-only endpoints for managing data refresh pipelines.

Pipeline runs are dispatched as background tasks so the HTTP response returns
immediately (202 Accepted) without hitting the gunicorn/proxy timeout.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
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


async def _run_pipeline_bg(name: str, pipeline_service: PipelineService) -> None:
    """Background coroutine that runs a single pipeline and stores the result."""
    _running_pipelines[name] = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = await pipeline_service.run_pipeline(name)
        _running_pipelines[name] = {
            **result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("Background pipeline '%s' finished: %s records", name, result.get("records_loaded", 0))
    except Exception as exc:
        _running_pipelines[name] = {
            "status": "failed",
            "error": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.error("Background pipeline '%s' failed: %s", name, exc)


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
) -> Dict[str, Any]:
    """
    Trigger execution of a specific pipeline in the background.

    Returns immediately with 202 Accepted. The pipeline runs asynchronously;
    check ``GET /pipelines/{name}/status`` or the Pipelines page for results.
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
