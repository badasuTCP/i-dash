"""
Models package for I-Dash Analytics Platform.

Exports all database models for easy importing.
"""

from app.models.contractor import Contractor
from app.models.metrics import (
    DashboardSnapshot,
    GoogleAdMetric,
    GoogleSheetMetric,
    HubSpotMetric,
    MetaAdMetric,
)
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.user import User, UserDepartment, UserRole

__all__ = [
    "Contractor",
    "User",
    "UserRole",
    "UserDepartment",
    "HubSpotMetric",
    "MetaAdMetric",
    "GoogleAdMetric",
    "GoogleSheetMetric",
    "DashboardSnapshot",
    "PipelineLog",
    "PipelineStatus",
]
