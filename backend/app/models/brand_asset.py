"""
Brand Asset model for I-Dash Analytics Platform.

Maps discovered platform accounts (Meta, Google Ads, GA4) to specific brands
(CP, Sani-Tred, I-BOS). Populated when a Super Admin approves a discovery
and selects a brand assignment.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class BrandAsset(Base):
    """
    Links a platform account to a brand for dashboard filtering.

    Attributes:
        id:           Auto-increment PK.
        platform:     'meta', 'google_ads', 'ga4'.
        account_id:   Platform-specific ID (e.g. 'act_123', '6754610688', '355408548').
        account_name: Human-readable name at time of mapping.
        brand:        Target brand slug: 'cp', 'sanitred', 'ibos'.
        source:       Discovery source ('meta_discovery', 'ga4_discovery', 'manual').
        notes:        Admin notes (optional).
        mapped_at:    When the admin approved this mapping.
        mapped_by:    Email of the admin who approved.
    """

    __tablename__ = "brand_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    account_name: Mapped[str] = mapped_column(String(256), nullable=False)
    brand: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="manual")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mapped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    mapped_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    def __repr__(self) -> str:
        return f"<BrandAsset {self.platform}:{self.account_id} → {self.brand}>"
