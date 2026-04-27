"""
Anomaly model — Phase 2 Anomaly Guard output.

One row per detected deviation event. The Guard runs periodically
(see services/anomaly_service.py) and inserts new flags whenever a
24h metric deviates by >40% from its 7-day rolling average.

Same row never updates after insert — each detection is an immutable
event. The ``status`` column lets a future UI mark flags acknowledged
or resolved without losing history.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Anomaly(Base):
    """
    A single deviation flag — one row per (source × metric × detection time).

    Detected by services/anomaly_service.py with the rule:
        |last24h - baseline_7d_avg| / max(|baseline_7d_avg|, 0.01) > 0.40

    Severity = 'critical' if deviation >= 100% (absolute), else 'warning'.
    """

    __tablename__ = "anomalies"
    __table_args__ = (
        Index("ix_anomalies_detected_status", "detected_at", "status"),
        Index("ix_anomalies_source_metric", "source_type", "source_id", "metric"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # 'contractor' | 'retail' | 'cp' | 'sanitred' | 'ibos' | 'platform'
    source_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)

    # account_id, contractor name, store handle, etc. — free identifier
    source_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)

    # Human-readable label for UI ("Beckley Concrete Decor", "CP Store")
    source_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 'spend' | 'cpl' | 'revenue' | 'leads' | 'roas'
    metric: Mapped[str] = mapped_column(String(32), index=True, nullable=False)

    last24h_value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    baseline_7d_avg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    deviation_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # 'warning' (40-99%) | 'critical' (>=100%)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="warning")

    # 'open' | 'acknowledged' | 'resolved' | 'auto_cleared'
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")

    # Optional context (sample size, days observed, etc.)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<Anomaly({self.source_type}/{self.source_id}/{self.metric}: "
            f"{self.deviation_pct:+.1%} "
            f"24h={self.last24h_value:.2f} vs 7d={self.baseline_7d_avg:.2f}, "
            f"{self.severity}/{self.status})>"
        )
