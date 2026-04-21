"""
validate_meta.py — prove the dashboard matches Meta Ads Manager.

Runs two queries for the same (account_id, date_from, date_to):

    1. Direct Meta Graph API call at level=account. This is the exact
       source of truth that Meta Ads Manager's "Accounts Center" view
       renders in the UI.

    2. Our Postgres — sum spend/impressions/clicks from meta_ad_metrics
       restricted by account + date, plus period-unique reach lookup
       from meta_period_reach when the range matches a preset.

Then it prints a side-by-side comparison. Spend, impressions, clicks
must match to the penny. Reach matches when the date range is one of
the pre-computed presets (this_month / last_month / last_7 / last_30
/ ytd today); otherwise reach is labeled APPROX.

It also runs a division-leak audit: counts of meta_ad_metrics rows
stamped with each division, plus a proof query that every "cp"-tagged
row has account_id = act_144305066 and every "ibos"-tagged row does
not.

Usage
    python -m backend.scripts.validate_meta \\
        --account-id act_1621412735957179 \\
        --date-from 2026-03-01 --date-to 2026-03-31

Requires
    DATABASE_URL + META_ACCESS_TOKEN in environment.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import date, datetime, timedelta
from typing import Optional

# Make `app.*` imports resolve when run as `python -m backend.scripts.validate_meta`
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(THIS_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("validate_meta")

CP_TRAINING_META_ID = "act_144305066"
HIDDEN_STATUSES = {"ARCHIVED", "DELETED"}


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _pct(a: float, b: float) -> str:
    if b == 0:
        return "n/a"
    return f"{(a - b) / b * 100:+.2f}%"


def _delta(a: float, b: float) -> str:
    return f"{a - b:+.2f}"


# ───────────────────────── Meta direct (source of truth) ─────────────────────


def _meta_totals_sync(
    account_id: str,
    date_from: date,
    date_to: date,
) -> dict:
    """Blocking Meta API call. Returns full-account totals matching Meta UI's
    default "All ads" view (archived/deleted campaigns filtered out)."""
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.exceptions import FacebookRequestError

    token = os.environ.get("META_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("META_ACCESS_TOKEN not set in environment")
    FacebookAdsApi.init(access_token=token)

    acct_id_api = account_id if account_id.startswith("act_") else f"act_{account_id}"
    ad_account = AdAccount(acct_id_api)

    # Visible campaign whitelist (matches Meta Ads Manager default filter).
    visible_ids: list[str] = []
    hidden_ids: list[str] = []
    try:
        campaigns = ad_account.get_campaigns(
            fields=["id", "name", "effective_status"],
            params={"limit": 500},
        )
        for c in campaigns:
            cid = c.get("id")
            st = c.get("effective_status") or ""
            if not cid:
                continue
            if st in HIDDEN_STATUSES:
                hidden_ids.append(str(cid))
            else:
                visible_ids.append(str(cid))
    except FacebookRequestError as e:
        raise RuntimeError(f"get_campaigns failed: {e.api_error_code()}: {e.api_error_message()}")

    params: dict = {
        "time_range": {"since": date_from.isoformat(), "until": date_to.isoformat()},
        "level": "account",
        "limit": 1,
    }
    if visible_ids:
        params["filtering"] = [{
            "field": "campaign.id",
            "operator": "IN",
            "value": visible_ids,
        }]

    totals = {"spend": 0.0, "impressions": 0, "clicks": 0, "reach": 0}
    try:
        rows = ad_account.get_insights(
            fields=["spend", "impressions", "clicks", "reach"],
            params=params,
        )
        for row in rows:
            totals["spend"] = float(row.get("spend", 0) or 0)
            totals["impressions"] = int(row.get("impressions", 0) or 0)
            totals["clicks"] = int(row.get("clicks", 0) or 0)
            totals["reach"] = int(row.get("reach", 0) or 0)
            break
    except FacebookRequestError as e:
        raise RuntimeError(f"get_insights failed: {e.api_error_code()}: {e.api_error_message()}")

    return {
        "totals": totals,
        "visible_campaign_ids": visible_ids,
        "hidden_campaign_ids": hidden_ids,
    }


# ───────────────────────── DB side ───────────────────────────────────────────


async def _db_totals(account_id: str, date_from: date, date_to: date) -> dict:
    from sqlalchemy import and_, func, select  # noqa: PLC0415
    from app.core.database import async_session_maker  # noqa: PLC0415
    from app.models.metrics import MetaAdMetric, MetaPeriodReach  # noqa: PLC0415

    async with async_session_maker() as session:
        q = await session.execute(
            select(
                func.sum(MetaAdMetric.spend).label("spend"),
                func.sum(MetaAdMetric.impressions).label("impressions"),
                func.sum(MetaAdMetric.clicks).label("clicks"),
                func.count(MetaAdMetric.id).label("row_count"),
                func.min(MetaAdMetric.fetched_at).label("earliest_fetched"),
                func.max(MetaAdMetric.fetched_at).label("latest_fetched"),
            ).where(and_(
                MetaAdMetric.account_id == account_id,
                MetaAdMetric.date >= date_from,
                MetaAdMetric.date <= date_to,
            ))
        )
        row = q.first()

        # Period reach — only populated for preset windows.
        preset = _match_preset(date_from, date_to)
        pr_reach: Optional[int] = None
        pr_fetched_at = None
        if preset:
            pr_q = await session.execute(
                select(MetaPeriodReach.reach, MetaPeriodReach.fetched_at).where(and_(
                    MetaPeriodReach.account_id == account_id,
                    MetaPeriodReach.preset_key == preset,
                ))
            )
            pr_row = pr_q.first()
            if pr_row:
                pr_reach = int(pr_row.reach or 0)
                pr_fetched_at = pr_row.fetched_at

    return {
        "spend": float(row.spend or 0) if row else 0.0,
        "impressions": int(row.impressions or 0) if row else 0,
        "clicks": int(row.clicks or 0) if row else 0,
        "row_count": int(row.row_count or 0) if row else 0,
        "earliest_fetched": row.earliest_fetched.isoformat() if row and row.earliest_fetched else None,
        "latest_fetched": row.latest_fetched.isoformat() if row and row.latest_fetched else None,
        "preset_match": preset,
        "period_reach": pr_reach,
        "period_reach_fetched_at": pr_fetched_at.isoformat() if pr_fetched_at else None,
    }


def _match_preset(date_from: date, date_to: date) -> Optional[str]:
    today = date.today()
    if date_from == date(today.year, 1, 1) and date_to == today:
        return "ytd"
    if date_from == date(today.year, today.month, 1) and date_to == today:
        return "this_month"
    first_this = date(today.year, today.month, 1)
    last_month_end = first_this - timedelta(days=1)
    last_month_start = date(last_month_end.year, last_month_end.month, 1)
    if date_from == last_month_start and date_to == last_month_end:
        return "last_month"
    if date_from == today - timedelta(days=6) and date_to == today:
        return "last_7"
    if date_from == today - timedelta(days=29) and date_to == today:
        return "last_30"
    return None


# ───────────────────────── Division-leak audit ───────────────────────────────


async def _division_audit() -> dict:
    from sqlalchemy import func, select, and_, or_  # noqa: PLC0415
    from app.core.database import async_session_maker  # noqa: PLC0415
    from app.models.metrics import MetaAdMetric  # noqa: PLC0415

    async with async_session_maker() as session:
        # Total rows per division
        q = await session.execute(
            select(
                MetaAdMetric.division,
                func.count(MetaAdMetric.id).label("n"),
                func.sum(MetaAdMetric.spend).label("spend"),
            ).group_by(MetaAdMetric.division)
        )
        by_division = [
            {"division": r.division, "row_count": int(r.n or 0), "total_spend": float(r.spend or 0)}
            for r in q.all()
        ]

        # Leakage probes:
        leak_cp_not_training = await session.execute(
            select(func.count(MetaAdMetric.id)).where(and_(
                MetaAdMetric.division == "cp",
                MetaAdMetric.account_id != CP_TRAINING_META_ID,
            ))
        )
        leak_ibos_is_training = await session.execute(
            select(func.count(MetaAdMetric.id)).where(and_(
                MetaAdMetric.division == "ibos",
                MetaAdMetric.account_id == CP_TRAINING_META_ID,
            ))
        )

    return {
        "by_division": by_division,
        "rows_tagged_cp_but_not_training_account": int(leak_cp_not_training.scalar() or 0),
        "rows_tagged_ibos_but_on_training_account": int(leak_ibos_is_training.scalar() or 0),
    }


# ───────────────────────── Main ──────────────────────────────────────────────


async def run(account_id: str, date_from: date, date_to: date) -> None:
    print("=" * 80)
    print(f"Meta validation — {account_id} | {date_from} → {date_to}")
    print("=" * 80)

    # Run Meta + DB concurrently (Meta is blocking in a worker thread).
    meta_task = asyncio.to_thread(_meta_totals_sync, account_id, date_from, date_to)
    db_task = _db_totals(account_id, date_from, date_to)
    audit_task = _division_audit()

    meta_res, db_res, audit_res = await asyncio.gather(
        meta_task, db_task, audit_task, return_exceptions=True
    )

    if isinstance(meta_res, Exception):
        print(f"❌ Meta direct call failed: {meta_res}")
        return
    if isinstance(db_res, Exception):
        print(f"❌ DB query failed: {db_res}")
        return
    if isinstance(audit_res, Exception):
        print(f"⚠️  Division audit failed (non-fatal): {audit_res}")
        audit_res = None

    meta_t = meta_res["totals"]

    print()
    print("Campaigns in account:")
    print(f"  visible (not archived/deleted): {len(meta_res['visible_campaign_ids'])}")
    print(f"  hidden (archived/deleted):      {len(meta_res['hidden_campaign_ids'])}")

    print()
    print(f"{'Metric':<14} {'Meta (truth)':>16} {'I-Dash DB':>16} {'Δ':>10} {'Δ %':>8}")
    print("-" * 70)
    for field in ("spend", "impressions", "clicks"):
        m = float(meta_t.get(field, 0))
        d = float(db_res.get(field, 0))
        match = "✅" if abs(m - d) < 0.01 else "❌"
        print(f"{field:<14} {m:>16,.2f} {d:>16,.2f} {_delta(d, m):>10} {_pct(d, m):>8}   {match}")

    # Reach
    pr = db_res.get("period_reach")
    m_reach = meta_t.get("reach", 0)
    if pr is not None:
        match = "✅" if abs(pr - m_reach) < 1 else "❌"
        print(f"{'reach':<14} {m_reach:>16,} {pr:>16,} {_delta(pr, m_reach):>10} {_pct(pr, m_reach):>8}   {match}")
        print(f"   (source: meta_period_reach preset={db_res['preset_match']}, "
              f"fetched {db_res['period_reach_fetched_at']})")
    else:
        print(f"{'reach':<14} {m_reach:>16,} {'APPROX':>16} {'-':>10} {'-':>8}")
        print(f"   (no preset match for this window — reach not pre-computed)")

    print()
    print("DB meta:")
    print(f"  row_count:        {db_res['row_count']}")
    print(f"  earliest_fetched: {db_res['earliest_fetched']}")
    print(f"  latest_fetched:   {db_res['latest_fetched']}")

    if audit_res:
        print()
        print("Division audit (all meta_ad_metrics rows, not just this account):")
        for r in audit_res["by_division"]:
            print(f"  division={r['division']!s:<8}  rows={r['row_count']:>8}  spend=${r['total_spend']:>12,.2f}")
        print(f"  rows tagged cp  but not on training account: {audit_res['rows_tagged_cp_but_not_training_account']}")
        print(f"  rows tagged ibos but on training account:    {audit_res['rows_tagged_ibos_but_on_training_account']}")
        if audit_res['rows_tagged_cp_but_not_training_account'] == 0 \
                and audit_res['rows_tagged_ibos_but_on_training_account'] == 0:
            print("  ✅ Zero leakage between CP and I-BOS.")
        else:
            print("  ❌ LEAKAGE DETECTED — investigate above counts.")

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--account-id",
        required=True,
        help="Meta ad account id, with or without the act_ prefix.",
    )
    parser.add_argument("--date-from", required=True, help="YYYY-MM-DD")
    parser.add_argument("--date-to", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()

    asyncio.run(run(args.account_id, _parse_date(args.date_from), _parse_date(args.date_to)))


if __name__ == "__main__":
    main()
