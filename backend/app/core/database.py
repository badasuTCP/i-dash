"""
Database configuration and utilities for I-Dash Analytics Platform.

Provides async SQLAlchemy engine, session factory, and dependency injection
for database access across the application.
"""

import re
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


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
    """Initialize database by creating all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database connections and dispose of engine."""
    await engine.dispose()
