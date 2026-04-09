"""
Main FastAPI application for I-Dash Analytics Platform.

Configures routes, middleware, startup/shutdown events, and core application settings.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import (
    ai_router,
    auth_router,
    contractors_router,
    dashboard_router,
    pipelines_router,
    users_router,
)
from app.core.config import settings
from app.core.database import async_session_maker, init_db, close_db
from app.core.security import hash_password
from app.models.user import User, UserRole, UserDepartment
from app.services.scheduler import SchedulerService

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: SchedulerService = None


async def _initialize_database() -> None:
    """Initialize database by creating all tables."""
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise


async def _create_default_admin() -> None:
    """Ensure the primary admin user exists."""
    try:
        async with async_session_maker() as session:
            # Check if Daniel's account exists
            stmt = select(User).where(User.email == "daniel@theconcreteprotector.com")
            result = await session.execute(stmt)
            daniel_exists = result.scalar_one_or_none() is not None

            if not daniel_exists:
                # Create primary admin — Daniel Badasu (super admin)
                admin_user = User(
                    email="daniel@theconcreteprotector.com",
                    full_name="Daniel Badasu",
                    hashed_password=hash_password("IDash2026!"),
                    role=UserRole.ADMIN,
                    department=UserDepartment.ALL,
                    is_active=True,
                )
                session.add(admin_user)
                await session.commit()

                logger.info(
                    "Created admin user (email: daniel@theconcreteprotector.com). "
                    "Please change password after first login."
                )
            else:
                logger.info("Admin user daniel@theconcreteprotector.com already exists")

    except Exception as e:
        logger.error(f"Error creating default admin: {str(e)}")


async def _start_scheduler() -> None:
    """Start the background scheduler for pipeline execution."""
    global _scheduler

    try:
        _scheduler = SchedulerService()
        await _scheduler.start()
        logger.info("Scheduler started successfully")
    except Exception as e:
        logger.warning(f"Scheduler startup failed: {str(e)}. Continuing without scheduler.")


async def _stop_scheduler() -> None:
    """Stop the background scheduler."""
    global _scheduler

    if _scheduler and _scheduler.is_running:
        try:
            await _scheduler.stop()
            logger.info("Scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {str(e)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.

    Startup:
    - Initialize database
    - Create default admin user
    - Start background scheduler

    Shutdown:
    - Stop scheduler
    - Close database connections
    """
    # Startup — the server MUST stay online even if optional services fail.
    # Only a database failure is truly fatal.
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    try:
        await _initialize_database()
    except Exception as e:
        logger.critical(f"DATABASE FAILURE — cannot start: {e}")
        raise  # DB is the only hard dependency

    # Everything below is best-effort — failures are logged, not fatal.
    try:
        await _create_default_admin()
    except Exception as e:
        logger.warning(f"Admin user creation skipped: {e}")

    try:
        await _start_scheduler()
    except Exception as e:
        logger.warning(f"Scheduler startup skipped: {e}")

    logger.info("Application startup completed")

    yield

    # Shutdown
    logger.info("Shutting down application")

    try:
        await _stop_scheduler()
        await close_db()

        logger.info("Application shutdown completed")

    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise analytics platform for aggregating metrics from marketing, sales, and operations",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS — wide open. Railway Firewall handles restriction.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trust proxy headers from Railway / Cloudflare
try:
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
except ImportError:
    pass


# Health check endpoint
@app.get(
    "/health",
    summary="Health check endpoint",
    tags=["Health"],
    responses={
        200: {
            "description": "Service is healthy",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "version": "1.0.0",
                        "service": "I-Dash Analytics",
                    }
                }
            },
        },
    },
)
async def health_check() -> dict:
    """
    Check if the service is running and healthy.

    Returns:
        Dictionary with health status and service information.
    """
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "service": settings.APP_NAME,
        "debug": settings.DEBUG,
    }


# Register API routers
app.include_router(
    auth_router,
    prefix="/api",
)

app.include_router(
    users_router,
    prefix="/api",
    dependencies=[],
)

app.include_router(
    dashboard_router,
    prefix="/api",
)

app.include_router(
    pipelines_router,
    prefix="/api",
)

app.include_router(
    ai_router,
    prefix="/api",
)

app.include_router(
    contractors_router,
    prefix="/api",
)


# Custom exception handlers — must return Response objects, not plain dicts
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Custom handler for HTTP exceptions.

    Returns:
        JSONResponse with error details and correct status code.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "status_code": exc.status_code,
            "type": "http_error",
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Custom handler for unexpected exceptions.

    Returns:
        JSONResponse with 500 status and error message.
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "type": "server_error",
        },
    )


# Root endpoint
@app.get(
    "/",
    summary="API root endpoint",
    tags=["Root"],
)
async def root() -> dict:
    """
    Root endpoint with API information.

    Returns:
        Dictionary with API metadata and available endpoints.
    """
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Enterprise analytics platform",
        "endpoints": {
            "health": "/health",
            "docs": "/api/docs",
            "openapi": "/api/openapi.json",
            "auth": "/api/auth",
            "users": "/api/users",
            "dashboard": "/api/dashboard",
            "pipelines": "/api/pipelines",
            "ai": "/api/ai",
        },
    }


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug",
    )
