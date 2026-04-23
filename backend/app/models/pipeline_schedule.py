"""
Per-pipeline schedule configuration for I-Dash Analytics Platform.

Stores the user-selected run cadence for each pipeline (HubSpot, Meta Ads,
etc.). The SchedulerService reads this table on boot and periodically
reconciles in-memory APScheduler jobs with the persisted configuration.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PipelineSchedule(Base):
    """Schedule configuration for a single pipeline."""

    __tablename__ = "pipeline_schedules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    pipeline_name: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False,
    )
    interval_value: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="4hrs",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<PipelineSchedule({self.pipeline_name}={self.interval_value}, "
            f"enabled={self.enabled})>"
        )
