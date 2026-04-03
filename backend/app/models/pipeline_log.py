"""
Pipeline execution log model for I-Dash Analytics Platform.

Tracks the execution history of data refresh pipelines for monitoring
and troubleshooting data collection jobs.
"""

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Enum as SQLEnum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PipelineStatus(str, Enum):
    """Pipeline execution status enumeration."""

    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class PipelineLog(Base):
    """
    Log entry for pipeline execution tracking.

    Attributes:
        id: Primary key.
        pipeline_name: Name of the pipeline that executed.
        status: Execution status (running, success, failed).
        records_fetched: Number of records fetched in this run.
        error_message: Error message if execution failed.
        started_at: Timestamp when pipeline started.
        completed_at: Timestamp when pipeline completed.
    """

    __tablename__ = "pipeline_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    pipeline_name: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False,
    )
    status: Mapped[PipelineStatus] = mapped_column(
        SQLEnum(PipelineStatus),
        index=True,
        nullable=False,
    )
    records_fetched: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
        nullable=False,
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    def __repr__(self) -> str:
        """String representation of PipelineLog."""
        duration = None
        if self.completed_at:
            duration = (self.completed_at - self.started_at).total_seconds()

        return (
            f"<PipelineLog(pipeline={self.pipeline_name}, "
            f"status={self.status.value}, duration={duration}s)>"
        )

    @property
    def duration_seconds(self) -> float:
        """Calculate pipeline execution duration in seconds."""
        if self.completed_at and self.started_at:
            return (self.completed_at - self.started_at).total_seconds()
        return 0.0
