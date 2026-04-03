"""
Pipeline modules for I-Dash Analytics Platform.

Exports all available data pipelines for importing elsewhere in the application.
"""

from app.pipelines.base import BasePipeline
from app.pipelines.google_ads import GoogleAdsPipeline
from app.pipelines.google_analytics import GoogleAnalyticsPipeline
from app.pipelines.google_sheets import GoogleSheetsPipeline
from app.pipelines.hubspot import HubSpotPipeline
from app.pipelines.meta_ads import MetaAdsPipeline
from app.pipelines.snapshot import SnapshotPipeline

__all__ = [
    "BasePipeline",
    "HubSpotPipeline",
    "MetaAdsPipeline",
    "GoogleAdsPipeline",
    "GoogleAnalyticsPipeline",
    "GoogleSheetsPipeline",
    "SnapshotPipeline",
]
