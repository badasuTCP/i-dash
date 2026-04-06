"""
Pipeline management API router for I-Dash Analytics Platform.

Handles pipeline execution, status monitoring, and execution history retrieval.
Admin-only endpoints for managing data refresh pipelines.
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.user import User
from app.services.pipeline_service import PipelineService

logger = logging.getLogger(__name__)

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


@router.post(
    "/{name}/run",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a specific pipeline run (admin only)",
    responses={
        202: {"description": "Pipeline execution started"},
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Pipeline not found"},
        500: {"description": "Pipeline execution error"},
    },
)
async def run_pipeline(
    name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin", "data-analyst"])),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """
    Trigger execution of a specific pipeline.

    Only administrators can trigger pipeline runs.

    Args:
        name: Pipeline name (e.g., 'hubspot', 'meta_ads', 'google_ads').
        db: Database session.
        current_user: Current authenticated user (must be admin).
        pipeline_service: Pipeline service instance.

    Returns:
        Dictionary with pipeline execution result.

    Raises:
        HTTPException: If pipeline is not found or execution fails.
    """
    # Validate pipeline exists
    available_pipelines = await pipeline_service.get_pipeline_list()
    if name not in available_pipelines:
        logger.warning(
            f"Admin {current_user.id} attempted to run non-existent pipeline: {name}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline '{name}' not found. Available: {', '.join(available_pipelines)}",
        )

    # Run pipeline
    try:
        result = await pipeline_service.run_pipeline(name)

        logger.info(f"Admin {current_user.id} triggered pipeline: {name}")

        return {
            "pipeline": name,
            "status": result.get("status", "unknown"),
            "records_loaded": result.get("records_loaded", 0),
            "duration_seconds": result.get("duration_seconds", 0),
            "error": result.get("error"),
            "message": f"Pipeline '{name}' execution {'completed successfully' if result['status'] == 'success' else 'failed'}",
        }

    except ValueError as e:
        logger.error(f"ValueError running pipeline {name}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected error running pipeline {name}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Pipeline execution failed",
        )


@router.post(
    "/run-all",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger all pipelines (admin only)",
    responses={
        202: {"description": "All pipelines execution started"},
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        500: {"description": "Pipeline execution error"},
    },
)
async def run_all_pipelines(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin", "data-analyst"])),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
) -> Dict[str, Any]:
    """
    Trigger execution of all pipelines in sequence.

    Pipelines are executed in order: hubspot, meta_ads, google_ads, google_sheets, snapshot.
    Errors in one pipeline don't prevent execution of others.

    Only administrators can trigger pipeline runs.

    Args:
        db: Database session.
        current_user: Current authenticated user (must be admin).
        pipeline_service: Pipeline service instance.

    Returns:
        Dictionary with summary of all pipeline executions.
    """
    try:
        result = await pipeline_service.run_all_pipelines()

        logger.info(
            f"Admin {current_user.id} triggered all pipelines. "
            f"Success: {result['total_success']}, Failed: {result['total_failed']}"
        )

        return {
            "status": "in_progress" if result["total_failed"] == 0 else "partial_failure",
            "total_pipelines": result["total_pipelines"],
            "successful": result["total_success"],
            "failed": result["total_failed"],
            "duration_seconds": result["duration_seconds"],
            "started_at": result["started_at"],
            "completed_at": result["completed_at"],
            "results": result["results"],
        }

    except Exception as e:
        logger.error(f"Error running all pipelines: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Pipeline execution failed",
        )


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
