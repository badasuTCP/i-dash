"""
Contractor model for I-Dash Analytics Platform.

Stores contractor visibility preferences so they persist across sessions,
browsers, and users.  The super-admin toggles on the Contractor Management
page write through the API → database, guaranteeing state survives logout.

Supports Meta API Auto-Discovery: new contractors found via Meta Business API
are inserted with status='pending_admin' and active=False until a Super Admin
reviews and approves them.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Contractor(Base):
    """
    Persistent contractor record.

    Attributes:
        id: Contractor slug (e.g. 'beckley', 'decorative').
        name: Human-readable display name.
        division: Parent division ('i-bos', 'cp', 'sanitred').
        active: Whether the contractor is visible on dashboards.
        status: Lifecycle status — 'active', 'inactive', 'pending_admin', or 'rejected'.
                Contractors discovered by the Meta pipeline start as
                'pending_admin' and must be approved by a Super Admin.
                Rejected contractors are kept for audit — never deleted.
        meta_account_id: Meta Business API ad-account ID (e.g. 'act_123456').
                         NULL for contractors not yet linked to a Meta account.
        updated_at: Last time any field was changed.
    """

    __tablename__ = "contractors"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="i-bos")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active",
    )
    meta_account_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, default=None,
    )
    # Meta ad account status from the API: 1=active, 2=disabled, 3=unsettled,
    # 7=pending_risk_review, 9=pending_settlement, 101=closed, 201=temp_unavail.
    # Stored as a human-readable label by the discovery pipeline.
    meta_account_status: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, default=None,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<Contractor {self.id} active={self.active} status={self.status}>"
