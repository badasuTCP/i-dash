"""
MetricsProjection model — Phase 2 Projection Engine output.

One row per (metric_type, division, period_start). Upserted by the
forecasting_service after each run. The frontend does NOT read this
table yet (Hard Freeze through demo); the only consumer for now is
/api/v2/projections.
"""

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MetricsProjection(Base):
    """
    Forecast for a single metric over a single calendar period.

    Built by services/forecasting_service.py from the last 14 days of
    actuals. ``run_rate_daily`` is the simple mean of the last 14 daily
    values; ``projected_total`` extrapolates that rate to the end of the
    period and adds the month-to-date actual.
    """

    __tablename__ = "metrics_projections"
    __table_args__ = (
        UniqueConstraint(
            "metric_type", "division", "period_start",
            name="uq_metrics_projection_metric_div_period",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # 'spend' | 'leads' | 'revenue' (extensible)
    metric_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)

    # 'cp' | 'sanitred' | 'ibos' | 'all'
    division: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="all")

    # Calendar period being projected (default: this month)
    period_start: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Actuals through "as of" date (typically yesterday — today's data is partial)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    mtd_actual: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # 14-day daily run-rate input
    run_rate_daily: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    days_observed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Projected total = mtd_actual + (days_remaining * run_rate_daily)
    projected_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    days_remaining: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # 'high' (>=12 days observed) | 'medium' (7-11) | 'low' (<7)
    confidence: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")

    # Free-text notes — useful when run_rate is computed with caveats
    notes: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<MetricsProjection({self.metric_type}/{self.division} "
            f"{self.period_start}: ${self.projected_total:,.0f} "
            f"@ {self.run_rate_daily:.2f}/day, conf={self.confidence})>"
        )
