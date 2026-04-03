"""
Schemas package for I-Dash Analytics Platform.

Exports all Pydantic schemas for easy importing.
"""

from app.schemas.metrics import (
    ChangeDirection,
    DashboardOverview,
    DashboardSnapshotCreate,
    DashboardSnapshotResponse,
    GoogleAdMetricCreate,
    GoogleAdMetricResponse,
    GoogleSheetMetricCreate,
    GoogleSheetMetricResponse,
    HubSpotMetricCreate,
    HubSpotMetricResponse,
    MetaAdMetricCreate,
    MetaAdMetricResponse,
    ScoreCardData,
)
from app.schemas.pipeline import PipelineLogCreate, PipelineLogResponse
from app.schemas.user import (
    Token,
    TokenData,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
)

__all__ = [
    # User schemas
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserLogin",
    "Token",
    "TokenData",
    # Metrics schemas
    "HubSpotMetricCreate",
    "HubSpotMetricResponse",
    "MetaAdMetricCreate",
    "MetaAdMetricResponse",
    "GoogleAdMetricCreate",
    "GoogleAdMetricResponse",
    "GoogleSheetMetricCreate",
    "GoogleSheetMetricResponse",
    "DashboardSnapshotCreate",
    "DashboardSnapshotResponse",
    "ScoreCardData",
    "ChangeDirection",
    "DashboardOverview",
    # Pipeline schemas
    "PipelineLogCreate",
    "PipelineLogResponse",
]
