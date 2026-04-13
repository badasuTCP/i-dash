"""
Database configuration and utilities for I-Dash Analytics Platform.

Provides async SQLAlchemy engine, session factory, and dependency injection
for database access across the application.
"""

import logging
import re
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_engine_args():
    """
    Prepare the database URL and connect_args for asyncpg.

    asyncpg does not accept the 'sslmode' query parameter that Railway
    (and other Postgres providers) append to DATABASE_URL. We strip it
    and translate 'sslmode=require' -> connect_args={"ssl": True}.
    """
    url = settings.DATABASE_URL
    connect_args = {}

    if "sslmode=" in url:
        # Capture the sslmode value before removing it
        match = re.search(r"sslmode=([^&]+)", url)
        if match and match.group(1) in ("require", "verify-ca", "verify-full"):
            connect_args["ssl"] = True

        # Remove the sslmode param cleanly from the query string
        url = re.sub(r"[?&]sslmode=[^&]*", "", url)
        url = re.sub(r"\?$", "", url)  # remove trailing '?' if nothing left

    return url, connect_args


_db_url, _connect_args = _build_engine_args()

# Create async engine with optimized settings
engine = create_async_engine(
    _db_url,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
    connect_args=_connect_args,
)

# Session factory for creating new sessions
async_session_maker = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    future=True,
)

# Declarative base for all ORM models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for FastAPI endpoints to get a database session.

    Yields:
        AsyncSession: Active database session that is automatically closed.

    Example:
        @router.get("/users")
        async def list_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database by creating all tables AND reconciling known
    column drift (lightweight ALTER TABLE migrations for Railway/Postgres).

    ``Base.metadata.create_all`` only creates tables that are entirely
    missing — it does not add new columns to an existing table. When the
    SQLAlchemy model gains a column (e.g. ``meta_ad_metrics.account_id``)
    we need an idempotent ``ALTER TABLE ... ADD COLUMN IF NOT EXISTS``
    pass on every startup so the live schema stays in lockstep with the
    code. Each statement is safe to run repeatedly.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_meta_ad_metrics_schema(conn)


async def _ensure_meta_ad_metrics_schema(conn) -> None:
    """Idempotent ADD COLUMN pass for meta_ad_metrics.

    Postgres has supported ``ADD COLUMN IF NOT EXISTS`` since 9.6, so each
    statement is a no-op after the first successful run. We log each one
    so the startup output makes it obvious which columns were added.
    """
    # (column_name, sql_type_with_default) — keep in sync with MetaAdMetric.
    COLUMNS = [
        ("account_id",       "VARCHAR(128)"),
        ("account_name",     "VARCHAR(256)"),
        ("ad_set_name",      "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("conversion_value", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("ctr",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("cpc",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("cpm",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("roas",             "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("reach",            "INTEGER NOT NULL DEFAULT 0"),
        ("frequency",        "DOUBLE PRECISION NOT NULL DEFAULT 0"),
    ]

    for col_name, col_type in COLUMNS:
        stmt = (
            f"ALTER TABLE meta_ad_metrics "
            f"ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
        )
        try:
            await conn.execute(text(stmt))
        except Exception as exc:
            # A failure here must NOT crash the startup path. Log and keep
            # going so the rest of the app still boots.
            logger.warning(
                "ensure_schema: failed to ALTER meta_ad_metrics ADD %s (%s): %s",
                col_name, col_type, exc,
            )

    # Helpful index for the account-scoped queries in dashboard.py
    try:
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_meta_ad_metrics_account_id "
                 "ON meta_ad_metrics (account_id)")
        )
    except Exception as exc:
        logger.warning("ensure_schema: could not create account_id index: %s", exc)

    logger.info("ensure_schema: meta_ad_metrics reconciled (idempotent)")


async def close_db() -> None:
    """Close database connections and dispose of engine."""
    await engine.dispose()
