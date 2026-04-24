"""
smoke_kpis.py — guardrail against "fix-and-break" regressions.

Runs direct DB queries that mirror what the dashboard endpoints compute,
for the live current date range, and fails loudly if any main KPI that
SHOULD be non-zero comes back as 0. Designed to be run locally before a
push or as a CI pre-deploy check.

Checks (for the default window = last 90 days):
    1. CP Store Revenue       — Shopify orders (ShopifyOrder.total)
    2. Sani-Tred Retail Rev   — WooCommerce orders (WCOrder.total)
    3. I-BOS Contractor Rev   — GoogleSheetMetric qb_revenue::%
    4. Meta Ad Spend          — AdMetric (meta, all brands)
    5. Google Ad Spend        — AdMetric (google, all brands)
    6. GA4 Web Visits         — WebAnalytic.total_users sum
    7. HubSpot Deals Won      — HubSpotDeal where stage LIKE 'closed%won%'

Non-zero expectations are lowered to "either >= threshold OR skipped
with reason". For example, if the Shopify pipeline hasn't run in this
env we don't fail — we report "skipped, no ShopifyOrder rows exist".

Usage
    python -m backend.scripts.smoke_kpis
    python -m backend.scripts.smoke_kpis --days 30
    python -m backend.scripts.smoke_kpis --strict   # exit 1 on any fail

Requires
    DATABASE_URL in environment. Safe to run read-only against prod.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable, Optional

# Make "app" importable when run via `python backend/scripts/smoke_kpis.py`
# (the same convention validate_meta.py uses).
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))


@dataclass
class CheckResult:
    name: str
    value: float
    threshold: float
    passed: bool
    reason: str = ""


async def run_checks(days: int, strict: bool) -> list[CheckResult]:
    from sqlalchemy import and_, func, select
    from app.core.database import async_session_maker
    from app.models.metrics import (
        MetaAdMetric, GoogleAdMetric, GA4Metric, HubSpotDeal,
        ShopifyOrder, WCOrder, GoogleSheetMetric,
    )

    end = date.today()
    start = end - timedelta(days=days)

    results: list[CheckResult] = []

    def _add(name: str, value: float, threshold: float, reason: str = "") -> None:
        # Classification:
        #   skipped:X   → pass-through (no data to check)
        #   error:Y     → FAIL (broken query / missing table)
        #   otherwise   → pass iff value meets threshold
        if reason.startswith("skipped"):
            passed = True
        elif reason.startswith("error"):
            passed = False
        else:
            passed = value >= threshold
        results.append(CheckResult(name=name, value=value, threshold=threshold, passed=passed, reason=reason))

    # Each check opens its own session so one UndefinedTable / schema
    # error doesn't poison the transaction and cascade false passes into
    # every subsequent check.

    # 1. CP Store Revenue
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(ShopifyOrder.total), 0))
                .where(and_(ShopifyOrder.date_created >= start, ShopifyOrder.date_created <= end))
            )
            row_count_q = await db.execute(select(func.count(ShopifyOrder.id)))
            total_rows = int(row_count_q.scalar() or 0)
            value = float(q.scalar() or 0)
        if total_rows == 0:
            _add("CP Store Revenue (Shopify)", 0, 0, "skipped: no ShopifyOrder rows exist in this env")
        else:
            _add("CP Store Revenue (Shopify)", value, 0.01)
    except Exception as exc:
        _add("CP Store Revenue (Shopify)", 0, 0, f"error: {exc}")

    # 2. Sani-Tred Retail Revenue
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(WCOrder.total), 0))
                .where(and_(WCOrder.date_created >= start, WCOrder.date_created <= end, WCOrder.division == "sanitred"))
            )
            row_count_q = await db.execute(select(func.count(WCOrder.id)))
            total_rows = int(row_count_q.scalar() or 0)
            value = float(q.scalar() or 0)
        if total_rows == 0:
            _add("Sani-Tred Retail Revenue (WooCommerce)", 0, 0, "skipped: no WCOrder rows exist in this env")
        else:
            _add("Sani-Tred Retail Revenue (WooCommerce)", value, 0.01)
    except Exception as exc:
        _add("Sani-Tred Retail Revenue (WooCommerce)", 0, 0, f"error: {exc}")

    # 3. I-BOS Contractor Revenue (qb_revenue:: sheet)
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(GoogleSheetMetric.metric_value), 0))
                .where(and_(
                    GoogleSheetMetric.sheet_name.like("qb_revenue::%"),
                    GoogleSheetMetric.date >= start,
                    GoogleSheetMetric.date <= end,
                ))
            )
            value = float(q.scalar() or 0)
        _add("I-BOS Contractor Revenue (QB sheet)", value, 0.01)
    except Exception as exc:
        _add("I-BOS Contractor Revenue (QB sheet)", 0, 0, f"error: {exc}")

    # 4. Meta Ad Spend
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(MetaAdMetric.spend), 0))
                .where(and_(MetaAdMetric.date >= start, MetaAdMetric.date <= end))
            )
            value = float(q.scalar() or 0)
        _add("Meta Ad Spend", value, 0.01)
    except Exception as exc:
        _add("Meta Ad Spend", 0, 0, f"error: {exc}")

    # 5. Google Ad Spend
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(GoogleAdMetric.spend), 0))
                .where(and_(GoogleAdMetric.date >= start, GoogleAdMetric.date <= end))
            )
            value = float(q.scalar() or 0)
        _add("Google Ad Spend", value, 0.01)
    except Exception as exc:
        _add("Google Ad Spend", 0, 0, f"error: {exc}")

    # 6. GA4 Web Visits (total_users is the canonical "web visitors" metric)
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.coalesce(func.sum(GA4Metric.total_users), 0))
                .where(and_(GA4Metric.date >= start, GA4Metric.date <= end))
            )
            value = float(q.scalar() or 0)
        _add("GA4 Web Users", value, 1)
    except Exception as exc:
        _add("GA4 Web Users", 0, 0, f"error: {exc}")

    # 7. HubSpot Deals Won (HubSpotDeal.stage, not deal_stage)
    try:
        async with async_session_maker() as db:
            q = await db.execute(
                select(func.count(HubSpotDeal.id))
                .where(HubSpotDeal.stage.ilike("%closed%won%"))
            )
            value = float(q.scalar() or 0)
        _add("HubSpot Closed-Won Deals (lifetime)", value, 1)
    except Exception as exc:
        _add("HubSpot Closed-Won Deals (lifetime)", 0, 0, f"error: {exc}")

    return results


def print_report(results: list[CheckResult], days: int) -> int:
    print(f"\n─── I-Dash KPI Smoke Test · last {days} days ───")
    failed: list[CheckResult] = []
    for r in results:
        if r.reason.startswith("skipped"):
            mark = "○"
            tone = "skip"
        elif r.passed:
            mark = "✓"
            tone = "ok"
        else:
            mark = "✗"
            tone = "FAIL"
            failed.append(r)

        val_str = f"{r.value:,.2f}" if r.value else "0"
        extra = f"  ({r.reason})" if r.reason else ""
        print(f"  {mark} [{tone:>4}] {r.name:<42} {val_str}{extra}")

    print()
    if failed:
        print(f"✗ {len(failed)} check(s) failed — DO NOT DEPLOY:")
        for r in failed:
            print(f"    • {r.name} returned {r.value} (threshold {r.threshold})")
        return 1
    print("✓ All KPI checks passed or skipped cleanly. Safe to deploy.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=90, help="Look-back window in days (default 90)")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on any failure (for CI)")
    args = parser.parse_args()

    results = asyncio.run(run_checks(args.days, args.strict))
    code = print_report(results, args.days)
    if args.strict:
        sys.exit(code)


if __name__ == "__main__":
    main()
