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
    # Force-import every model module so each ``Mapped[...]`` class registers
    # itself on Base.metadata BEFORE create_all runs. Without this, models
    # that aren't imported via the active request paths (e.g. ShopifyOrder
    # on a cold boot before any /shopify endpoint is called) silently miss
    # table creation — which is exactly how we shipped "shopify_orders does
    # not exist" on Railway.
    import app.models.brand_asset  # noqa: F401
    import app.models.contractor  # noqa: F401
    import app.models.discovery_audit  # noqa: F401
    import app.models.ga4_property  # noqa: F401
    import app.models.metrics  # noqa: F401
    import app.models.pipeline_log  # noqa: F401
    import app.models.pipeline_schedule  # noqa: F401
    import app.models.user  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_pipeline_schedules_schema(conn)
        await _ensure_meta_ad_metrics_schema(conn)
        await _ensure_meta_period_reach_schema(conn)
        await _ensure_google_ad_metrics_schema(conn)
        await _ensure_contractors_schema(conn)
        await _ensure_shopify_customers_schema(conn)
        await _backfill_ad_metric_divisions(conn)
        await _reconcile_ga4_property_enabled(conn)


async def _ensure_pipeline_schedules_schema(conn) -> None:
    """Belt-and-suspenders: explicitly create pipeline_schedules.

    Base.metadata.create_all appears to have skipped this table on a
    recent deploy even though app.models.pipeline_schedule is imported
    above. Running CREATE TABLE IF NOT EXISTS is cheap and idempotent;
    it ensures the schedule API endpoints never hit UndefinedTableError.
    """
    try:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS pipeline_schedules (
                id SERIAL PRIMARY KEY,
                pipeline_name VARCHAR(64) NOT NULL UNIQUE,
                interval_value VARCHAR(16) NOT NULL DEFAULT '4hrs',
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_pipeline_schedules_pipeline_name "
            "ON pipeline_schedules (pipeline_name)"
        ))
        logger.info("ensure_schema: pipeline_schedules reconciled (idempotent)")
    except Exception as exc:
        logger.warning("ensure_schema: pipeline_schedules create failed: %s", exc)


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
        ("division",         "VARCHAR(32)"),
        ("ad_set_name",      "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("conversion_value", "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("ctr",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("cpc",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("cpm",              "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("roas",             "DOUBLE PRECISION NOT NULL DEFAULT 0"),
        ("reach",            "INTEGER NOT NULL DEFAULT 0"),
        ("account_reach",    "INTEGER NOT NULL DEFAULT 0"),
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

    try:
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_meta_ad_metrics_division "
                 "ON meta_ad_metrics (division)")
        )
    except Exception as exc:
        logger.warning("ensure_schema: could not create division index: %s", exc)

    logger.info("ensure_schema: meta_ad_metrics reconciled (idempotent)")


async def _ensure_meta_period_reach_schema(conn) -> None:
    """Ensure meta_period_reach indexes exist.

    The table itself is created by SQLAlchemy's create_all. This adds
    a helpful composite index for the dashboard's lookup pattern.
    """
    try:
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_meta_period_reach_lookup "
            "ON meta_period_reach (account_id, preset_key)"
        ))
    except Exception as exc:
        logger.warning("ensure_schema: meta_period_reach index: %s", exc)


async def _ensure_contractors_schema(conn) -> None:
    """Add meta_account_status column to contractors table if missing."""
    try:
        await conn.execute(text(
            "ALTER TABLE contractors "
            "ADD COLUMN IF NOT EXISTS meta_account_status VARCHAR(64)"
        ))
    except Exception as exc:
        logger.warning("ensure_schema: contractors.meta_account_status: %s", exc)


async def _ensure_shopify_customers_schema(conn) -> None:
    """Widen shopify_customers text columns to handle oddball Shopify data.

    Some customer records put non-name content into first_name/last_name
    (e.g. addresses, company blobs). The original 128-char cap caused
    StringDataRightTruncationError during backfill. ALTER COLUMN TYPE
    on a widening VARCHAR is a metadata-only operation in Postgres.
    """
    WIDENED = [
        ("first_name", "VARCHAR(256)"),
        ("last_name",  "VARCHAR(256)"),
        ("state",      "VARCHAR(128)"),
    ]
    for col, new_type in WIDENED:
        try:
            await conn.execute(text(
                f"ALTER TABLE shopify_customers ALTER COLUMN {col} TYPE {new_type}"
            ))
        except Exception as exc:
            logger.warning(
                "ensure_schema: shopify_customers.%s widen to %s failed: %s",
                col, new_type, exc,
            )


async def _ensure_google_ad_metrics_schema(conn) -> None:
    """Idempotent ADD COLUMN pass for google_ad_metrics.

    Adds the brand/division tag so we can hard-separate Sani-Tred / I-BOS
    Google Ads spend without relying on brand_assets lookups at query time.
    """
    COLUMNS = [
        ("division", "VARCHAR(32)"),
    ]
    for col_name, col_type in COLUMNS:
        stmt = (
            f"ALTER TABLE google_ad_metrics "
            f"ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
        )
        try:
            await conn.execute(text(stmt))
        except Exception as exc:
            logger.warning(
                "ensure_schema: failed to ALTER google_ad_metrics ADD %s (%s): %s",
                col_name, col_type, exc,
            )

    try:
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_google_ad_metrics_division "
                 "ON google_ad_metrics (division)")
        )
    except Exception as exc:
        logger.warning("ensure_schema: could not create gads division index: %s", exc)

    logger.info("ensure_schema: google_ad_metrics reconciled (idempotent)")


async def _reconcile_ga4_property_enabled(conn) -> None:
    """One-shot reconciliation: bring ga4_properties.enabled in sync with
    contractors.active. Older versions of the approve endpoint flipped
    status but not enabled, leaving GA4 properties tied to an active
    contractor with enabled=False — which caused the Web Analytics page
    to show 'No data' despite the contractor appearing as Active in the
    Contractor Management UI.

    Safe to run every boot: every UPDATE is a no-op once the values agree.
    """
    try:
        # 0. Purge act_144305066 (CP Internal Training) from I-BOS contractors.
        await conn.execute(text("""
            DELETE FROM contractors
             WHERE meta_account_id = 'act_144305066'
               AND division IN ('i-bos', 'ibos')
        """))

        # 0b. Merge [META]-prefixed duplicate contractors back into their
        #     non-prefixed counterparts. Many seed contractors exist with
        #     short names ("Floor Warriors") and Meta discovery created
        #     duplicates ("[META] Floor Warriors"). For each duplicate pair,
        #     copy the meta_account_id + status onto the original and
        #     delete the duplicate.
        try:
            await conn.execute(text("""
                UPDATE contractors AS orig
                   SET meta_account_id = COALESCE(orig.meta_account_id, dup.meta_account_id),
                       meta_account_status = COALESCE(orig.meta_account_status, dup.meta_account_status),
                       updated_at = NOW()
                  FROM contractors AS dup
                 WHERE dup.name LIKE '[META]%'
                   AND orig.id <> dup.id
                   AND LOWER(orig.name) = LOWER(REPLACE(dup.name, '[META] ', ''))
            """))
            await conn.execute(text("""
                DELETE FROM contractors
                 WHERE name LIKE '[META]%'
                   AND EXISTS (
                       SELECT 1 FROM contractors orig
                        WHERE orig.id <> contractors.id
                          AND LOWER(orig.name) = LOWER(REPLACE(contractors.name, '[META] ', ''))
                   )
            """))
        except Exception as merge_exc:
            logger.warning("ensure_schema: meta duplicate merge skipped: %s", merge_exc)

        # 1. Exact contractor_id match — any GA4 property whose contractor
        #    is active/approved must be enabled.
        await conn.execute(text("""
            UPDATE ga4_properties
               SET enabled = TRUE, status = 'active', updated_at = NOW()
             WHERE contractor_id IN (
                       SELECT id FROM contractors
                        WHERE active = TRUE AND status = 'active'
                   )
               AND (enabled IS DISTINCT FROM TRUE OR status IS DISTINCT FROM 'active')
        """))

        # 2. Explicit property-to-contractor mapping (canonical source of truth).
        #    GA4 property IDs → contractor short IDs. This is the most
        #    reliable way to link them since display_names and slugs are
        #    inconsistent across discovery runs.
        PROPERTY_CONTRACTOR_MAP = {
            # Contractor: Columbus Concrete Coatings
            "510563271": "columbus",
            # Contractor: Tailored Concrete Coatings
            "355408548": "tailored",
            "513309293": "tailored",      # DCKN account duplicate
            # Contractor: Floor Warriors
            "355414836": "floorwarriors",
            # Contractor: Graber Design Coatings
            "519168501": "graber",
            # Contractor: Reeves Concrete Solutions (2 properties)
            "355429527": "reeves",
            "345201025": "reeves",        # reevesconcretesolutions.com
            # Contractor: SLG Concrete Coatings
            "509516664": "slg",
            # Contractor: Elite Pool Coatings
            "530878511": "elitepool",
            # Contractor: Beckley Concrete Decor
            "347767965": "beckley",
        }
        for prop_id, contractor_id in PROPERTY_CONTRACTOR_MAP.items():
            await conn.execute(text("""
                UPDATE ga4_properties
                   SET contractor_id = :cid,
                       enabled = TRUE,
                       status = 'active',
                       updated_at = NOW()
                 WHERE property_id = :pid
                   AND (contractor_id IS DISTINCT FROM :cid
                        OR enabled IS DISTINCT FROM TRUE)
            """), {"pid": prop_id, "cid": contractor_id})

        # 2b. Fuzzy name match for any remaining I-BOS properties not in
        #     the explicit map above.
        await conn.execute(text("""
            UPDATE ga4_properties p
               SET contractor_id = sub.cid,
                   enabled = TRUE,
                   status = 'active',
                   updated_at = NOW()
              FROM (
                  SELECT DISTINCT ON (p2.property_id)
                         p2.property_id AS pid,
                         c.id           AS cid
                    FROM ga4_properties p2
                    JOIN contractors c
                      ON c.active = TRUE
                     AND c.status = 'active'
                     AND c.division IN ('i-bos', 'ibos')
                     AND (
                         LOWER(p2.display_name) LIKE '%' || LOWER(c.name) || '%'
                         OR LOWER(c.name) LIKE '%' || LOWER(
                             REPLACE(REPLACE(REPLACE(p2.display_name, '[GA4] ', ''), ' - GA4', ''), '.com', '')
                         ) || '%'
                     )
                   WHERE p2.division = 'ibos'
                     AND p2.contractor_id NOT IN (
                         SELECT id FROM contractors WHERE active = TRUE AND status = 'active'
                     )
                   ORDER BY p2.property_id, LENGTH(c.name) DESC
              ) sub
             WHERE p.property_id = sub.pid
               AND (p.contractor_id IS DISTINCT FROM sub.cid
                    OR p.enabled IS DISTINCT FROM TRUE)
        """))

        # 2c. Any I-BOS property that did NOT match an active contractor
        #     stays disabled so the dropdown only shows relevant sites.
        await conn.execute(text("""
            UPDATE ga4_properties
               SET enabled = FALSE, status = 'inactive', updated_at = NOW()
             WHERE division = 'ibos'
               AND contractor_id NOT IN (
                   SELECT id FROM contractors
                    WHERE active = TRUE AND status = 'active'
               )
               AND (enabled IS DISTINCT FROM FALSE OR status IS DISTINCT FROM 'inactive')
        """))

        # 3. CP + Sani-Tred properties: always enabled (no contractor gating).
        await conn.execute(text("""
            UPDATE ga4_properties
               SET enabled = TRUE, status = 'active', updated_at = NOW()
             WHERE division IN ('cp', 'sanitred')
               AND (enabled IS DISTINCT FROM TRUE OR status IS DISTINCT FROM 'active')
        """))

        # 4. Explicitly inactive/rejected contractors disable their exact matches.
        await conn.execute(text("""
            UPDATE ga4_properties
               SET enabled = FALSE, status = 'inactive', updated_at = NOW()
             WHERE contractor_id IN (
                       SELECT id FROM contractors
                        WHERE active = FALSE
                          AND status IN ('inactive', 'rejected')
                   )
               AND (enabled IS DISTINCT FROM FALSE OR status IS DISTINCT FROM 'inactive')
        """))

        logger.info("ensure_schema: ga4_properties.enabled reconciled with contractors.active")
    except Exception as exc:
        logger.warning("ensure_schema: ga4 reconcile skipped: %s", exc)


async def _backfill_ad_metric_divisions(conn) -> None:
    """Stamp brand/division on every existing ad-metric row based on the
    canonical account/customer ID mapping. Safe to run on every boot.

    Meta:
      act_144305066 → 'cp'  (CP Internal Training)
      everything else → 'ibos'  (entire I-BOS portfolio under our Business)

    Google Ads:
      2823564937 → 'sanitred'  (Sani-Tred Google Ads)
      any other  → 'ibos'
    """
    try:
        # Meta CP tag (only the training account)
        await conn.execute(text("""
            UPDATE meta_ad_metrics
               SET division = 'cp'
             WHERE account_id = 'act_144305066'
               AND (division IS NULL OR division <> 'cp')
        """))
        # Meta I-BOS tag (everything else)
        await conn.execute(text("""
            UPDATE meta_ad_metrics
               SET division = 'ibos'
             WHERE (account_id IS NULL OR account_id <> 'act_144305066')
               AND (division IS NULL OR division <> 'ibos')
        """))
        # Google Ads Sani-Tred tag
        await conn.execute(text("""
            UPDATE google_ad_metrics
               SET division = 'sanitred'
             WHERE customer_id = '2823564937'
               AND (division IS NULL OR division <> 'sanitred')
        """))
        # Google Ads I-BOS tag (everything else)
        await conn.execute(text("""
            UPDATE google_ad_metrics
               SET division = 'ibos'
             WHERE (customer_id IS NULL OR customer_id <> '2823564937')
               AND (division IS NULL OR division <> 'ibos')
        """))
        logger.info("ensure_schema: division backfill complete")
    except Exception as exc:
        logger.warning("ensure_schema: division backfill skipped: %s", exc)


async def close_db() -> None:
    """Close database connections and dispose of engine."""
    await engine.dispose()
