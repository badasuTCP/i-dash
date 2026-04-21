"""
rebuild_db.py — DESTRUCTIVE: drops and recreates all tables.

Usage:
    # From the repo root, after exporting DATABASE_URL:
    python -m backend.scripts.rebuild_db --yes-i-know-this-drops-everything

    # With confirmation prompt (safer):
    python -m backend.scripts.rebuild_db

What it does
    1. Introspects every SQLAlchemy table registered on Base.metadata.
    2. Drops them all in reverse dependency order.
    3. Recreates them cleanly via Base.metadata.create_all.
    4. Runs the existing schema-drift hooks so indexes + ADD COLUMN
       IF NOT EXISTS passes land.

What it does NOT do
    - Run any pipelines. You must trigger meta_ads, google_ads, etc.
      explicitly after the rebuild, or wait for the APScheduler to
      pick them up on its next 4-hour cycle.
    - Touch anything outside the configured DATABASE_URL. If you
      point this at staging and run it, staging is what gets wiped.

Requires
    DATABASE_URL set in the environment (same variable the app uses).
    The script prints the host it's about to operate on before any
    destructive action so you can abort.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from urllib.parse import urlparse

# Make `app.*` imports resolve when running via `python -m backend.scripts.rebuild_db`
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(THIS_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("rebuild_db")


def _redacted_host(url: str) -> str:
    """Return host:port/db from a database URL, password stripped."""
    try:
        p = urlparse(url)
        netloc = p.hostname or "?"
        if p.port:
            netloc = f"{netloc}:{p.port}"
        db = (p.path or "/?").lstrip("/")
        return f"{netloc}/{db}"
    except Exception:  # noqa: BLE001
        return "<unparsable DATABASE_URL>"


async def rebuild_db(skip_prompt: bool = False) -> None:
    """Drop and recreate every table on Base.metadata."""
    # Import lazily so import errors don't crash the argparse flow
    from app.core.database import Base, engine, init_db  # noqa: PLC0415

    db_url = os.environ.get("DATABASE_URL", "")
    where = _redacted_host(db_url) if db_url else "<DATABASE_URL not set>"

    print("=" * 72)
    print("rebuild_db — DESTRUCTIVE OPERATION")
    print("=" * 72)
    print(f"Target database: {where}")
    print()

    if not skip_prompt:
        print("This will DROP every application table and RECREATE them.")
        print("Any row of data currently in the target database will be GONE.")
        resp = input("Type the word 'REBUILD' (all caps) to proceed: ").strip()
        if resp != "REBUILD":
            print("Aborted. No changes made.")
            return

    # Discover tables registered with SQLAlchemy
    tables = list(Base.metadata.sorted_tables)
    print(f"Discovered {len(tables)} tables on Base.metadata:")
    for t in tables:
        print(f"  - {t.name}")
    print()

    # Drop all (reverse dependency order via drop_all)
    print("Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    print("  ✓ drop_all complete")

    # Recreate — reuses the same startup hook the app calls so schema-drift
    # ALTER TABLE statements and indexes all land.
    print("Recreating all tables via init_db() (runs schema-drift hooks)...")
    await init_db()
    print("  ✓ create_all + schema-drift complete")

    # Dispose the engine so the script exits cleanly
    await engine.dispose()

    print()
    print("=" * 72)
    print("rebuild_db complete.")
    print()
    print("Next steps:")
    print("  1. Trigger Meta pipeline:      POST /api/pipelines/meta_ads/run")
    print("     with date_from=2024-01-01&date_to=<today>")
    print("  2. Trigger Google Ads:         POST /api/pipelines/google_ads/run")
    print("  3. Trigger GA4:                POST /api/pipelines/google_analytics/run")
    print("  4. Trigger Google Sheets:      POST /api/pipelines/google_sheets/run")
    print("  5. Trigger HubSpot:            POST /api/pipelines/hubspot/run")
    print("  6. Trigger WooCommerce:        POST /api/pipelines/woocommerce/run")
    print()
    print("Or wait for the scheduler (runs all pipelines every 4 hours).")
    print("=" * 72)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes-i-know-this-drops-everything",
        action="store_true",
        help="Skip the interactive REBUILD prompt. Use in CI/scripted contexts only.",
    )
    args = parser.parse_args()
    asyncio.run(rebuild_db(skip_prompt=args.yes_i_know_this_drops_everything))


if __name__ == "__main__":
    main()
