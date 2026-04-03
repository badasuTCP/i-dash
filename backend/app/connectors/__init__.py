"""
Data source connectors for I-Dash Analytics Platform.

This package provides the connector registry that maps data sources
to divisions (CP, Sani-Tred, I-BOS) and manages pipeline execution.
"""

from app.connectors.registry import ConnectorRegistry, Division

__all__ = ["ConnectorRegistry", "Division"]
