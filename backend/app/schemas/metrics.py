"""
Metrics-related Pydantic schemas for I-Dash Analytics Platform.

Provides request/response schemas for metrics from various data sources
and dashboard aggregation operations.
"""

from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class HubSpotMetricCreate(BaseModel):
    """Schema for creating HubSpot metric."""

    date: date
    contacts_created: int = Field(default=0, ge=0)
    deals_created: int = Field(default=0, ge=0)
    deals_won: int = Field(default=0, ge=0)
    deals_lost: int = Field(default=0, ge=0)
    revenue_won: float = Field(default=0.0, ge=0)
    pipeline_value: float = Field(default=0.0, ge=0)
    meetings_booked: int = Field(default=0, ge=0)
    emails_sent: int = Field(default=0, ge=0)
    tasks_completed: int = Field(default=0, ge=0)


class HubSpotMetricResponse(BaseModel):
    """Schema for HubSpot metric response."""

    id: int
    date: date
    contacts_created: int
    deals_created: int
    deals_won: int
    deals_lost: int
    revenue_won: float
    pipeline_value: float
    meetings_booked: int
    emails_sent: int
    tasks_completed: int
    fetched_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class MetaAdMetricCreate(BaseModel):
    """Schema for creating Meta Ad metric."""

    date: date
    campaign_id: str
    campaign_name: str
    ad_set_name: str
    impressions: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    spend: float = Field(default=0.0, ge=0)
    conversions: float = Field(default=0.0, ge=0)
    conversion_value: float = Field(default=0.0, ge=0)
    ctr: float = Field(default=0.0, ge=0, le=100)
    cpc: float = Field(default=0.0, ge=0)
    cpm: float = Field(default=0.0, ge=0)
    roas: float = Field(default=0.0, ge=0)
    reach: int = Field(default=0, ge=0)
    frequency: float = Field(default=0.0, ge=0)


class MetaAdMetricResponse(BaseModel):
    """Schema for Meta Ad metric response."""

    id: int
    date: date
    campaign_id: str
    campaign_name: str
    ad_set_name: str
    impressions: int
    clicks: int
    spend: float
    conversions: float
    conversion_value: float
    ctr: float
    cpc: float
    cpm: float
    roas: float
    reach: int
    frequency: float
    fetched_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class GoogleAdMetricCreate(BaseModel):
    """Schema for creating Google Ad metric."""

    date: date
    campaign_id: str
    campaign_name: str
    ad_group_name: str
    impressions: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    spend: float = Field(default=0.0, ge=0)
    conversions: float = Field(default=0.0, ge=0)
    conversion_value: float = Field(default=0.0, ge=0)
    ctr: float = Field(default=0.0, ge=0, le=100)
    cpc: float = Field(default=0.0, ge=0)
    cpm: float = Field(default=0.0, ge=0)
    roas: float = Field(default=0.0, ge=0)
    search_impression_share: float = Field(default=0.0, ge=0, le=100)


class GoogleAdMetricResponse(BaseModel):
    """Schema for Google Ad metric response."""

    id: int
    date: date
    campaign_id: str
    campaign_name: str
    ad_group_name: str
    impressions: int
    clicks: int
    spend: float
    conversions: float
    conversion_value: float
    ctr: float
    cpc: float
    cpm: float
    roas: float
    search_impression_share: float
    fetched_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class GoogleSheetMetricCreate(BaseModel):
    """Schema for creating Google Sheet metric."""

    sheet_name: str
    date: date
    metric_name: str
    metric_value: float
    category: str


class GoogleSheetMetricResponse(BaseModel):
    """Schema for Google Sheet metric response."""

    id: int
    sheet_name: str
    date: date
    metric_name: str
    metric_value: float
    category: str
    fetched_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class DashboardSnapshotCreate(BaseModel):
    """Schema for creating dashboard snapshot."""

    date: date
    total_revenue: float = Field(default=0.0, ge=0)
    total_ad_spend: float = Field(default=0.0, ge=0)
    total_leads: int = Field(default=0, ge=0)
    total_deals_won: int = Field(default=0, ge=0)
    blended_roas: float = Field(default=0.0, ge=0)
    cost_per_lead: float = Field(default=0.0, ge=0)
    lead_to_deal_rate: float = Field(default=0.0, ge=0, le=100)


class DashboardSnapshotResponse(BaseModel):
    """Schema for dashboard snapshot response."""

    id: int
    date: date
    total_revenue: float
    total_ad_spend: float
    total_leads: int
    total_deals_won: int
    blended_roas: float
    cost_per_lead: float
    lead_to_deal_rate: float
    created_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True


class ChangeDirection(str, Enum):
    """Direction of metric change."""

    UP = "up"
    DOWN = "down"
    NEUTRAL = "neutral"


class ScoreCardData(BaseModel):
    """Schema for scorecard data on dashboard."""

    label: str = Field(..., description="Scorecard label")
    value: str = Field(..., description="Current metric value")
    change_percent: Optional[float] = Field(
        None,
        description="Percentage change from previous period",
    )
    change_direction: Optional[ChangeDirection] = Field(
        None,
        description="Direction of change (up, down, neutral)",
    )
    icon: Optional[str] = Field(None, description="Icon name for display")
    color: Optional[str] = Field(
        None,
        description="Color code (hex or named color)",
    )

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "label": "Total Revenue",
                "value": "$425,000",
                "change_percent": 12.5,
                "change_direction": "up",
                "icon": "trending-up",
                "color": "#10B981",
            }
        }


class DashboardOverview(BaseModel):
    """Schema for dashboard overview with aggregated metrics."""

    scorecards: List[ScoreCardData] = Field(..., description="List of metric cards")
    date_range: str = Field(
        ...,
        description="Human-readable date range (e.g., 'Last 30 days')",
    )
    summary_text: Optional[str] = Field(
        None,
        description="AI-generated summary of key insights",
    )
    last_updated: datetime = Field(
        ...,
        description="Timestamp of last data refresh",
    )

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "scorecards": [
                    {
                        "label": "Total Revenue",
                        "value": "$425,000",
                        "change_percent": 12.5,
                        "change_direction": "up",
                        "icon": "trending-up",
                        "color": "#10B981",
                    },
                    {
                        "label": "Total Ad Spend",
                        "value": "$125,000",
                        "change_percent": -3.2,
                        "change_direction": "down",
                        "icon": "trending-down",
                        "color": "#EF4444",
                    },
                ],
                "date_range": "Last 30 days",
                "summary_text": "Revenue is up 12.5% with improved ROAS across all channels.",
                "last_updated": "2024-03-24T18:00:00Z",
            }
        }
