"""
Main FastAPI application for I-Dash Analytics Platform.

Configures routes, middleware, startup/shutdown events, and core application settings.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Abort requests that take too long. Pipeline and auth endpoints get extra time."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Pipeline runs + sales intelligence need longer (heavy DB queries)
        if "/pipelines/" in path or "/sales-intelligence" in path or "/brand-summary" in path:
            timeout = 60.0
        else:
            timeout = 25.0
        try:
            return await asyncio.wait_for(call_next(request), timeout=timeout)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": f"Request timed out ({timeout:.0f}s limit)"},
            )

from app.api import (
    ai_router,
    auth_router,
    contractors_router,
    dashboard_router,
    pipelines_router,
    shopify_oauth_router,
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


async def _seed_ibos_brand_assets() -> None:
    """Pre-populate brand_assets with ALL known brand mappings."""
    try:
        from sqlalchemy import delete as sa_delete
        from app.models.brand_asset import BrandAsset

        async with async_session_maker() as session:
            # ── One-time CP purge ─────────────────────────────────────────
            # Older seeds mapped act_144305066 (CP Internal Training) to the
            # ibos brand as well. This double-counted CP spend in every
            # I-BOS report. The mapping is now canonical CP-only, so
            # nuke the stale (meta, act_144305066, ibos) row on every boot.
            # DELETE is a no-op if the row is already gone.
            try:
                purge_result = await session.execute(
                    sa_delete(BrandAsset).where(
                        BrandAsset.platform == "meta",
                        BrandAsset.account_id == "act_144305066",
                        BrandAsset.brand == "ibos",
                    )
                )
                if purge_result.rowcount:
                    await session.commit()
                    logger.info(
                        "Purged %d stale (meta, act_144305066, ibos) brand_asset row(s)",
                        purge_result.rowcount,
                    )
            except Exception as purge_exc:
                logger.warning("CP purge on brand_assets skipped: %s", purge_exc)

            existing = await session.execute(select(BrandAsset).limit(1))
            if existing.scalar_one_or_none():
                return  # Already seeded

            ALL_BRAND_ASSETS = [
                # ── CP Brand (internal training) ──────────────────────────
                ("meta", "act_144305066", "CP Internal Training", "cp"),

                # ── Sani-Tred Brand ───────────────────────────────────────
                ("google_ads", "2823564937", "Sani-Tred Google Ads", "sanitred"),

                # ── I-BOS Brand (11 Meta + 2 Google) ──────────────────────
                ("meta", "act_1614487789160872", "Beckley Concrete Decor (Concrete Transformations)", "ibos"),
                ("meta", "act_673130245854523", "Columbus Concrete Coatings", "ibos"),
                ("meta", "act_1366105912189047", "SLG Concrete Coatings", "ibos"),
                ("meta", "act_1695172861344941", "Tailored Concrete Coatings", "ibos"),
                ("meta", "act_1804828293424131", "Floor Warriors", "ibos"),
                ("meta", "act_1621412735957179", "Graber Design Coatings", "ibos"),
                ("meta", "act_1593411211628312", "TVS Coatings", "ibos"),
                ("meta", "act_590626230518758", "LNS Concrete Coatings", "ibos"),
                ("meta", "act_1216723690570763", "Reveles Epoxy", "ibos"),
                ("meta", "act_1641409050108751", "SCF Concrete Promo", "ibos"),
                # act_144305066 intentionally NOT mapped to ibos — it is the
                # CP Internal Training account. Mapping it to ibos would
                # double-count CP spend inside the I-BOS portfolio.
                ("google_ads", "6754610688", "Tailored Concrete Coatings (Google Ads)", "ibos"),
                ("google_ads", "2957400868", "SLG Contracting Inc. (Google Ads)", "ibos"),
            ]
            for platform, acct_id, name, brand in ALL_BRAND_ASSETS:
                session.add(BrandAsset(
                    platform=platform, account_id=acct_id, account_name=name,
                    brand=brand, source="seed", mapped_by="system",
                ))
            await session.commit()
            logger.info("Seeded %d brand assets across CP/SaniTred/IBOS", len(ALL_BRAND_ASSETS))
    except Exception as e:
        logger.warning("Brand asset seeding failed: %s", e)


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
        await _seed_ibos_brand_assets()
    except Exception as e:
        logger.warning(f"I-BOS brand asset seeding skipped: {e}")

    # Rehydrate Shopify runtime creds from DB into /tmp so pipelines survive
    # pod restarts without a manual /api/shopify/prime round-trip.
    try:
        from app.api.shopify_oauth import rehydrate_creds_from_db
        rehydrated = await rehydrate_creds_from_db()
        if rehydrated:
            # Re-init the Shopify pipeline now that creds are available so
            # the first scheduled tick after startup doesn't fail.
            try:
                from app.api.pipelines import get_pipeline_service
                from app.pipelines.shopify import ShopifyPipeline
                svc = get_pipeline_service()
                svc.pipelines["shopify"] = ShopifyPipeline()
                svc.init_errors.pop("shopify", None)
                logger.info("Shopify pipeline re-initialized from DB-backed creds")
            except Exception as e:
                logger.warning(f"Shopify pipeline re-init after rehydrate failed: {e}")
    except Exception as e:
        logger.warning(f"Shopify creds rehydrate skipped: {e}")

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

# 15-second request timeout — prevents memory spikes from heavy queries
app.add_middleware(TimeoutMiddleware)

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

app.include_router(
    shopify_oauth_router,
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


# ──────────────────────────────────────────────────────────────────────
# Static frontend (unified service)
# ──────────────────────────────────────────────────────────────────────
# The Dockerfile copies the Vite build output into /app/static. Mount it
# if the directory exists so this same service can serve the React SPA.
# A catch-all route at the bottom returns index.html for any non-API
# path so client-side routing (react-router) works on deep links / refresh.
from pathlib import Path as _Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_STATIC_DIR = _Path(__file__).resolve().parent.parent / "static"
_INDEX_HTML = _STATIC_DIR / "index.html"

if _STATIC_DIR.exists():
    # Vite's build emits everything referenced from index.html under /assets
    _assets_dir = _STATIC_DIR / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")
    # Everything else at the root (favicon, logos, etc.)
    app.mount(
        "/static-root",
        StaticFiles(directory=str(_STATIC_DIR)),
        name="static-root",
    )
    logger.info("Serving frontend from %s", _STATIC_DIR)
else:
    logger.info("No frontend build at %s — API-only mode", _STATIC_DIR)


@app.get("/", include_in_schema=False)
async def _serve_index():
    if _INDEX_HTML.exists():
        return FileResponse(str(_INDEX_HTML))
    # API-only fallback (no frontend built)
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "endpoints": {
            "health": "/health",
            "docs": "/api/docs",
            "api": "/api",
        },
    }


@app.get("/{full_path:path}", include_in_schema=False)
async def _spa_catch_all(full_path: str):
    """
    SPA catch-all. Returns index.html for any non-API path so that
    react-router deep links (e.g. /iboss/marketing) survive a refresh.

    Requests to /api/*, /health, /docs are handled by the routers
    registered above and never reach this handler.
    """
    # Never swallow API / doc routes
    if (
        full_path.startswith("api/")
        or full_path.startswith("health")
        or full_path.startswith("docs")
        or full_path.startswith("openapi")
        or full_path.startswith("assets/")
    ):
        raise HTTPException(status_code=404, detail="Not Found")

    # If the request matches a real file on disk (favicon.ico, robots.txt, etc.)
    # serve it directly.
    candidate = _STATIC_DIR / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))

    if _INDEX_HTML.exists():
        return FileResponse(str(_INDEX_HTML))

    raise HTTPException(status_code=404, detail="Not Found")


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
