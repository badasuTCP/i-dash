"""
Phase 2 v2 API namespace.

All Phase 2 endpoints land under /api/v2/* so the existing /api/*
contract is preserved verbatim during the Hard Freeze. The frontend
does not consume any of these routes yet.
"""

from app.api.v2.anomalies import router as anomalies_v2_router
from app.api.v2.diagnostics import router as diagnostics_v2_router
from app.api.v2.lineage import router as lineage_v2_router
from app.api.v2.projections import router as projections_v2_router

__all__ = [
    "anomalies_v2_router",
    "diagnostics_v2_router",
    "lineage_v2_router",
    "projections_v2_router",
]
