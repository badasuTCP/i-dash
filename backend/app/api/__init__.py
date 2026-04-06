"""
API routers package for I-Dash Analytics Platform.

Exports all API routers for easy importing into the main application.
"""

from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.contractors import router as contractors_router
from app.api.dashboard import router as dashboard_router
from app.api.pipelines import router as pipelines_router
from app.api.users import router as users_router

__all__ = [
    "auth_router",
    "users_router",
    "dashboard_router",
    "pipelines_router",
    "ai_router",
    "contractors_router",
]
