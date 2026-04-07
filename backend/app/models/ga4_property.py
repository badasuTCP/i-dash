"""
GA4 Property model for I-Dash Analytics Platform.

Stores every GA4 property discovered via the Admin API's
listAccountSummaries endpoint.  Properties are grouped by
GA4 Account and mapped to I-Dash divisions so the web-analytics
endpoint knows which property_id to query for each brand.

The Super Admin can enable/disable individual properties in the
Admin Controls → GA4 Properties panel; that toggle is a permanent
PostgreSQL write that survives pipeline re-runs.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GA4Property(Base):
    """
    Persistent GA4 property record.

    Attributes:
        property_id:    GA4 numeric property ID (primary key, e.g. '123456789').
        account_id:     GA4 account ID the property belongs to (e.g. '115324581').
        account_name:   Human-readable account name from the Admin API.
        display_name:   Property display name from the Admin API.
        division:       I-Dash division slug: 'cp', 'sanitred', 'ibos', 'dckn'.
        enabled:        Super-admin toggle — disabled properties are excluded
                        from analytics queries and the Property Switcher.
        status:         Lifecycle: 'active', 'inactive', 'pending_admin'.
                        New DCKN properties start as 'pending_admin'.
        contractor_id:  Optional FK slug linking to the contractors table
                        (for I-BOS / DCKN properties that map 1-to-1 to a contractor).
        url:            Website URL if known (from Admin API or manual entry).
        discovered_at:  First time the property was seen by the pipeline.
        updated_at:     Last time any field was changed.
    """

    __tablename__ = "ga4_properties"

    property_id: Mapped[str] = mapped_column(
        String(32), primary_key=True,
    )
    account_id: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
    )
    account_name: Mapped[str] = mapped_column(
        String(256), nullable=False, default="",
    )
    display_name: Mapped[str] = mapped_column(
        String(256), nullable=False, default="",
    )
    division: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True, default="unassigned",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending_admin",
    )
    contractor_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, default=None,
    )
    url: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default=None,
    )
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<GA4Property {self.property_id} "
            f"'{self.display_name}' div={self.division} "
            f"enabled={self.enabled}>"
        )
