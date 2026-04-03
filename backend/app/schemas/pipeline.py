"""
Pipeline-related Pydantic schemas for I-Dash Analytics Platform.

Provides request/response schemas for pipeline execution tracking and monitoring.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.pipeline_log import PipelineStatus


class PipelineLogCreate(BaseModel):
    """Schema for creating a pipeline log entry."""

    pipeline_name: str = Field(..., min_length=1, max_length=255)
    status: PipelineStatus
    records_fetched: int = Field(default=0, ge=0)
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "pipeline_name": "hubspot_daily_sync",
                "status": "success",
                "records_fetched": 150,
                "error_message": None,
                "started_at": "2024-03-24T10:00:00Z",
                "completed_at": "2024-03-24T10:15:30Z",
            }
        }


class PipelineLogResponse(BaseModel):
    """Schema for pipeline log response."""

    id: int
    pipeline_name: str
    status: PipelineStatus
    records_fetched: int
    error_message: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: float = Field(..., description="Pipeline execution duration")

    class Config:
        """Pydantic configuration."""

        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "pipeline_name": "hubspot_daily_sync",
                "status": "success",
                "records_fetched": 150,
                "error_message": None,
                "started_at": "2024-03-24T10:00:00Z",
                "completed_at": "2024-03-24T10:15:30Z",
                "duration_seconds": 930.5,
            }
        }


class PipelineStatus(BaseModel):
    """Schema for pipeline status information."""

    pipeline_name: str = Field(..., description="Name of the pipeline")
    current_status: str = Field(
        ...,
        description="Current execution status",
    )
    last_run: Optional[datetime] = Field(
        None,
        description="Timestamp of last execution",
    )
    last_success: Optional[datetime] = Field(
        None,
        description="Timestamp of last successful execution",
    )
    last_error: Optional[str] = Field(
        None,
        description="Last error message if applicable",
    )
    records_in_last_run: int = Field(
        default=0,
        description="Number of records fetched in last run",
    )
    health_status: str = Field(
        default="healthy",
        description="Health status (healthy, degraded, failed)",
    )

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "pipeline_name": "hubspot_daily_sync",
                "current_status": "success",
                "last_run": "2024-03-24T10:15:30Z",
                "last_success": "2024-03-24T10:15:30Z",
                "last_error": None,
                "records_in_last_run": 150,
                "health_status": "healthy",
            }
        }
