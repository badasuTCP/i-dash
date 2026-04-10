"""
Models package for I-Dash Analytics Platform.

Exports all database models for easy importing.
"""

from app.models.brand_asset import BrandAsset
from app.models.contractor import Contractor
from app.models.discovery_audit import DiscoveryAudit
from app.models.ga4_property import GA4Property
from app.models.metrics import (
    DashboardSnapshot,
    GA4Metric,
    GoogleAdMetric,
    GoogleSheetMetric,
    HubSpotContact,
    HubSpotDeal,
    HubSpotMetric,
    MetaAdMetric,
)
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.user import User, UserDepartment, UserRole

__all__ = [
    "BrandAsset",
    "Contractor",
    "DiscoveryAudit",
    "GA4Property",
    "User",
    "UserRole",
    "UserDepartment",
    "HubSpotContact",
    "HubSpotDeal",
    "HubSpotMetric",
    "MetaAdMetric",
    "GoogleAdMetric",
    "GoogleSheetMetric",
    "GA4Metric",
    "DashboardSnapshot",
    "PipelineLog",
    "PipelineStatus",
]
