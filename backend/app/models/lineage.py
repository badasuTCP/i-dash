"""
DataLineageEvent — Phase 2 Metadata Vault.

Complementary to the existing pipeline_logs table (which tracks
success/failure + record counts). Lineage events capture the deeper
metadata an IT director needs to answer the question
"where did this dashboard number come from?":

  - which DB tables this run touched (read/write)
  - which downstream API endpoints / dashboard tiles depend on those
    tables
  - schema fingerprint (hash of column names + types) so column drift
    is detectable run-over-run
  - inserted vs updated vs skipped counts

No existing data is migrated; this table populates forward-only as
new pipeline runs land.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DataLineageEvent(Base):
    """One lineage record per pipeline run, linked by pipeline_log_id."""

    __tablename__ = "data_lineage_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # FK-style reference (no hard FK to keep this table forward-only safe).
    # Empty when the event is recorded outside a pipeline (e.g. ad-hoc).
    pipeline_log_id: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)

    pipeline_name: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    run_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
    )
    run_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # Comma-separated table names — kept as String(512) for portability;
    # JSON column is also fine on Postgres but plain string is queryable
    # via LIKE without dialect-specific JSON ops.
    tables_read: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    tables_written: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # Counts attribution — what actually changed in the DB
    records_inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Hash of (column_name|type|...) for the primary written table — drift detector
    schema_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Names of dashboard endpoints / tiles that depend on tables_written.
    # Lets Will answer "if google_sheets fails, what tiles go stale?"
    downstream_impact: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # Anything that doesn't fit elsewhere — error, source URL, parameters
    extra: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<DataLineageEvent({self.pipeline_name} "
            f"reads={self.tables_read} writes={self.tables_written} "
            f"+{self.records_inserted} ~{self.records_updated} "
            f"skip={self.records_skipped})>"
        )
