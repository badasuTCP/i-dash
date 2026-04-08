"""
Discovery Audit model for I-Dash Analytics Platform.

Stores every account discovered by the Meta, Google Ads, and GA4 auto-discovery
pipelines.  Entries are never deleted — rejected discoveries are marked with
status='rejected' so they remain auditable and recoverable.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DiscoveryAudit(Base):
    """
    Immutable log of every account discovered across all platforms.

    Attributes:
        id:             Auto-increment primary key.
        platform:       Source platform ('meta', 'google_ads', 'ga4').
        account_id:     Platform-specific account identifier
                        (e.g. 'act_123', '2957400868', '355408548').
        account_name:   Human-readable name at time of discovery.
        portfolio:      Portfolio or parent business name (e.g. 'I-Bos 2',
                        'The Concrete Protector', 'Warrior Equipment').
        division:       Mapped division ('cp', 'sanitred', 'ibos', 'brand').
        status:         Lifecycle: 'discovered', 'approved', 'rejected', 'merged'.
        contractor_id:  FK slug if linked to a contractor record (nullable).
        notes:          Free-text admin notes (e.g. "Merged into graber-design").
        discovered_at:  Timestamp of first discovery.
        updated_at:     Timestamp of last status change.
    """

    __tablename__ = "discovery_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    account_name: Mapped[str] = mapped_column(String(256), nullable=False)
    portfolio: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    division: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="discovered", index=True,
    )
    contractor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return (
            f"<DiscoveryAudit {self.platform}:{self.account_id} "
            f"status={self.status}>"
        )
