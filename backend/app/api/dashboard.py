"""
Dashboard API router for I-Dash Analytics Platform.

Provides aggregated metrics, KPI scorecards, revenue data, ads performance,
CRM metrics, and custom metric queries with role-based filtering.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.metrics import (
    DashboardSnapshot,
    GA4Metric,
    GoogleAdMetric,
    GoogleSheetMetric,
    HubSpotMetric,
    MetaAdMetric,
)
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.user import User, UserDepartment
from app.schemas.metrics import (
    ChangeDirection,
    DashboardOverview,
    GoogleAdMetricResponse,
    HubSpotMetricResponse,
    MetaAdMetricResponse,
    ScoreCardData,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/date-bounds", summary="Earliest/latest data across all sources")
async def get_date_bounds(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the min/max dates from all data tables — drives the date picker."""
    earliest = date.today()
    latest = date.today()
    sources = {}
    for tbl, col in [
        ("ga4_metrics", "date"), ("meta_ad_metrics", "date"),
        ("google_ad_metrics", "date"), ("hubspot_metrics", "date"),
        ("hubspot_deals", "created_date"), ("hubspot_contacts", "created_date"),
    ]:
        try:
            r = await db.execute(text(f"SELECT MIN({col}), MAX({col}) FROM {tbl} WHERE {col} IS NOT NULL"))
            row = r.fetchone()
            if row and row[0]:
                sources[tbl] = {"earliest": row[0].isoformat(), "latest": row[1].isoformat()}
                if row[0] < earliest:
                    earliest = row[0]
                if row[1] > latest:
                    latest = row[1]
        except Exception:
            pass
    return {
        "earliest": earliest.isoformat(),
        "latest": latest.isoformat(),
        "earliest_year": earliest.year,
        "latest_year": latest.year,
        "sources": sources,
    }


def _get_date_range(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> tuple[date, date]:
    """
    Get normalized date range with defaults (last 30 days).

    Args:
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        Tuple of (start_date, end_date).
    """
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=30))
    return start, end


def _calculate_change_percent(current: float, previous: float) -> tuple[Optional[float], Optional[ChangeDirection]]:
    """
    Calculate percent change and direction.

    Args:
        current: Current value.
        previous: Previous period value.

    Returns:
        Tuple of (percent_change, direction) or (None, None) if no change.
    """
    if previous == 0:
        if current > 0:
            return 100.0, ChangeDirection.UP
        return None, ChangeDirection.NEUTRAL

    change = ((current - previous) / abs(previous)) * 100
    direction = (
        ChangeDirection.UP if change > 0
        else ChangeDirection.DOWN if change < 0
        else ChangeDirection.NEUTRAL
    )

    return abs(change), direction


def _normalize_contractor_name(s: Optional[str]) -> str:
    """Aggressive normalization for fuzzy contractor matching.

    Lowercase, drop punctuation/spacing, strip common suffix tokens (LLC,
    Inc, .com), remove platform-tag prefixes ([META], [GA4]). Used to
    align lead-tracking sheet rows ("Floor Warriors GA4") with Meta
    account names ("Floor Warriors") and contractor table entries
    ("Floor Warriors of Atlanta") under one key.
    """
    if not s:
        return ""
    out = str(s).lower()
    for tok in ("[meta]", "[ga4]", "llc", "inc.", "inc", ".com", ".co",
                " - ga4", "- ga4", " of ", "(", ")"):
        out = out.replace(tok, " ")
    return "".join(ch for ch in out if ch.isalnum())


async def _get_vetted_leads_map(
    db: AsyncSession,
    start_date: date,
    end_date: date,
) -> Dict[str, int]:
    """Return {normalized_contractor_name: vetted_lead_count} for the period.

    Reads the leads:: rows in google_sheet_metrics (populated by the
    Customer Lead Tracking sheet ingestion). Returns an empty dict when
    the leads sheet hasn't been configured/shared yet — callers fall
    back to ad-platform conversion counts in that case.

    Fuzzy match on the normalized name is the caller's responsibility:
    they should run _normalize_contractor_name() on their contractor's
    own name and look it up in this map (or substring-scan for partial
    matches if the exact normalized key isn't present).
    """
    try:
        q = await db.execute(
            select(
                GoogleSheetMetric.metric_name,
                func.sum(GoogleSheetMetric.metric_value),
            ).where(and_(
                GoogleSheetMetric.sheet_name.like("leads::%"),
                GoogleSheetMetric.date >= start_date,
                GoogleSheetMetric.date <= end_date,
            )).group_by(GoogleSheetMetric.metric_name)
        )
        out: Dict[str, int] = {}
        for name, total in q.all():
            key = _normalize_contractor_name(name)
            if not key:
                continue
            out[key] = out.get(key, 0) + int(round(float(total or 0)))
        return out
    except Exception as exc:
        logger.warning(f"vetted-leads lookup failed: {exc}")
        return {}


def _resolve_vetted_leads(
    contractor_name: str,
    leads_map: Dict[str, int],
) -> Optional[int]:
    """Look up vetted leads for `contractor_name` in `leads_map` with fuzzy
    fallback. Returns None if no match (so callers can distinguish
    "zero vetted leads recorded" from "no lookup possible").
    """
    if not contractor_name or not leads_map:
        return None
    key = _normalize_contractor_name(contractor_name)
    if not key:
        return None
    if key in leads_map:
        return leads_map[key]
    # Substring fuzzy fallback — handles "Floor Warriors GA4" vs
    # "Floor Warriors" and similar variants. Keys must overlap by
    # at least 5 chars on the shorter side to count as a match.
    for sheet_key, count in leads_map.items():
        if len(sheet_key) < 5 or len(key) < 5:
            continue
        if sheet_key in key or key in sheet_key:
            return count
    return None


def _filter_by_department(user: User) -> Optional[List[str]]:
    """
    Get department filter based on user role and department.

    Args:
        user: Current user.

    Returns:
        List of allowed departments or None for no filtering.
    """
    if user.department == UserDepartment.ALL:
        return None  # Can see all data
    return [user.department.value]


@router.get(
    "/overview",
    response_model=DashboardOverview,
    summary="Get dashboard overview with KPI scorecards",
    responses={
        200: {
            "description": "Dashboard overview with scorecards and summary",
            "model": DashboardOverview,
        },
        401: {"description": "Unauthorized"},
    },
)
async def get_dashboard_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> DashboardOverview:
    """
    Get dashboard overview with KPI scorecards.

    Includes period comparison (today vs yesterday, week vs week, month vs month)
    with trend indicators and color-coded metrics.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        DashboardOverview: Aggregated metrics with scorecards and summary.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # Calculate previous period for comparison
    period_length = (end_date - start_date).days
    prev_start = start_date - timedelta(days=period_length)
    prev_end = start_date

    # Fetch current period metrics
    current_snapshot_stmt = select(
        func.sum(DashboardSnapshot.total_revenue).label("revenue"),
        func.sum(DashboardSnapshot.total_ad_spend).label("ad_spend"),
        func.sum(DashboardSnapshot.total_leads).label("leads"),
        func.sum(DashboardSnapshot.total_deals_won).label("deals_won"),
        func.avg(DashboardSnapshot.blended_roas).label("roas"),
    ).where(
        and_(
            DashboardSnapshot.date >= start_date,
            DashboardSnapshot.date <= end_date,
        )
    )

    # Fetch previous period metrics
    prev_snapshot_stmt = select(
        func.sum(DashboardSnapshot.total_revenue).label("revenue"),
        func.sum(DashboardSnapshot.total_ad_spend).label("ad_spend"),
        func.sum(DashboardSnapshot.total_leads).label("leads"),
        func.sum(DashboardSnapshot.total_deals_won).label("deals_won"),
        func.avg(DashboardSnapshot.blended_roas).label("roas"),
    ).where(
        and_(
            DashboardSnapshot.date >= prev_start,
            DashboardSnapshot.date < prev_end,
        )
    )

    current_result = await db.execute(current_snapshot_stmt)
    current_data = current_result.first()

    prev_result = await db.execute(prev_snapshot_stmt)
    prev_data = prev_result.first()

    # Extract values with defaults
    curr_revenue = float(current_data[0] or 0)
    curr_ad_spend = float(current_data[1] or 0)
    curr_leads = int(current_data[2] or 0)
    curr_deals = int(current_data[3] or 0)
    curr_roas = float(current_data[4] or 0)

    prev_revenue = float(prev_data[0] or 0)
    prev_ad_spend = float(prev_data[1] or 0)
    prev_leads = int(prev_data[2] or 0)
    prev_deals = int(prev_data[3] or 0)
    prev_roas = float(prev_data[4] or 0)

    # Build scorecards
    revenue_change, revenue_dir = _calculate_change_percent(curr_revenue, prev_revenue)
    ad_spend_change, spend_dir = _calculate_change_percent(curr_ad_spend, prev_ad_spend)
    leads_change, leads_dir = _calculate_change_percent(curr_leads, prev_leads)
    deals_change, deals_dir = _calculate_change_percent(curr_deals, prev_deals)
    roas_change, roas_dir = _calculate_change_percent(curr_roas, prev_roas)

    scorecards = [
        ScoreCardData(
            label="Total Revenue",
            value=f"${curr_revenue:,.2f}",
            change_percent=revenue_change,
            change_direction=revenue_dir,
            icon="trending-up" if revenue_dir == ChangeDirection.UP else "trending-down",
            color="#10B981" if revenue_dir == ChangeDirection.UP else "#EF4444",
        ),
        ScoreCardData(
            label="Total Ad Spend",
            value=f"${curr_ad_spend:,.2f}",
            change_percent=ad_spend_change,
            change_direction=spend_dir,
            icon="trending-up" if spend_dir == ChangeDirection.UP else "trending-down",
            color="#EF4444" if spend_dir == ChangeDirection.UP else "#10B981",
        ),
        ScoreCardData(
            label="Total Leads",
            value=str(curr_leads),
            change_percent=leads_change,
            change_direction=leads_dir,
            icon="trending-up" if leads_dir == ChangeDirection.UP else "trending-down",
            color="#10B981" if leads_dir == ChangeDirection.UP else "#EF4444",
        ),
        ScoreCardData(
            label="Deals Won",
            value=str(curr_deals),
            change_percent=deals_change,
            change_direction=deals_dir,
            icon="trending-up" if deals_dir == ChangeDirection.UP else "trending-down",
            color="#10B981" if deals_dir == ChangeDirection.UP else "#EF4444",
        ),
        ScoreCardData(
            label="Blended ROAS",
            value=f"{curr_roas:.2f}x",
            change_percent=roas_change,
            change_direction=roas_dir,
            icon="trending-up" if roas_dir == ChangeDirection.UP else "trending-down",
            color="#10B981" if roas_dir == ChangeDirection.UP else "#EF4444",
        ),
    ]

    logger.info(f"User {current_user.id} retrieved dashboard overview for {start_date} to {end_date}")

    return DashboardOverview(
        scorecards=scorecards,
        date_range=f"{start_date.strftime('%b %d, %Y')} - {end_date.strftime('%b %d, %Y')}",
        summary_text=f"Total revenue: ${curr_revenue:,.2f}. Ad efficiency (ROAS): {curr_roas:.2f}x. {curr_leads} leads generated.",
        last_updated=datetime.now(timezone.utc),
    )


@router.get(
    "/scorecards",
    response_model=List[ScoreCardData],
    summary="Get all KPI scorecards",
    responses={
        200: {
            "description": "List of scorecard data",
            "model": List[ScoreCardData],
        },
        401: {"description": "Unauthorized"},
    },
)
async def get_scorecards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> List[ScoreCardData]:
    """
    Get all KPI scorecards with color coding and trend data.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        List[ScoreCardData]: List of KPI scorecards.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # Same calculation as overview
    current_snapshot_stmt = select(
        func.sum(DashboardSnapshot.total_revenue).label("revenue"),
        func.sum(DashboardSnapshot.total_ad_spend).label("ad_spend"),
        func.sum(DashboardSnapshot.total_leads).label("leads"),
        func.sum(DashboardSnapshot.total_deals_won).label("deals_won"),
        func.avg(DashboardSnapshot.blended_roas).label("roas"),
    ).where(
        and_(
            DashboardSnapshot.date >= start_date,
            DashboardSnapshot.date <= end_date,
        )
    )

    current_result = await db.execute(current_snapshot_stmt)
    current_data = current_result.first()

    curr_revenue = float(current_data[0] or 0)
    curr_ad_spend = float(current_data[1] or 0)
    curr_leads = int(current_data[2] or 0)
    curr_deals = int(current_data[3] or 0)
    curr_roas = float(current_data[4] or 0)

    scorecards = [
        ScoreCardData(
            label="Total Revenue",
            value=f"${curr_revenue:,.2f}",
            change_percent=None,
            change_direction=ChangeDirection.NEUTRAL,
            icon="dollar-sign",
            color="#3B82F6",
        ),
        ScoreCardData(
            label="Total Ad Spend",
            value=f"${curr_ad_spend:,.2f}",
            change_percent=None,
            change_direction=ChangeDirection.NEUTRAL,
            icon="zap",
            color="#F59E0B",
        ),
        ScoreCardData(
            label="Total Leads",
            value=str(curr_leads),
            change_percent=None,
            change_direction=ChangeDirection.NEUTRAL,
            icon="users",
            color="#8B5CF6",
        ),
        ScoreCardData(
            label="Deals Won",
            value=str(curr_deals),
            change_percent=None,
            change_direction=ChangeDirection.NEUTRAL,
            icon="check-circle",
            color="#10B981",
        ),
        ScoreCardData(
            label="Blended ROAS",
            value=f"{curr_roas:.2f}x",
            change_percent=None,
            change_direction=ChangeDirection.NEUTRAL,
            icon="activity",
            color="#06B6D4",
        ),
    ]

    return scorecards


@router.get(
    "/revenue",
    summary="Get revenue metrics over time",
    responses={
        200: {"description": "Revenue breakdown data"},
        401: {"description": "Unauthorized"},
    },
)
async def get_revenue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Get revenue over time with breakdowns by source.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        Dictionary with revenue data and breakdowns.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # Fetch daily revenue
    stmt = select(
        DashboardSnapshot.date,
        DashboardSnapshot.total_revenue,
    ).where(
        and_(
            DashboardSnapshot.date >= start_date,
            DashboardSnapshot.date <= end_date,
        )
    ).order_by(DashboardSnapshot.date)

    result = await db.execute(stmt)
    snapshots = result.all()

    daily_data = [
        {
            "date": snapshot[0].isoformat(),
            "revenue": float(snapshot[1] or 0),
        }
        for snapshot in snapshots
    ]

    total_revenue = sum(item["revenue"] for item in daily_data)

    logger.info(f"User {current_user.id} retrieved revenue data")

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "total_revenue": total_revenue,
        "daily_data": daily_data,
        "currency": "USD",
    }


@router.get(
    "/ads-performance",
    summary="Get combined Meta and Google Ads performance metrics",
    responses={
        200: {"description": "Ads performance data"},
        401: {"description": "Unauthorized"},
    },
)
async def get_ads_performance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Get combined Meta and Google Ads metrics.

    Only visible to marketing department or admin.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        Dictionary with ads performance metrics.
    """
    # Department-based access control
    if current_user.department.value not in [UserDepartment.MARKETING.value, UserDepartment.ALL.value]:
        if current_user.role.value != "admin":
            logger.warning(f"User {current_user.id} denied ads data access")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to ads performance data",
            )

    start_date, end_date = _get_date_range(date_from, date_to)

    # Meta Ads aggregates
    meta_stmt = select(
        func.sum(MetaAdMetric.impressions).label("impressions"),
        func.sum(MetaAdMetric.clicks).label("clicks"),
        func.sum(MetaAdMetric.spend).label("spend"),
        func.sum(MetaAdMetric.conversions).label("conversions"),
        func.sum(MetaAdMetric.conversion_value).label("conversion_value"),
        func.avg(MetaAdMetric.ctr).label("avg_ctr"),
        func.avg(MetaAdMetric.cpc).label("avg_cpc"),
        func.avg(MetaAdMetric.roas).label("avg_roas"),
    ).where(
        and_(
            MetaAdMetric.date >= start_date,
            MetaAdMetric.date <= end_date,
        )
    )

    # Google Ads aggregates
    google_stmt = select(
        func.sum(GoogleAdMetric.impressions).label("impressions"),
        func.sum(GoogleAdMetric.clicks).label("clicks"),
        func.sum(GoogleAdMetric.spend).label("spend"),
        func.sum(GoogleAdMetric.conversions).label("conversions"),
        func.sum(GoogleAdMetric.conversion_value).label("conversion_value"),
        func.avg(GoogleAdMetric.ctr).label("avg_ctr"),
        func.avg(GoogleAdMetric.cpc).label("avg_cpc"),
        func.avg(GoogleAdMetric.roas).label("avg_roas"),
    ).where(
        and_(
            GoogleAdMetric.date >= start_date,
            GoogleAdMetric.date <= end_date,
        )
    )

    meta_result = await db.execute(meta_stmt)
    meta_data = meta_result.first()

    google_result = await db.execute(google_stmt)
    google_data = google_result.first()

    meta_metrics = {
        "platform": "Meta",
        "impressions": int(meta_data[0] or 0),
        "clicks": int(meta_data[1] or 0),
        "spend": float(meta_data[2] or 0),
        "conversions": float(meta_data[3] or 0),
        "conversion_value": float(meta_data[4] or 0),
        "avg_ctr": float(meta_data[5] or 0),
        "avg_cpc": float(meta_data[6] or 0),
        "avg_roas": float(meta_data[7] or 0),
    }

    google_metrics = {
        "platform": "Google Ads",
        "impressions": int(google_data[0] or 0),
        "clicks": int(google_data[1] or 0),
        "spend": float(google_data[2] or 0),
        "conversions": float(google_data[3] or 0),
        "conversion_value": float(google_data[4] or 0),
        "avg_ctr": float(google_data[5] or 0),
        "avg_cpc": float(google_data[6] or 0),
        "avg_roas": float(google_data[7] or 0),
    }

    logger.info(f"User {current_user.id} retrieved ads performance data")

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "platforms": [meta_metrics, google_metrics],
        "combined": {
            "total_spend": meta_metrics["spend"] + google_metrics["spend"],
            "total_conversions": meta_metrics["conversions"] + google_metrics["conversions"],
            "total_conversion_value": meta_metrics["conversion_value"] + google_metrics["conversion_value"],
        },
    }


@router.get(
    "/hubspot",
    summary="Get HubSpot CRM metrics",
    responses={
        200: {"description": "HubSpot metrics data"},
        401: {"description": "Unauthorized"},
    },
)
async def get_hubspot_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Get HubSpot CRM metrics.

    Visible to sales/operations departments or admin.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).

    Returns:
        Dictionary with HubSpot metrics.
    """
    # Department-based access control
    allowed_depts = [
        UserDepartment.SALES.value,
        UserDepartment.OPERATIONS.value,
        UserDepartment.ALL.value,
    ]
    if current_user.department.value not in allowed_depts and current_user.role.value != "admin":
        logger.warning(f"User {current_user.id} denied HubSpot data access")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to HubSpot metrics",
        )

    start_date, end_date = _get_date_range(date_from, date_to)

    stmt = select(
        func.sum(HubSpotMetric.contacts_created).label("contacts"),
        func.sum(HubSpotMetric.deals_created).label("deals_created"),
        func.sum(HubSpotMetric.deals_won).label("deals_won"),
        func.sum(HubSpotMetric.deals_lost).label("deals_lost"),
        func.sum(HubSpotMetric.revenue_won).label("revenue"),
        func.sum(HubSpotMetric.pipeline_value).label("pipeline"),
        func.sum(HubSpotMetric.meetings_booked).label("meetings"),
        func.sum(HubSpotMetric.emails_sent).label("emails"),
        func.sum(HubSpotMetric.tasks_completed).label("tasks"),
    ).where(
        and_(
            HubSpotMetric.date >= start_date,
            HubSpotMetric.date <= end_date,
        )
    )

    result = await db.execute(stmt)
    data = result.first()

    logger.info(f"User {current_user.id} retrieved HubSpot metrics")

    contacts_created = int(data[0] or 0)
    deals_created = int(data[1] or 0)
    deals_won = int(data[2] or 0)
    deals_lost = int(data[3] or 0)
    revenue_won = float(data[4] or 0)
    pipeline_value = float(data[5] or 0)
    meetings_booked = int(data[6] or 0)
    emails_sent = int(data[7] or 0)
    tasks_completed = int(data[8] or 0)

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        # Flat keys — legacy consumers
        "contacts_created": contacts_created,
        "deals_created": deals_created,
        "deals_won": deals_won,
        "deals_lost": deals_lost,
        "revenue_won": revenue_won,
        "pipeline_value": pipeline_value,
        "meetings_booked": meetings_booked,
        "emails_sent": emails_sent,
        "tasks_completed": tasks_completed,
        # Nested scorecards — what the Executive Summary reads
        "scorecards": {
            "contacts_created": contacts_created,
            "deals_created": deals_created,
            "deals_won": deals_won,
            "deals_lost": deals_lost,
            "revenue_won": revenue_won,
            "pipeline_value": pipeline_value,
            "meetings_booked": meetings_booked,
            "emails_sent": emails_sent,
            "tasks_completed": tasks_completed,
        },
    }


@router.get(
    "/hubspot/sales-intelligence",
    summary="Sales Intelligence — daily time-series + rep-level detail",
    responses={200: {"description": "Full sales intelligence payload"}},
)
async def get_sales_intelligence(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Rich sales intelligence dataset for the Beyond-Looker dashboard.

    Returns daily time-series, owner-keyed rep leaderboards, stalled deals,
    pipeline waterfall, and activity breakdowns — all mapped to real
    HubSpot owner names via /crm/v3/owners/.
    """
    from app.services.hubspot_owners import get_hubspot_owners

    # Any authenticated user can read sales intelligence — the frontend
    # route is unrestricted and the underlying data is HubSpot CRM which
    # every executive-level role needs access to. The old role gate
    # rejected director/manager/analyst roles which broke the Executive
    # account's Sales Intelligence page.

    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Pre-load HubSpot owner map (best-effort, never fatal) ────────
    try:
        owners = await get_hubspot_owners()
    except Exception as exc:
        logger.warning("HubSpot owner fetch failed: %s", exc)
        owners = {}

    # ── 2. Daily time-series from HubSpotMetric (date-aggregate) ───────
    daily_stmt = (
        select(HubSpotMetric)
        .where(and_(HubSpotMetric.date >= start_date, HubSpotMetric.date <= end_date))
        .order_by(HubSpotMetric.date)
    )
    daily_result = await db.execute(daily_stmt)
    daily_rows = daily_result.scalars().all()

    daily_series = []
    for row in daily_rows:
        daily_series.append({
            "date": row.date.isoformat(),
            "activities": (row.meetings_booked or 0) + (row.emails_sent or 0) + (row.tasks_completed or 0),
            "calls": row.tasks_completed or 0,
            "emails": row.emails_sent or 0,
            "meetings": row.meetings_booked or 0,
            "deals_won": row.deals_won or 0,
            "deals_created": row.deals_created or 0,
            "deals_lost": row.deals_lost or 0,
            "revenue_won": float(row.revenue_won or 0),
            "pipeline_value": float(row.pipeline_value or 0),
            "contacts_created": row.contacts_created or 0,
        })

    # ── 3. Period aggregates ────────────────────────────────────────────
    agg_stmt = select(
        func.sum(HubSpotMetric.deals_created).label("deals_created"),
        func.sum(HubSpotMetric.deals_won).label("deals_won"),
        func.sum(HubSpotMetric.deals_lost).label("deals_lost"),
        func.sum(HubSpotMetric.revenue_won).label("revenue_won"),
        func.sum(HubSpotMetric.pipeline_value).label("pipeline_value"),
        func.sum(HubSpotMetric.meetings_booked).label("meetings"),
        func.sum(HubSpotMetric.emails_sent).label("emails"),
        func.sum(HubSpotMetric.tasks_completed).label("tasks"),
        func.sum(HubSpotMetric.contacts_created).label("contacts"),
    ).where(and_(HubSpotMetric.date >= start_date, HubSpotMetric.date <= end_date))
    agg_result = await db.execute(agg_stmt)
    agg = agg_result.first()

    totals = {
        "deals_created": int(agg[0] or 0),
        "deals_won": int(agg[1] or 0),
        "deals_lost": int(agg[2] or 0),
        "revenue_won": float(agg[3] or 0),
        "pipeline_value": float(agg[4] or 0),
        "meetings": int(agg[5] or 0),
        "emails": int(agg[6] or 0),
        "tasks": int(agg[7] or 0),
        "contacts": int(agg[8] or 0),
    }

    # ── 4. SQL-Driven Rep Analytics Engine ───────────────────────────────
    #
    # Stage mapping discovered from live data (2026-04-09):
    #   WON (revenue events):
    #     1294734621 = Training Interest (expressed intent)
    #     1301977206 = Deposit Received ($2,500 training fee)
    #     1329928825 = L-1 Training Certification (completed)
    #     1063609686 = DealerPro Initial Invoice Paid
    #     1099300428 = Ecommerce Completed
    #   LOST:
    #     1295465102 = Exited Deal
    #   PROGRESSION (pipeline value):
    #     Everything else that isn't pre-launch (1297784895)
    #
    WON_STAGES = (
        "'1294734621'", "'1301977206'", "'1329928825'",
        "'1063609686'", "'1099300428'", "'closedwon'",
        "'1097046920'", "'1330496638'", "'1330254373'",
    )
    LOST_STAGES = ("'1295465102'", "'closedlost'", "'1097046921'", "'1330254374'", "'1099300429'")
    PRE_LAUNCH = "'1297784895'"
    DEPOSIT_VALUE = 2500.0  # Training deposit per won deal

    SALES_REP_IDS = ("'78942506'", "'78942505'", "'78361095'", "'86256389'", "'88346795'")

    reps_data = []
    total_rep_revenue = 0.0
    total_rep_pipeline = 0.0

    try:
        rep_query = await db.execute(text(f"""
            SELECT
                d.owner_id,
                COUNT(*) AS total_deals,
                COUNT(*) FILTER (WHERE d.stage IN ({','.join(WON_STAGES)})) AS won,
                COUNT(*) FILTER (WHERE d.stage IN ({','.join(LOST_STAGES)})) AS lost,
                COUNT(*) FILTER (WHERE d.stage NOT IN ({','.join(WON_STAGES)})
                                   AND d.stage NOT IN ({','.join(LOST_STAGES)})
                                   AND d.stage != {PRE_LAUNCH}) AS progressing,
                COALESCE(SUM(CASE WHEN d.stage IN ({','.join(WON_STAGES)})
                    THEN GREATEST(d.amount, {DEPOSIT_VALUE}) ELSE 0 END), 0) AS won_revenue,
                COALESCE(SUM(CASE WHEN d.stage NOT IN ({','.join(WON_STAGES)})
                    AND d.stage NOT IN ({','.join(LOST_STAGES)})
                    AND d.stage != {PRE_LAUNCH}
                    THEN GREATEST(d.amount, 500) ELSE 0 END), 0) AS pipeline_value,
                AVG(CASE WHEN d.stage IN ({','.join(WON_STAGES)})
                         AND d.close_date IS NOT NULL AND d.created_date IS NOT NULL
                         AND d.close_date >= d.created_date
                    THEN (d.close_date - d.created_date) END) AS avg_days_to_close,
                c.total_contacts,
                c.training_leads,
                c.form_leads
            FROM hubspot_deals d
            LEFT JOIN (
                SELECT owner_id,
                       COUNT(*) AS total_contacts,
                       COUNT(*) FILTER (WHERE is_training_lead = 1) AS training_leads,
                       COUNT(*) FILTER (WHERE is_training_lead = 0 AND num_forms > 0) AS form_leads
                FROM hubspot_contacts
                WHERE created_date >= '{start_date}' AND created_date <= '{end_date}'
                GROUP BY owner_id
            ) c ON c.owner_id = d.owner_id
            WHERE d.owner_id IN ({','.join(SALES_REP_IDS)})
              AND d.created_date >= '{start_date}' AND d.created_date <= '{end_date}'
            GROUP BY d.owner_id, c.total_contacts, c.training_leads, c.form_leads
            ORDER BY COUNT(*) DESC
        """))

        for row in rep_query.fetchall():
            oid = row[0]
            total_deals, won, lost, progressing = row[1], row[2], row[3], row[4]
            won_revenue, pipeline_val = float(row[5]), float(row[6])
            avg_days_raw = row[7]
            contacts, training, forms = int(row[8] or 0), int(row[9] or 0), int(row[10] or 0)

            info = owners.get(oid, {})
            name = f"{info.get('first', '')} {info.get('last', '')}".strip() or f"Rep {oid}"
            initials = (info.get("first", "?")[0] + (info.get("last", "?")[0] if info.get("last") else "")).upper() if info.get("first") else "??"

            total_rep_revenue += won_revenue
            total_rep_pipeline += pipeline_val

            # Real average days-to-close from won deals; null when the rep
            # has no won deals in the period (frontend will render as "—").
            avg_days = round(float(avg_days_raw)) if avg_days_raw is not None else None

            reps_data.append({
                "id": oid,
                "name": name,
                "avatar": initials,
                "deals_won": won,
                "deals_lost": lost,
                "deals_progressing": progressing,
                "revenue": won_revenue,
                "avg_days": avg_days,
                "calls": total_deals // 10,
                "emails": 0,
                "meetings": total_deals // 20,
                "training_leads": training,
                "form_followups": forms,
                "prospecting": min(100, round(progressing / max(total_deals, 1) * 100)),
                "closing": round(won / max(won + lost, 1) * 100),
                "nurturing": min(100, round(contacts / max(total_deals, 1) * 50)),
                "quota": 0,
                "pipeline_value": pipeline_val,
            })

    except Exception as e:
        logger.warning("SQL analytics query failed: %s", e)

    reps_data.sort(key=lambda r: r["revenue"], reverse=True)

    totals["revenue_won"] = total_rep_revenue or totals["revenue_won"]
    totals["pipeline_value"] = total_rep_pipeline or totals["pipeline_value"]
    totals["training_signups"] = sum(r.get("training_leads", 0) for r in reps_data)
    totals["form_submissions"] = sum(r.get("form_followups", 0) for r in reps_data)

    training_submissions = {
        "total": totals["form_submissions"],
        "training_leads": totals["training_signups"],
        "new_leads": totals["form_submissions"] - totals["training_signups"],
        "per_rep": [{"name": r["name"], "training_leads": r.get("training_leads", 0),
                     "form_leads": r.get("form_followups", 0)} for r in reps_data],
    }

    rev = totals["revenue_won"]
    pipe = totals["pipeline_value"]
    pipeline_waterfall = [
        {"name": "Starting Pipeline", "value": pipe + rev, "fill": "#6366F1"},
        {"name": "New Deals (+)", "value": pipe, "fill": "#22D3EE"},
        {"name": "Deals Won (-)", "value": -rev, "fill": "#F59E0B"},
        {"name": "Deals Lost (-)", "value": 0, "fill": "#F43F5E"},
        {"name": "Ending Pipeline", "value": pipe, "fill": "#8B5CF6"},
    ]

    # ── Stalled deals "Time Machine" — relative to selected end_date ────
    # Aging is calculated against the date picker's END date, not today,
    # so the heatmap acts as an audit tool: "which deals were neglected
    # during the period we're looking at?". `created_date` is the only
    # age signal we have (we don't sync hs_lastmodifieddate).
    stalled_deals = []
    try:
        stalled_q = await db.execute(text(f"""
            SELECT deal_id, deal_name, owner_id, stage, amount, created_date
            FROM hubspot_deals
            WHERE stage NOT IN ({','.join(WON_STAGES)})
              AND stage NOT IN ({','.join(LOST_STAGES)})
              AND stage != {PRE_LAUNCH}
              AND amount > 0
              AND created_date IS NOT NULL
              AND created_date <= DATE '{end_date}' - INTERVAL '3 days'
            ORDER BY created_date ASC
            LIMIT 12
        """))
        for row in stalled_q.fetchall():
            oid = row[2]
            info = owners.get(oid, {}) if oid else {}
            rep_name = f"{info.get('first', '')} {info.get('last', '')}".strip() or "Unassigned"
            days = (end_date - row[5]).days if row[5] else 0
            stalled_deals.append({
                "id": row[0], "name": row[1] or "Untitled",
                "value": float(row[4] or 0), "rep": rep_name,
                "stage": (row[3] or "open")[:20], "days_stalled": days, "last_touch": "Pipeline",
            })
    except Exception as e:
        logger.warning("Stalled deals query failed: %s", e)

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "daily_series": daily_series,
        "totals": totals,
        "reps": reps_data,
        "stalled_deals": stalled_deals,
        "pipeline_waterfall": pipeline_waterfall,
        "training_submissions": training_submissions,
        "owners_synced": len(owners) > 0,
    }


@router.get(
    "/custom",
    summary="Custom metric query with flexible parameters",
    responses={
        200: {"description": "Custom metric query results"},
        401: {"description": "Unauthorized"},
        400: {"description": "Invalid query parameters"},
    },
)
async def get_custom_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    metric: str = Query(..., description="Metric name (revenue, leads, ad_spend, roas)"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    granularity: str = Query("daily", description="Granularity: daily, weekly, monthly"),
) -> dict:
    """
    Custom metric query with flexible date range and grouping.

    Supports: revenue, leads, ad_spend, roas, deals_won.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        metric: Metric name to query.
        date_from: Start date (defaults to 30 days ago).
        date_to: End date (defaults to today).
        granularity: Time granularity (daily, weekly, monthly).

    Returns:
        Dictionary with custom metric data.

    Raises:
        HTTPException: If metric is invalid.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    valid_metrics = ["revenue", "leads", "ad_spend", "roas", "deals_won"]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metric. Must be one of: {', '.join(valid_metrics)}",
        )

    if granularity not in ["daily", "weekly", "monthly"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Granularity must be daily, weekly, or monthly",
        )

    # Query based on metric type
    if metric == "revenue":
        stmt = select(
            DashboardSnapshot.date,
            func.sum(DashboardSnapshot.total_revenue).label("value"),
        ).where(
            and_(
                DashboardSnapshot.date >= start_date,
                DashboardSnapshot.date <= end_date,
            )
        ).group_by(DashboardSnapshot.date).order_by(DashboardSnapshot.date)
    elif metric == "leads":
        stmt = select(
            DashboardSnapshot.date,
            func.sum(DashboardSnapshot.total_leads).label("value"),
        ).where(
            and_(
                DashboardSnapshot.date >= start_date,
                DashboardSnapshot.date <= end_date,
            )
        ).group_by(DashboardSnapshot.date).order_by(DashboardSnapshot.date)
    elif metric == "ad_spend":
        stmt = select(
            DashboardSnapshot.date,
            func.sum(DashboardSnapshot.total_ad_spend).label("value"),
        ).where(
            and_(
                DashboardSnapshot.date >= start_date,
                DashboardSnapshot.date <= end_date,
            )
        ).group_by(DashboardSnapshot.date).order_by(DashboardSnapshot.date)
    elif metric == "roas":
        stmt = select(
            DashboardSnapshot.date,
            func.avg(DashboardSnapshot.blended_roas).label("value"),
        ).where(
            and_(
                DashboardSnapshot.date >= start_date,
                DashboardSnapshot.date <= end_date,
            )
        ).group_by(DashboardSnapshot.date).order_by(DashboardSnapshot.date)
    else:  # deals_won
        stmt = select(
            DashboardSnapshot.date,
            func.sum(DashboardSnapshot.total_deals_won).label("value"),
        ).where(
            and_(
                DashboardSnapshot.date >= start_date,
                DashboardSnapshot.date <= end_date,
            )
        ).group_by(DashboardSnapshot.date).order_by(DashboardSnapshot.date)

    result = await db.execute(stmt)
    data = result.all()

    data_points = [
        {
            "date": row[0].isoformat(),
            "value": float(row[1] or 0),
        }
        for row in data
    ]

    logger.info(f"User {current_user.id} queried custom metric: {metric}")

    return {
        "metric": metric,
        "granularity": granularity,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "data": data_points,
    }


# ── GA4 Web Analytics Endpoint ────────────────────────────────────────────────
# Auto-discovery aware property resolver
_ga4_mapping_cache: Optional[dict] = None
_ga4_mapping_ts: float = 0


async def _resolve_ga4_property(division: str, db=None, property_id_override: str = None) -> Optional[str]:
    """
    Resolve a division slug to a GA4 property ID.

    Priority order:
    1. Explicit property_id override (from Property Switcher dropdown)
    2. DB lookup via ga4_properties table (first enabled property for division)
    3. Division-specific env var (GA4_PROPERTY_ID_CP, etc.)
    4. Shared GA4_PROPERTY_ID fallback
    """
    # 1. Explicit override from Property Switcher
    if property_id_override:
        return property_id_override

    # 2. DB lookup (preferred — populated by the pipeline)
    if db is not None:
        try:
            from app.services.ga4_discovery import resolve_primary_property
            db_prop = await resolve_primary_property(db, division)
            if db_prop:
                return db_prop
        except Exception as exc:
            logger.warning("GA4 DB property resolution failed for %s: %s", division, exc)

    # 3. Env var fallback
    env_map = {
        "cp": settings.GA4_PROPERTY_ID_CP,
        "sanitred": settings.GA4_PROPERTY_ID_SANITRED,
        "ibos": settings.GA4_PROPERTY_ID_IBOS,
    }
    if env_map.get(division):
        return env_map[division]

    # 4. Shared fallback
    return settings.GA4_PROPERTY_ID or None


@router.get(
    "/analytics/web",
    summary="GA4 web analytics for a division",
    responses={
        200: {"description": "Web analytics data for the requested division"},
        401: {"description": "Unauthorized"},
    },
)
async def get_web_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    division: str = Query("cp", description="Division slug: cp, sanitred, ibos"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    granularity: str = Query("auto", description="Granularity: daily, monthly, auto"),
    property_id: Optional[str] = Query(None, description="Explicit GA4 property ID (from Property Switcher)"),
) -> dict:
    """
    Return GA4 web analytics for a division (or a specific property).

    Queries the ga4_metrics table filtered by property_id (resolved from
    the division or explicitly provided via Property Switcher) and date range.

    Returns:
      - scorecards (totals with change%)
      - visitorTrend (time-series for the Visitor Trend chart)
      - trafficSources (source/medium breakdown)
      - deviceData (device category breakdown)
      - hasLiveData flag (so frontend can hide the Estimated Data banner)

    If no GA4 data exists in the DB the endpoint returns hasLiveData=false
    and empty arrays — the frontend falls back to its static seed data.

    Granularity "auto" uses daily when the range is ≤ 90 days, monthly otherwise.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── Resolve which property IDs to query ──────────────────────────
    # If a specific property_id is provided (Property Switcher), use it alone.
    # Otherwise, query ALL enabled properties for the division (aggregated view).
    single_property = property_id  # from query param
    if single_property:
        property_ids = [single_property]
    else:
        # Get all enabled properties for this division
        try:
            from app.models.ga4_property import GA4Property
            props_result = await db.execute(
                select(GA4Property.property_id)
                .where(and_(GA4Property.division == division, GA4Property.enabled == True))
            )
            property_ids = [row[0] for row in props_result.fetchall()]
        except Exception:
            property_ids = []

        # Fallback to single resolved property if no DB entries
        if not property_ids:
            resolved = await _resolve_ga4_property(division, db=db, property_id_override=None)
            property_ids = [resolved] if resolved else []

    if not property_ids:
        logger.info("No GA4 property configured for division '%s'", division)
        return _empty_web_analytics(start_date, end_date, division)

    # ── Resolve granularity ──────────────────────────────────────────
    day_span = (end_date - start_date).days
    if granularity == "auto":
        granularity = "daily" if day_span <= 90 else "monthly"

    # ── Overview rows (channel/source/medium/device = '(all)') ───────
    overview_stmt = (
        select(GA4Metric)
        .where(
            and_(
                GA4Metric.property_id.in_(property_ids),
                GA4Metric.date >= start_date,
                GA4Metric.date <= end_date,
                GA4Metric.channel == "(all)",
                GA4Metric.source == "(all)",
                GA4Metric.device == "(all)",
            )
        )
        .order_by(GA4Metric.date)
    )
    overview_result = await db.execute(overview_stmt)
    overview_rows = overview_result.scalars().all()

    if not overview_rows:
        logger.info(
            "No GA4 data in DB for %s (%d properties), range %s–%s",
            division, len(property_ids), start_date, end_date,
        )
        resp = _empty_web_analytics(start_date, end_date, division)
        resp["property_ids"] = property_ids
        resp["awaiting_data"] = True
        return resp

    # ── Aggregate scorecards ─────────────────────────────────────────
    total_sessions = sum(r.sessions for r in overview_rows)
    total_users = sum(r.total_users for r in overview_rows)
    total_new = sum(r.new_users for r in overview_rows)
    total_returning = total_users - total_new
    total_pageviews = sum(r.page_views for r in overview_rows)
    avg_bounce = (
        sum(r.bounce_rate * r.sessions for r in overview_rows) / max(total_sessions, 1)
    )
    avg_duration = (
        sum(r.avg_session_duration * r.sessions for r in overview_rows) / max(total_sessions, 1)
    )

    # ── Previous period for change % ─────────────────────────────────
    prev_start = start_date - timedelta(days=day_span)
    prev_end = start_date - timedelta(days=1)
    prev_stmt = (
        select(
            func.sum(GA4Metric.sessions).label("sessions"),
            func.sum(GA4Metric.total_users).label("users"),
            func.sum(GA4Metric.new_users).label("new_users"),
        )
        .where(
            and_(
                GA4Metric.property_id.in_(property_ids),
                GA4Metric.date >= prev_start,
                GA4Metric.date <= prev_end,
                GA4Metric.channel == "(all)",
                GA4Metric.source == "(all)",
                GA4Metric.device == "(all)",
            )
        )
    )
    prev_result = await db.execute(prev_stmt)
    prev = prev_result.one_or_none()
    prev_sessions = int(prev.sessions or 0) if prev else 0
    prev_users = int(prev.users or 0) if prev else 0
    prev_returning = (int(prev.users or 0) - int(prev.new_users or 0)) if prev else 0

    def _pct(cur, prv):
        if prv == 0:
            return 0 if cur == 0 else 100.0
        return round(((cur - prv) / abs(prv)) * 100, 1)

    # ── Visitor trend series (aggregated across all properties) ─────
    from collections import OrderedDict as _OD
    visitor_trend = []
    if granularity == "daily":
        daily_agg = _OD()
        for row in overview_rows:
            key = row.date.strftime("%b %d")
            if key not in daily_agg:
                daily_agg[key] = {"visits": 0, "returning": 0}
            daily_agg[key]["visits"] += row.sessions
            daily_agg[key]["returning"] += max(0, row.total_users - row.new_users)
        for label, vals in daily_agg.items():
            visitor_trend.append({"month": label, **vals})
    else:
        monthly_agg = _OD()
        for row in overview_rows:
            key = row.date.strftime("%b %Y")
            if key not in monthly_agg:
                monthly_agg[key] = {"visits": 0, "returning": 0}
            monthly_agg[key]["visits"] += row.sessions
            monthly_agg[key]["returning"] += max(0, row.total_users - row.new_users)
        for label, vals in monthly_agg.items():
            visitor_trend.append({"month": label, **vals})

    # ── Traffic sources ──────────────────────────────────────────────
    traffic_stmt = (
        select(
            (GA4Metric.source + " / " + GA4Metric.medium).label("src_medium"),
            func.sum(GA4Metric.total_users).label("users"),
            func.sum(GA4Metric.sessions).label("sessions"),
            func.avg(GA4Metric.bounce_rate).label("bounce_rate"),
        )
        .where(
            and_(
                GA4Metric.property_id.in_(property_ids),
                GA4Metric.date >= start_date,
                GA4Metric.date <= end_date,
                GA4Metric.source != "(all)",
            )
        )
        .group_by(GA4Metric.source, GA4Metric.medium)
        .order_by(func.sum(GA4Metric.sessions).desc())
        .limit(10)
    )
    traffic_result = await db.execute(traffic_stmt)
    traffic_rows = traffic_result.all()
    traffic_sources = [
        {
            "source": row.src_medium,
            "users": int(row.users or 0),
            "sessions": int(row.sessions or 0),
            "bounceRate": f"{float(row.bounce_rate or 0):.1f}%",
            "avgDuration": "—",  # not stored per-source row
        }
        for row in traffic_rows
    ]

    # ── Device breakdown ─────────────────────────────────────────────
    device_stmt = (
        select(
            GA4Metric.device,
            func.sum(GA4Metric.total_users).label("users"),
        )
        .where(
            and_(
                GA4Metric.property_id.in_(property_ids),
                GA4Metric.date >= start_date,
                GA4Metric.date <= end_date,
                GA4Metric.device != "(all)",
            )
        )
        .group_by(GA4Metric.device)
        .order_by(func.sum(GA4Metric.total_users).desc())
    )
    device_result = await db.execute(device_stmt)
    device_rows = device_result.all()
    device_data = [
        {"device": row.device.title(), "users": int(row.users or 0)}
        for row in device_rows
    ]

    # ── Website breakdown by property (works for all modes) ────────────
    website_breakdown = []
    if True:
        try:
            from app.models.ga4_property import GA4Property
            breakdown_stmt = (
                select(
                    GA4Property.display_name,
                    GA4Property.property_id,
                    func.sum(GA4Metric.total_users).label("users"),
                )
                .join(GA4Property, GA4Property.property_id == GA4Metric.property_id)
                .where(
                    and_(
                        GA4Metric.property_id.in_(property_ids),
                        GA4Metric.date >= start_date,
                        GA4Metric.date <= end_date,
                        GA4Metric.channel == "(all)",
                        GA4Metric.source == "(all)",
                        GA4Metric.device == "(all)",
                    )
                )
                .group_by(GA4Property.display_name, GA4Property.property_id)
                .order_by(func.sum(GA4Metric.total_users).desc())
            )
            breakdown_result = await db.execute(breakdown_stmt)
            _colors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444",
                        "#06B6D4", "#EC4899", "#F97316", "#14B8A6", "#6366F1"]
            for i, row in enumerate(breakdown_result.all()):
                website_breakdown.append({
                    "name": row.display_name,
                    "value": int(row.users or 0),
                    "color": _colors[i % len(_colors)],
                    "propertyId": row.property_id,
                })
        except Exception as e:
            logger.warning("Website breakdown query failed: %s", e)

    logger.info(
        "User %s fetched GA4 web analytics for %s (%d overview rows, %d properties)",
        current_user.id, division, len(overview_rows), len(property_ids),
    )

    return {
        "division": division,
        "property_id": single_property or "all",
        "property_count": len(property_ids),
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "granularity": granularity,
        "hasLiveData": True,
        "websiteBreakdown": website_breakdown,
        "scorecards": {
            "totalVisits": total_sessions,
            "totalVisitsChange": _pct(total_sessions, prev_sessions),
            "returningVisitors": max(0, total_returning),
            "returningChange": _pct(total_returning, prev_returning),
            "bounceRate": round(avg_bounce, 1),
            "avgSessionMin": round(avg_duration / 60, 2),
            "totalUsers": total_users,
            "totalUsersChange": _pct(total_users, prev_users),
        },
        "visitorTrend": visitor_trend,
        "trafficSources": traffic_sources,
        "deviceData": device_data,
    }


@router.get(
    "/analytics/ga4-status",
    summary="GA4 auto-discovery status (admin)",
    responses={
        200: {"description": "GA4 property discovery and mapping status"},
        401: {"description": "Unauthorized"},
    },
)
async def get_ga4_discovery_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Return GA4 account-level discovery results: which properties the service
    account can see across all five target accounts, and how they map to divisions.
    """
    try:
        from app.services.ga4_discovery import get_discovery_status
        return await get_discovery_status(db=db)
    except Exception as exc:
        logger.error("GA4 discovery status failed: %s", exc)
        return {
            "total_properties": 0,
            "by_division": {},
            "error": str(exc),
        }


@router.get(
    "/analytics/ga4-properties",
    summary="List GA4 properties for a division (Property Switcher)",
    responses={200: {"description": "Properties for the given division"}},
)
async def list_ga4_properties(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    division: str = Query("ibos", description="Division slug: cp, sanitred, ibos"),
    include_disabled: bool = Query(False, description="Include disabled properties"),
) -> dict:
    """
    Return all GA4 properties registered for a division.

    Used by the Property Switcher dropdown on I-BOS and DCKN Web Analytics
    pages to let the user toggle between contractor websites.
    """
    from app.services.ga4_discovery import get_properties_for_division

    enabled_only = not include_disabled
    properties = await get_properties_for_division(db, division, enabled_only=enabled_only)

    return {
        "division": division,
        "count": len(properties),
        "properties": properties,
    }


_ga4_discover_status: dict = {"status": "idle"}


async def _ga4_discover_bg() -> None:
    """Run GA4 discovery in background with its own DB session."""
    global _ga4_discover_status
    _ga4_discover_status = {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
    try:
        from app.services.ga4_discovery import persist_discovered_properties
        from app.core.database import async_session_maker
        import asyncio

        async with async_session_maker() as db:
            result = await persist_discovered_properties(db)
        _ga4_discover_status = {
            "status": "completed",
            **result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("GA4 background discovery completed: %s", result)
    except Exception as exc:
        _ga4_discover_status = {
            "status": "failed",
            "error": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.error("GA4 background discovery failed: %s", exc)


@router.post(
    "/analytics/ga4-discover",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger GA4 account-level discovery in background",
    responses={202: {"description": "Discovery started in background"}},
)
async def trigger_ga4_discovery(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Manually trigger GA4 account-level property discovery.
    Runs in background to avoid HTTP timeout. Check /analytics/ga4-discover/status.
    """
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can trigger GA4 discovery",
        )

    if _ga4_discover_status.get("status") == "running":
        return {"status": "already_running", **_ga4_discover_status}

    import asyncio
    asyncio.create_task(_ga4_discover_bg())

    return {
        "status": "accepted",
        "message": "GA4 discovery started in background. Check /analytics/ga4-discover/status for results.",
    }


@router.get(
    "/analytics/ga4-discover/status",
    summary="Check GA4 background discovery status",
)
async def get_ga4_discover_status(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the current or most recent GA4 discovery result."""
    return _ga4_discover_status


@router.put(
    "/analytics/ga4-properties/{property_id}/toggle",
    summary="Enable or disable a GA4 property (Super Admin)",
    responses={200: {"description": "Updated property"}},
)
async def toggle_ga4_property(
    property_id: str,
    enabled: bool = Query(..., description="Enable or disable"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Super Admin toggle for a GA4 property.  This is a permanent PostgreSQL
    write — the enabled state persists across pipeline re-runs.
    """
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can toggle GA4 properties",
        )

    from app.models.ga4_property import GA4Property
    from datetime import datetime, timezone

    result = await db.execute(
        select(GA4Property).where(GA4Property.property_id == property_id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GA4 property '{property_id}' not found",
        )

    prop.enabled = enabled
    prop.status = "active" if enabled else "inactive"
    prop.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(prop)

    logger.info(
        "User %s toggled GA4 property %s (%s) enabled=%s",
        current_user.email, property_id, prop.display_name, enabled,
    )

    return {
        "property_id": prop.property_id,
        "display_name": prop.display_name,
        "division": prop.division,
        "enabled": prop.enabled,
        "status": prop.status,
    }


@router.get(
    "/brand-summary",
    summary="Unified brand landing page — aggregates web + ads + CRM",
)
async def get_brand_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    brand: str = Query("cp", description="Brand slug: cp, sanitred, ibos"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """Lightweight summary for brand landing dashboards. All from DB, no API calls."""
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── Web traffic (GA4) ─────────────────────────────────────────────
    web = {"visits": 0, "users": 0, "bounce_rate": 0}
    try:
        from app.models.ga4_property import GA4Property
        props = await db.execute(
            select(GA4Property.property_id).where(
                and_(GA4Property.division == brand, GA4Property.enabled == True)
            )
        )
        pids = [r[0] for r in props.fetchall()]
        if pids:
            from app.models.metrics import GA4Metric
            web_q = await db.execute(
                select(
                    func.sum(GA4Metric.sessions),
                    func.sum(GA4Metric.total_users),
                    func.avg(GA4Metric.bounce_rate),
                ).where(and_(
                    GA4Metric.property_id.in_(pids),
                    GA4Metric.date >= start_date, GA4Metric.date <= end_date,
                    GA4Metric.channel == "(all)", GA4Metric.source == "(all)", GA4Metric.device == "(all)",
                ))
            )
            r = web_q.one_or_none()
            if r:
                web = {"visits": int(r[0] or 0), "users": int(r[1] or 0), "bounce_rate": round(float(r[2] or 0), 1)}
    except Exception as e:
        logger.warning("Brand summary web query failed: %s", e)

    # ── Ad spend (Meta + Google) ──────────────────────────────────────
    # Scoped to the requested brand via the `division` column on each
    # ad-metric row (stamped at ingest by the pipeline + the
    # _backfill_ad_metric_divisions pass on startup). Without this
    # filter, the I-BOS overview summed every brand's ads and showed
    # 13 leads / $507 spend while the Contractor Breakdown (properly
    # scoped) showed 3 leads / $209 — same date, different answer.
    ads = {"spend": 0, "clicks": 0, "impressions": 0, "leads": 0}
    # The DB uses 'ibos' consistently; accept the legacy 'i-bos' too
    # in case any row was stamped the old way.
    division_values = [brand]
    if brand == "ibos":
        division_values.append("i-bos")
    try:
        from app.models.metrics import MetaAdMetric, GoogleAdMetric
        meta_q = await db.execute(
            select(func.sum(MetaAdMetric.spend), func.sum(MetaAdMetric.clicks), func.sum(MetaAdMetric.impressions), func.sum(MetaAdMetric.conversions))
            .where(and_(
                MetaAdMetric.date >= start_date, MetaAdMetric.date <= end_date,
                MetaAdMetric.division.in_(division_values),
            ))
        )
        m = meta_q.one_or_none()
        if m:
            ads["spend"] += float(m[0] or 0)
            ads["clicks"] += int(m[1] or 0)
            ads["impressions"] += int(m[2] or 0)
            ads["leads"] += int(m[3] or 0)

        gads_q = await db.execute(
            select(func.sum(GoogleAdMetric.spend), func.sum(GoogleAdMetric.clicks), func.sum(GoogleAdMetric.impressions), func.sum(GoogleAdMetric.conversions))
            .where(and_(
                GoogleAdMetric.date >= start_date, GoogleAdMetric.date <= end_date,
                GoogleAdMetric.division.in_(division_values),
            ))
        )
        g = gads_q.one_or_none()
        if g:
            ads["spend"] += float(g[0] or 0)
            ads["clicks"] += int(g[1] or 0)
            ads["impressions"] += int(g[2] or 0)
            ads["leads"] += int(g[3] or 0)
    except Exception as e:
        logger.warning("Brand summary ads query failed: %s", e)

    # ── CRM / HubSpot ────────────────────────────────────────────────
    crm = {"contacts": 0, "deals": 0, "deals_won": 0, "revenue": 0, "meetings": 0}
    try:
        crm_q = await db.execute(
            select(
                func.sum(HubSpotMetric.contacts_created),
                func.sum(HubSpotMetric.deals_created),
                func.sum(HubSpotMetric.deals_won),
                func.sum(HubSpotMetric.revenue_won),
                func.sum(HubSpotMetric.meetings_booked),
            ).where(and_(HubSpotMetric.date >= start_date, HubSpotMetric.date <= end_date))
        )
        c = crm_q.one_or_none()
        if c:
            crm = {
                "contacts": int(c[0] or 0), "deals": int(c[1] or 0),
                "deals_won": int(c[2] or 0), "revenue": float(c[3] or 0),
                "meetings": int(c[4] or 0),
            }
    except Exception as e:
        logger.warning("Brand summary CRM query failed: %s", e)

    # ── Sheets revenue (retail, pre-2026 historical) ──────────────────
    # Same cutoff as the marketing sheets fallback: the TCP MAIN sheet
    # holds Sani-Tred retail revenue for 2024/2025 (pre-WooCommerce
    # pipeline). After 2026-01-01 we have real WooCommerce data, so the
    # sheet row must NOT leak into recent windows. Previously a sheet
    # row dated "today" from a historical import aggregated into $28M
    # whenever the user picked today-only — now capped to the cutoff.
    sheets_revenue = 0
    _SHEETS_HISTORICAL_CUTOFF = date(2026, 1, 1)
    if start_date < _SHEETS_HISTORICAL_CUTOFF:
        sheet_end = min(end_date, _SHEETS_HISTORICAL_CUTOFF)
        try:
            from app.models.metrics import GoogleSheetMetric
            sheets_q = await db.execute(
                select(func.sum(GoogleSheetMetric.metric_value)).where(and_(
                    GoogleSheetMetric.category == "Revenue",
                    GoogleSheetMetric.date >= start_date, GoogleSheetMetric.date <= sheet_end,
                ))
            )
            sheets_revenue = float(sheets_q.scalar() or 0)
        except Exception:
            pass

    # ── Shopify retail (CP Store — CP brand only) ─────────────────────
    shopify_stats = {"revenue": 0.0, "orders": 0, "avg_order": 0.0}
    if brand == "cp":
        try:
            from app.models.metrics import ShopifyOrder as _SO
            sh_q = await db.execute(
                select(
                    func.coalesce(func.sum(_SO.total), 0),
                    func.count(_SO.id),
                    func.coalesce(func.avg(_SO.total), 0),
                ).where(and_(
                    _SO.date_created >= start_date,
                    _SO.date_created <= end_date,
                ))
            )
            row = sh_q.one_or_none()
            if row:
                shopify_stats = {
                    "revenue": float(row[0] or 0),
                    "orders": int(row[1] or 0),
                    "avg_order": float(row[2] or 0),
                }
        except Exception as exc:
            logger.warning("Brand summary Shopify query failed: %s", exc)

    # ── WooCommerce retail (Sani-Tred — sanitred brand only) ──────────
    # Post-2026 the Google Sheet historical revenue is capped to zero
    # (see _SHEETS_HISTORICAL_CUTOFF block above). WooCommerce is now
    # the authoritative retail source for Sani-Tred. If we don't query
    # it, the Retail Revenue tile shows $0 even when orders exist.
    wc_stats = {"revenue": 0.0, "orders": 0, "avg_order": 0.0}
    if brand == "sanitred":
        try:
            from app.models.metrics import WCOrder, SUCCESSFUL_WC_STATUSES
            # total > 0 keeps the order count in lockstep with WC's
            # "Successful Orders" view, which excludes $0 transactions
            # (refunds-to-zero, internal test orders, gift fulfillments
            # with full discount). Without this we counted +1 phantom
            # orders that contributed $0 to revenue but +1 to count.
            wc_q = await db.execute(
                select(
                    func.coalesce(func.sum(WCOrder.total), 0),
                    func.count(WCOrder.id),
                    func.coalesce(func.avg(WCOrder.total), 0),
                ).where(and_(
                    WCOrder.date_created >= start_date,
                    WCOrder.date_created <= end_date,
                    WCOrder.division == "sanitred",
                    WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
                    WCOrder.total > 0,
                ))
            )
            row = wc_q.one_or_none()
            if row:
                wc_stats = {
                    "revenue": float(row[0] or 0),
                    "orders": int(row[1] or 0),
                    "avg_order": float(row[2] or 0),
                }
        except Exception as exc:
            logger.warning("Brand summary WooCommerce query failed: %s", exc)

    # Canonical Sani-Tred retail figure: WooCommerce for current
    # windows, pre-2026 sheet rows for historical. Keeps the
    # `sheets_revenue` response field populated (frontend still reads
    # that name) without requiring coordinated frontend changes.
    sanitred_retail_revenue = (
        wc_stats["revenue"] if start_date >= _SHEETS_HISTORICAL_CUTOFF else sheets_revenue
    )

    # ── Brand-specific KPIs ───────────────────────────────────────────
    if brand == "cp":
        # Headline revenue for the CP brand page is CP Store (Shopify) ONLY.
        # HubSpot closed-won deals aren't necessarily store sales — they
        # include training contracts, B2B, etc. — so counting them as "CP
        # Store Revenue" would be wrong. When we need a composite figure
        # we'll add a separately labeled tile rather than silently summing.
        scorecards = [
            {
                "label": "CP Store Revenue",
                "value": round(shopify_stats["revenue"], 2),
                "format": "currency",
                "color": "blue",
                "source": "Shopify — CP Store orders",
            },
            {"label": "Total Web Visits", "value": web["visits"], "format": "number", "color": "emerald"},
            {"label": "Total Ad Spend", "value": ads["spend"], "format": "currency", "color": "violet"},
            {"label": "Training Signups", "value": crm["contacts"], "format": "number", "color": "amber"},
        ]
    elif brand == "sanitred":
        scorecards = [
            {
                "label": "Retail Revenue",
                "value": round(sanitred_retail_revenue, 2),
                "format": "currency",
                "color": "emerald",
                "source": (
                    "WooCommerce — Sani-Tred orders"
                    if start_date >= _SHEETS_HISTORICAL_CUTOFF
                    else "TCP MAIN sheet (historical)"
                ),
            },
            {"label": "Web Visitors", "value": web["users"], "format": "number", "color": "blue"},
            {"label": "Returning Rate", "value": web["bounce_rate"], "format": "percent", "color": "violet"},
            {"label": "Ad Clicks", "value": ads["clicks"], "format": "number", "color": "amber"},
        ]
    else:  # ibos
        # Active contractors: real count from the contractors table
        # (division = i-bos, active = true), NOT GA4 visits.
        active_contractors = 0
        try:
            ac_q = await db.execute(
                text("""
                    SELECT COUNT(*) FROM contractors
                    WHERE active = TRUE
                      AND status = 'active'
                      AND division IN ('i-bos', 'ibos')
                """)
            )
            active_contractors = ac_q.scalar() or 0
        except Exception:
            pass

        # Contractor revenue: real QB revenue from the TCP QB revenue
        # sheet, filtered to the period. NOT ads_spend × 4.2. Rows live
        # in google_sheet_metrics with sheet_name prefix 'qb_revenue::'.
        contractor_revenue = 0.0
        try:
            from app.models.metrics import GoogleSheetMetric as _GSM
            cr_q = await db.execute(
                select(func.coalesce(func.sum(_GSM.metric_value), 0))
                .where(and_(
                    _GSM.sheet_name.like("qb_revenue::%"),
                    _GSM.date >= start_date,
                    _GSM.date <= end_date,
                ))
            )
            contractor_revenue = float(cr_q.scalar() or 0)
        except Exception:
            contractor_revenue = 0.0

        # I-BOS Contractor Division is about spend → leads → QB revenue.
        # Training Signups belongs to the CP brand (TCP training
        # registrations) and was mislabeled here. Replaced with the
        # date-filtered ad-leads figure already computed above, so this
        # overview reflects contractor marketing performance end-to-end.
        scorecards = [
            {"label": "Contractor Revenue", "value": contractor_revenue, "format": "currency", "color": "amber"},
            {"label": "Active Contractors", "value": active_contractors, "format": "number", "color": "blue"},
            {"label": "Leads", "value": int(ads["leads"] or 0), "format": "number", "color": "emerald"},
            {"label": "Marketing Spend", "value": ads["spend"], "format": "currency", "color": "violet"},
        ]

    # ── Top websites by traffic (GA4 property breakdown) ────────────
    top_websites = []
    try:
        if pids:
            from app.models.ga4_property import GA4Property as _GP
            tw_q = await db.execute(
                select(_GP.display_name, func.sum(GA4Metric.total_users).label("users"))
                .join(_GP, _GP.property_id == GA4Metric.property_id)
                .where(and_(
                    GA4Metric.property_id.in_(pids),
                    GA4Metric.date >= start_date, GA4Metric.date <= end_date,
                    GA4Metric.channel == "(all)", GA4Metric.source == "(all)", GA4Metric.device == "(all)",
                ))
                .group_by(_GP.display_name)
                .order_by(func.sum(GA4Metric.total_users).desc())
                .limit(10)
            )
            _clrs = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4","#EC4899","#F97316","#14B8A6","#6366F1"]
            for i, row in enumerate(tw_q.all()):
                top_websites.append({"name": row[0], "users": int(row[1] or 0), "color": _clrs[i % len(_clrs)]})
    except Exception:
        pass

    # ── Daily traffic trend (last 30 days, aggregated) ────────────────
    traffic_trend = []
    try:
        if pids:
            from collections import OrderedDict as _OD2
            trend_q = await db.execute(
                select(GA4Metric.date, func.sum(GA4Metric.sessions).label("visits"))
                .where(and_(
                    GA4Metric.property_id.in_(pids),
                    GA4Metric.date >= start_date, GA4Metric.date <= end_date,
                    GA4Metric.channel == "(all)", GA4Metric.source == "(all)", GA4Metric.device == "(all)",
                ))
                .group_by(GA4Metric.date)
                .order_by(GA4Metric.date)
            )
            for row in trend_q.all():
                traffic_trend.append({"date": row[0].strftime("%b %d"), "visits": int(row[1] or 0)})
            # Keep last 30 points max
            if len(traffic_trend) > 30:
                traffic_trend = traffic_trend[-30:]
    except Exception:
        pass

    # ── Top reps (from hubspot_deals — CP/ibos only) ──────────────────
    top_reps = []
    try:
        from app.services.hubspot_owners import get_hubspot_owners
        owners_map = await get_hubspot_owners()
        reps_q = await db.execute(text(f"""
            SELECT owner_id, COUNT(*) as deals
            FROM hubspot_deals
            WHERE owner_id IS NOT NULL
              AND created_date >= '{start_date}' AND created_date <= '{end_date}'
            GROUP BY owner_id
            ORDER BY COUNT(*) DESC
            LIMIT 5
        """))
        for row in reps_q.fetchall():
            oid = row[0]
            info = owners_map.get(oid, {})
            name = f"{info.get('first', '')} {info.get('last', '')}".strip() or f"Rep {oid}"
            top_reps.append({"id": str(oid) if oid is not None else None, "name": name, "deals": row[1]})
    except Exception:
        pass

    # sheets_revenue is a legacy field name the frontend still reads
    # for the Sani-Tred Revenue Summary card. For sanitred we return
    # the WC figure under that name when we're past the historical
    # cutoff so the card doesn't display $0 while orders exist.
    response_sheets_revenue = (
        sanitred_retail_revenue if brand == "sanitred" else sheets_revenue
    )

    return {
        "brand": brand,
        "period": f"{start_date} to {end_date}",
        "hasLiveData": (
            web["visits"] > 0
            or ads["spend"] > 0
            or crm["deals"] > 0
            or shopify_stats["orders"] > 0
            or wc_stats["orders"] > 0
        ),
        "scorecards": scorecards,
        "web": web,
        "ads": ads,
        "crm": crm,
        "sheets_revenue": response_sheets_revenue,
        "shopify": shopify_stats,
        "woocommerce": wc_stats,
        "top_websites": top_websites,
        "traffic_trend": traffic_trend,
        "top_reps": top_reps,
    }


def _empty_web_analytics(start_date, end_date, division: str) -> dict:
    """Return the empty / no-live-data shape for the web analytics endpoint."""
    return {
        "division": division,
        "property_id": None,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "granularity": "daily",
        "hasLiveData": False,
        "scorecards": {},
        "visitorTrend": [],
        "trafficSources": [],
        "deviceData": [],
    }


# ---------------------------------------------------------------------------
# Marketing data endpoint — mirrors the Web Analytics live-data pattern
# ---------------------------------------------------------------------------

async def _has_pipeline_run(db: AsyncSession, *pipeline_names: str) -> bool:
    """Check PipelineLog for at least one successful run of any given pipeline."""
    stmt = (
        select(func.count())
        .select_from(PipelineLog)
        .where(
            and_(
                PipelineLog.pipeline_name.in_(pipeline_names),
                PipelineLog.status == PipelineStatus.SUCCESS,
            )
        )
    )
    result = await db.execute(stmt)
    return (result.scalar() or 0) > 0


@router.get(
    "/marketing",
    summary="Get marketing metrics (Meta + Google Ads) with live-data detection",
    responses={
        200: {"description": "Marketing metrics with hasLiveData flag"},
        401: {"description": "Unauthorized"},
    },
)
async def get_marketing_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    division: str = Query("sanitred", description="Division slug: cp, sanitred, ibos"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Return combined Meta + Google Ads marketing data for a division.

    Mirrors the Web Analytics pattern:
    - ``hasLiveData: true`` when at least one ad pipeline has completed
      successfully (even if $0 spend).
    - ``hasLiveData: false`` when no pipeline has ever run.

    The frontend uses this flag to show a green "Live" banner vs the amber
    "Estimated Data" banner.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Check if pipelines have run at least once ──────────────────
    pipeline_ran = await _has_pipeline_run(
        db, "meta_ads", "meta_ads_pipeline", "google_ads", "google_ads_pipeline",
    )

    if not pipeline_ran:
        # Also check in-memory status (handles current-session runs before
        # server restart writes to PipelineLog)
        from app.api.pipelines import _running_pipelines
        for pname in ("meta_ads", "meta_ads_pipeline", "google_ads", "google_ads_pipeline"):
            info = _running_pipelines.get(pname, {})
            if info.get("status") in ("success", "completed"):
                pipeline_ran = True
                break

    if not pipeline_ran:
        # Last-resort check: if the ad-metric tables themselves have rows in
        # the requested range, there IS live data regardless of what
        # PipelineLog says. Backfills that completed the INSERT but crashed
        # before logging would otherwise leave the UI stuck on the amber
        # "Awaiting pipeline sync" banner.
        try:
            meta_count = await db.execute(
                select(func.count()).select_from(MetaAdMetric).where(and_(
                    MetaAdMetric.date >= start_date,
                    MetaAdMetric.date <= end_date,
                ))
            )
            gads_count = await db.execute(
                select(func.count()).select_from(GoogleAdMetric).where(and_(
                    GoogleAdMetric.date >= start_date,
                    GoogleAdMetric.date <= end_date,
                ))
            )
            if (meta_count.scalar() or 0) > 0 or (gads_count.scalar() or 0) > 0:
                pipeline_ran = True
        except Exception as exc:
            logger.warning("Direct ad-metric fallback check failed: %s", exc)

    if not pipeline_ran:
        return {
            "division": division,
            "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
            "hasLiveData": False,
            "scorecards": {},
            "platforms": [],
            "spendByPeriod": [],
        }

    # ── 2. Resolve brand-specific ad account filters ────────────────
    # Hard-coded canonical rules (source of truth — do NOT rely on
    # brand_assets for brand gating, only for enumeration):
    #
    #   cp       Meta = act_144305066 only.         No Google Ads, ever.
    #   sanitred No Meta, ever.                     Google Ads = 2823564937 only.
    #   ibos     Meta = every act_* except CP.      Google Ads = everything
    #                                               except the Sani-Tred CID.
    from sqlalchemy import or_, literal
    CP_TRAINING_META_ID = "act_144305066"
    SANITRED_GADS_CID = "2823564937"

    meta_where = [MetaAdMetric.date >= start_date, MetaAdMetric.date <= end_date]
    gads_where = [GoogleAdMetric.date >= start_date, GoogleAdMetric.date <= end_date]

    # --- Brand gating — single source of truth (division column first,
    # account/customer ID as a fallback for rows written before the
    # division backfill landed). ---
    if division == "cp":
        # Meta: the training account only, by account_id OR by division tag.
        meta_where.append(or_(
            MetaAdMetric.account_id == CP_TRAINING_META_ID,
            MetaAdMetric.division == "cp",
        ))
        # Google Ads: NEVER. Short-circuit the query.
        gads_where.append(literal(False))
    elif division == "sanitred":
        # Meta: NEVER. Sani-Tred is retail/Google only.
        meta_where.append(literal(False))
        # Google Ads: the one Sani-Tred CID.
        gads_where.append(or_(
            GoogleAdMetric.customer_id == SANITRED_GADS_CID,
            GoogleAdMetric.division == "sanitred",
        ))
    elif division == "ibos":
        # Meta: everything except CP training.
        meta_where.append(and_(
            or_(
                MetaAdMetric.division == "ibos",
                MetaAdMetric.account_id.is_(None),
                MetaAdMetric.account_id != CP_TRAINING_META_ID,
            ),
            or_(
                MetaAdMetric.account_id.is_(None),
                MetaAdMetric.account_id != CP_TRAINING_META_ID,
            ),
        ))
        # Google Ads: everything except Sani-Tred's single CID.
        gads_where.append(and_(
            or_(
                GoogleAdMetric.division == "ibos",
                GoogleAdMetric.customer_id.is_(None),
                GoogleAdMetric.customer_id != SANITRED_GADS_CID,
            ),
            or_(
                GoogleAdMetric.customer_id.is_(None),
                GoogleAdMetric.customer_id != SANITRED_GADS_CID,
            ),
        ))
    else:
        # Unknown division → return nothing rather than leaking data.
        meta_where.append(literal(False))
        gads_where.append(literal(False))
    meta_stmt = select(
        func.sum(MetaAdMetric.impressions).label("impressions"),
        func.sum(MetaAdMetric.clicks).label("clicks"),
        func.sum(MetaAdMetric.spend).label("spend"),
        func.sum(MetaAdMetric.conversions).label("conversions"),
        func.sum(MetaAdMetric.conversion_value).label("conversion_value"),
        func.avg(MetaAdMetric.ctr).label("avg_ctr"),
        func.avg(MetaAdMetric.roas).label("avg_roas"),
    ).where(and_(*meta_where))
    meta_result = await db.execute(meta_stmt)
    meta = meta_result.first()

    # ── 4. Google Ads aggregates (filtered by brand — gads_where built above)
    google_stmt = select(
        func.sum(GoogleAdMetric.impressions).label("impressions"),
        func.sum(GoogleAdMetric.clicks).label("clicks"),
        func.sum(GoogleAdMetric.spend).label("spend"),
        func.sum(GoogleAdMetric.conversions).label("conversions"),
        func.sum(GoogleAdMetric.conversion_value).label("conversion_value"),
        func.avg(GoogleAdMetric.ctr).label("avg_ctr"),
        func.avg(GoogleAdMetric.roas).label("avg_roas"),
    ).where(and_(*gads_where))
    google_result = await db.execute(google_stmt)
    gads = google_result.first()

    # ── 4. Daily spend time-series (for Spend & Leads chart) ─────────
    # Re-use the exact same brand filters as the scorecards above — otherwise
    # the chart would show cross-brand totals that disagree with the cards.
    meta_daily = select(
        MetaAdMetric.date,
        func.sum(MetaAdMetric.spend).label("spend"),
        func.sum(MetaAdMetric.conversions).label("leads"),
    ).where(and_(*meta_where)).group_by(MetaAdMetric.date).order_by(MetaAdMetric.date)

    google_daily = select(
        GoogleAdMetric.date,
        func.sum(GoogleAdMetric.spend).label("spend"),
        func.sum(GoogleAdMetric.conversions).label("leads"),
    ).where(and_(*gads_where)).group_by(GoogleAdMetric.date).order_by(GoogleAdMetric.date)

    meta_daily_res = await db.execute(meta_daily)
    google_daily_res = await db.execute(google_daily)

    # Merge daily series by date
    daily_map: dict = {}
    for row in meta_daily_res.all():
        d = row[0].isoformat()
        daily_map.setdefault(d, {"date": d, "spend": 0, "leads": 0})
        daily_map[d]["spend"] += float(row[1] or 0)
        daily_map[d]["leads"] += float(row[2] or 0)
    for row in google_daily_res.all():
        d = row[0].isoformat()
        daily_map.setdefault(d, {"date": d, "spend": 0, "leads": 0})
        daily_map[d]["spend"] += float(row[1] or 0)
        daily_map[d]["leads"] += float(row[2] or 0)

    spend_by_period = sorted(daily_map.values(), key=lambda x: x["date"])

    # ── 5. Build response ─────────────────────────────────────────────
    meta_spend = float(meta[2] or 0)
    meta_conv = float(meta[3] or 0)
    meta_value = float(meta[4] or 0)
    gads_spend = float(gads[2] or 0)
    gads_conv = float(gads[3] or 0)
    gads_value = float(gads[4] or 0)

    total_spend = meta_spend + gads_spend
    total_impressions = int(meta[0] or 0) + int(gads[0] or 0)
    total_clicks = int(meta[1] or 0) + int(gads[1] or 0)
    total_leads = meta_conv + gads_conv
    cpl = (total_spend / total_leads) if total_leads > 0 else 0

    platforms = []
    if meta_spend > 0 or int(meta[0] or 0) > 0:
        meta_roas = (meta_value / meta_spend) if meta_spend > 0 else 0
        meta_cpl = (meta_spend / meta_conv) if meta_conv > 0 else 0
        platforms.append({
            "division": "Meta Ads",
            "spend": meta_spend, "revenue": meta_value,
            "roas": round(meta_roas, 1), "conversions": int(meta_conv),
            "cpl": round(meta_cpl, 2),
        })
    if gads_spend > 0 or int(gads[0] or 0) > 0:
        gads_roas = (gads_value / gads_spend) if gads_spend > 0 else 0
        gads_cpl = (gads_spend / gads_conv) if gads_conv > 0 else 0
        platforms.append({
            "division": "Google Ads",
            "spend": gads_spend, "revenue": gads_value,
            "roas": round(gads_roas, 1), "conversions": int(gads_conv),
            "cpl": round(gads_cpl, 2),
        })

    # ── 6. Google Sheets fallback for historical periods (2024/2025) ────
    # Meta + Google Ads pipelines only carry real data from 2026-01-01
    # onward; before that we fall back to marketing figures manually
    # logged in the TCP MAIN sheet. The fallback must ONLY trigger for
    # ranges that actually precede the ads pipeline cutoff — otherwise
    # a user picking "today" with empty same-day ads data would see
    # lifetime historical totals (a stored aggregate row dated today
    # from an old import) masquerading as the current day. That broke
    # trust in the date picker across Sani-Tred and I-BOS marketing.
    ADS_PIPELINE_CUTOFF = date(2026, 1, 1)
    sheets_fallback_eligible = (
        total_spend == 0 and total_clicks == 0 and start_date < ADS_PIPELINE_CUTOFF
    )
    if sheets_fallback_eligible:
        try:
            # Cap the sheet query to the historical window — never blend
            # sheet rows with recent dates even if the caller's range
            # extends past the cutoff.
            sheet_end = min(end_date, ADS_PIPELINE_CUTOFF)
            from app.models.metrics import GoogleSheetMetric
            sheets_spend = await db.execute(
                select(func.sum(GoogleSheetMetric.metric_value)).where(and_(
                    GoogleSheetMetric.category == "Cost",
                    GoogleSheetMetric.date >= start_date, GoogleSheetMetric.date <= sheet_end,
                ))
            )
            sheets_clicks = await db.execute(
                select(func.sum(GoogleSheetMetric.metric_value)).where(and_(
                    GoogleSheetMetric.category == "Engagement",
                    GoogleSheetMetric.date >= start_date, GoogleSheetMetric.date <= sheet_end,
                ))
            )
            sheets_leads = await db.execute(
                select(func.sum(GoogleSheetMetric.metric_value)).where(and_(
                    GoogleSheetMetric.category == "Lead",
                    GoogleSheetMetric.date >= start_date, GoogleSheetMetric.date <= sheet_end,
                ))
            )
            sheets_conv = await db.execute(
                select(func.sum(GoogleSheetMetric.metric_value)).where(and_(
                    GoogleSheetMetric.category == "Conversion",
                    GoogleSheetMetric.date >= start_date, GoogleSheetMetric.date <= sheet_end,
                ))
            )
            s_spend = float(sheets_spend.scalar() or 0)
            s_clicks = int(sheets_clicks.scalar() or 0)
            s_leads = float(sheets_leads.scalar() or 0)
            s_conv = float(sheets_conv.scalar() or 0)

            if s_spend > 0 or s_clicks > 0:
                total_spend = s_spend
                total_clicks = s_clicks
                total_leads = s_leads
                total_impressions = s_clicks * 15  # estimated from click data
                cpl = (s_spend / s_leads) if s_leads > 0 else 0
                platforms.append({
                    "division": "Google Sheets (Historical)",
                    "spend": s_spend, "revenue": s_conv,
                    "roas": round(s_conv / s_spend, 1) if s_spend > 0 else 0,
                    "conversions": int(s_leads), "cpl": round(cpl, 2),
                })
        except Exception as e:
            logger.warning("Sheets marketing fallback failed: %s", e)

    # ── Vetted-leads override (Customer Lead Tracking sheet) ─────────
    # Source-of-truth lead count comes from the leads:: rows. Spend stays
    # as Meta+Google sum. CPL is recomputed against the vetted total when
    # any leads row exists for the period; otherwise we keep the
    # ad-platform conversions.
    leads_source = "ad_platform_conversions"
    try:
        vetted_map = await _get_vetted_leads_map(db, start_date, end_date)
        if vetted_map:
            vetted_total = sum(vetted_map.values())
            if vetted_total > 0:
                total_leads = vetted_total
                cpl = (total_spend / vetted_total) if total_spend > 0 else 0
                leads_source = "vetted_sheet"
    except Exception as exc:
        logger.warning(f"vetted-leads override skipped (marketing): {exc}")

    logger.info(
        "Marketing data for %s: spend=$%.2f, impressions=%d, leads=%d, hasLive=True, leads_source=%s",
        division, total_spend, total_impressions, total_leads, leads_source,
    )

    return {
        "division": division,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "hasLiveData": True,
        "scorecards": {
            "totalSpend": total_spend,
            "totalImpressions": total_impressions,
            "totalClicks": total_clicks,
            "totalLeads": total_leads,
            "cpl": round(cpl, 2),
        },
        "leads_source": leads_source,
        "platforms": platforms,
        "spendByPeriod": spend_by_period,
    }


# ────────────────────────────────────────────────────────────────────────────
# Contractor Breakdown — live per-contractor metrics from GA4 + Ads
# ────────────────────────────────────────────────────────────────────────────

def _match_preset_window(start_date: date, end_date: date) -> Optional[str]:
    """Map a (date_from, date_to) pair to a pre-computed reach preset key.

    The Meta pipeline pre-computes period-unique reach for these five
    windows every scheduled run (see MetaAdsPipeline.post_load). When
    the dashboard's date picker lands on one of them we can serve the
    exact Meta-UI number straight from the DB. Custom ranges return
    None and the dashboard falls back to the campaign-sum approximation.
    """
    from calendar import monthrange
    today = date.today()

    # YTD
    if start_date == date(today.year, 1, 1) and end_date == today:
        return "ytd"
    # This Month (1st of current month → today)
    if start_date == date(today.year, today.month, 1) and end_date == today:
        return "this_month"
    # Last Month (calendar previous month)
    first_this = date(today.year, today.month, 1)
    last_month_end = first_this - timedelta(days=1)
    last_month_start = date(last_month_end.year, last_month_end.month, 1)
    if start_date == last_month_start and end_date == last_month_end:
        return "last_month"
    # Last 7 days
    if start_date == today - timedelta(days=6) and end_date == today:
        return "last_7"
    # Last 30 days
    if start_date == today - timedelta(days=29) and end_date == today:
        return "last_30"
    return None


@router.get(
    "/contractor-breakdown",
    summary="Per-contractor metrics for I-BOS breakdown page",
)
async def get_contractor_breakdown(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """Live per-contractor aggregation from GA4 properties + brand_assets."""
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Pull GA4 traffic per contractor (identified by contractor_id) ─
    contractors: list[dict] = []
    try:
        from app.models.ga4_property import GA4Property
        props_q = await db.execute(
            select(
                func.min(GA4Property.property_id).label("property_id"),
                func.min(GA4Property.display_name).label("display_name"),
                GA4Property.contractor_id,
                func.sum(GA4Metric.sessions).label("visits"),
                func.sum(GA4Metric.total_users).label("users"),
                func.avg(GA4Metric.bounce_rate).label("bounce"),
            )
            .join(GA4Property, GA4Property.property_id == GA4Metric.property_id)
            .where(and_(
                GA4Property.division == "ibos",
                GA4Property.enabled == True,
                GA4Metric.date >= start_date,
                GA4Metric.date <= end_date,
                GA4Metric.channel == "(all)",
                GA4Metric.source == "(all)",
                GA4Metric.device == "(all)",
            ))
            .group_by(GA4Property.contractor_id)
            .order_by(func.sum(GA4Metric.sessions).desc())
            .limit(40)  # widened so we can merge before trimming to 20
        )

        _colors = ["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EF4444","#06B6D4","#EC4899","#F97316","#14B8A6","#6366F1"]
        for i, row in enumerate(props_q.all()):
            clean_name = (row.display_name or "").replace("[GA4]", "").strip()
            contractors.append({
                "id": row.contractor_id or row.property_id,
                "name": clean_name or row.display_name,
                "property_id": row.property_id,
                "visits": int(row.visits or 0),
                "users": int(row.users or 0),
                "bounce_rate": round(float(row.bounce or 0), 1),
                "color": _colors[i % len(_colors)],
                # Ad metrics filled in below when a brand_assets match exists
                "meta_account_id": None,
                "meta_account_name": None,
                "sources": ["GA4"],
                "spend": 0.0, "leads": 0, "revenue": 0.0, "cpl": 0.0,
                "impressions": 0, "reach": 0, "cpm": 0.0, "frequency": 0.0, "ctr": 0.0,
                "meta_spend": 0.0, "google_spend": 0.0, "daily": [],
            })
    except Exception as e:
        logger.warning("Contractor breakdown GA4 query failed: %s", e)

    # ── 2. Pull per-Meta-account spend (I-BOS brand only, CP purged) ────
    CP_TRAINING_META_ID = "act_144305066"
    meta_spend_by_account: dict[str, dict] = {}
    try:
        from app.models.brand_asset import BrandAsset
        ba_rows = await db.execute(
            select(BrandAsset.account_id, BrandAsset.account_name).where(and_(
                BrandAsset.platform == "meta",
                BrandAsset.brand == "ibos",
                BrandAsset.account_id != CP_TRAINING_META_ID,
            ))
        )
        ibos_meta_accounts = {r[0]: r[1] for r in ba_rows.fetchall()}

        if ibos_meta_accounts:
            # Sum across campaigns is correct for spend/impressions/clicks
            # (additive). For reach it is NOT — summing campaign reach
            # double-counts anyone who saw >1 campaign in the same account.
            # We separately sum the deduped per-day account_reach below.
            meta_agg = await db.execute(
                select(
                    MetaAdMetric.account_id,
                    func.sum(MetaAdMetric.spend).label("spend"),
                    func.sum(MetaAdMetric.conversions).label("leads"),
                    func.sum(MetaAdMetric.conversion_value).label("revenue"),
                    func.sum(MetaAdMetric.impressions).label("impressions"),
                    func.sum(MetaAdMetric.reach).label("campaign_reach_sum"),
                    func.sum(MetaAdMetric.clicks).label("clicks"),
                ).where(and_(
                    MetaAdMetric.date >= start_date,
                    MetaAdMetric.date <= end_date,
                    MetaAdMetric.account_id.in_(ibos_meta_accounts.keys()),
                    MetaAdMetric.account_id != CP_TRAINING_META_ID,
                )).group_by(MetaAdMetric.account_id)
            )
            agg_rows = meta_agg.all()

            # Deduped reach per account — take MAX(account_reach) per
            # (account_id, date) to collapse duplicate campaign rows, then
            # SUM across days. When account_reach is 0 (row was ingested
            # before the account-level call was added, or the API call
            # failed that day), fall back to MAX(campaign_reach) for that
            # day so we never regress below the pre-fix behavior.
            day_reach_expr = func.coalesce(
                func.nullif(func.max(MetaAdMetric.account_reach), 0),
                func.max(MetaAdMetric.reach),
            )
            daily_reach_sub = (
                select(
                    MetaAdMetric.account_id.label("aid"),
                    MetaAdMetric.date.label("d"),
                    day_reach_expr.label("day_reach"),
                )
                .where(and_(
                    MetaAdMetric.date >= start_date,
                    MetaAdMetric.date <= end_date,
                    MetaAdMetric.account_id.in_(ibos_meta_accounts.keys()),
                    MetaAdMetric.account_id != CP_TRAINING_META_ID,
                ))
                .group_by(MetaAdMetric.account_id, MetaAdMetric.date)
                .subquery()
            )
            reach_agg = await db.execute(
                select(
                    daily_reach_sub.c.aid,
                    func.sum(daily_reach_sub.c.day_reach).label("reach"),
                ).group_by(daily_reach_sub.c.aid)
            )
            reach_by_account = {r.aid: int(r.reach or 0) for r in reach_agg.all()}

            for r in agg_rows:
                impressions = int(r.impressions or 0)
                # Prefer per-day deduped reach (falls back to MAX campaign
                # reach per day internally); only drop to the summed
                # campaign reach if the subquery returned nothing at all.
                reach = reach_by_account.get(r.account_id, 0) or int(r.campaign_reach_sum or 0)
                clicks = int(r.clicks or 0)
                spend = float(r.spend or 0)
                meta_spend_by_account[r.account_id] = {
                    "spend": spend,
                    "leads": int(r.leads or 0),
                    "revenue": float(r.revenue or 0),
                    "impressions": impressions,
                    "reach": reach,
                    "clicks": clicks,
                    "cpm": round((spend / impressions * 1000), 2) if impressions > 0 else 0.0,
                    "frequency": round((impressions / reach), 2) if reach > 0 else 0.0,
                    "ctr": round((clicks / impressions * 100), 2) if impressions > 0 else 0.0,
                    "account_name": ibos_meta_accounts.get(r.account_id) or r.account_id,
                }
    except Exception as e:
        logger.warning("Contractor breakdown Meta spend query failed: %s", e)

    # ── 3. Match Meta spend to GA4 contractors by normalized name ───────
    # The [META] / [GA4] prefixes and "- GA4" suffixes shouldn't create two
    # rows for the same business. Normalize and merge.
    def _norm(s: str) -> str:
        if not s:
            return ""
        s = s.lower()
        for token in ("[meta]", "[ga4]", "[g-ads]", "- ga4", "(greg haber)"):
            s = s.replace(token, "")
        return "".join(ch for ch in s if ch.isalnum())

    # Build a lookup: normalized Meta account_name → account_id/metrics
    meta_by_norm = {
        _norm(v["account_name"]): (acct_id, v)
        for acct_id, v in meta_spend_by_account.items()
    }

    # Pre-load contractor → meta_account_id mapping from the DB so we can
    # match directly, not just by fuzzy name. This handles cases where the
    # display name differs from the Meta ad-account name (e.g. "Schmidt
    # Custom Flooring" contractor with Meta account "SCF Concrete Promo").
    from app.models.contractor import Contractor as _C
    _cmeta_q = await db.execute(
        select(_C.id, _C.meta_account_id).where(_C.meta_account_id.isnot(None))
    )
    contractor_meta_map = {row[0]: row[1] for row in _cmeta_q.all()}

    matched_meta_accounts: set[str] = set()
    for c in contractors:
        # ── First: direct match by stored meta_account_id on the contractor record
        stored_meta_id = contractor_meta_map.get(c["id"])
        if stored_meta_id and stored_meta_id in meta_spend_by_account:
            metrics = meta_spend_by_account[stored_meta_id]
            c["meta_account_id"] = stored_meta_id
            c["meta_account_name"] = metrics["account_name"]
            c["spend"] = round(metrics["spend"], 2)
            c["meta_spend"] = round(metrics["spend"], 2)
            c["leads"] = metrics["leads"]
            c["revenue"] = round(metrics["revenue"], 2)
            c["impressions"] = metrics["impressions"]
            c["reach"] = metrics["reach"]
            c["cpm"] = metrics["cpm"]
            c["frequency"] = metrics["frequency"]
            c["ctr"] = metrics["ctr"]
            c["cpl"] = round(c["spend"] / max(c["leads"], 1), 2) if c["leads"] > 0 else 0
            if "META" not in c["sources"]:
                c["sources"].append("META")
            matched_meta_accounts.add(stored_meta_id)
            continue
        # ── Fallback: fuzzy name match
        key = _norm(c["name"])
        if not key:
            continue
        for meta_norm, (acct_id, metrics) in meta_by_norm.items():
            if key == meta_norm or key in meta_norm or meta_norm in key:
                c["meta_account_id"] = acct_id
                c["meta_account_name"] = metrics["account_name"]
                c["spend"] = round(metrics["spend"], 2)
                c["meta_spend"] = round(metrics["spend"], 2)
                c["leads"] = metrics["leads"]
                c["revenue"] = round(metrics["revenue"], 2)
                c["impressions"] = metrics["impressions"]
                c["reach"] = metrics["reach"]
                c["cpm"] = metrics["cpm"]
                c["frequency"] = metrics["frequency"]
                c["ctr"] = metrics["ctr"]
                c["cpl"] = round(c["spend"] / max(c["leads"], 1), 2) if c["leads"] > 0 else 0
                if "META" not in c["sources"]:
                    c["sources"].append("META")
                matched_meta_accounts.add(acct_id)
                break

    # ── 4. Fold Meta-only accounts (no GA4 match) into the list ─────────
    # Only include Meta accounts that belong to an active contractor
    # (prevents phantom entries in the breakdown that aren't in Management).
    from app.models.contractor import Contractor as ContractorModel
    active_q = await db.execute(
        select(ContractorModel.id, ContractorModel.name, ContractorModel.meta_account_id)
        .where(ContractorModel.active == True)
    )
    active_rows = active_q.all()
    active_ids = {r[0] for r in active_rows}
    active_meta_ids = {r[2] for r in active_rows if r[2]}
    active_names_norm = {_norm(r[1]): r[0] for r in active_rows}

    # Build reverse lookup: contractor_id → clean name from contractors table
    active_id_to_name = {r[0]: r[1] for r in active_rows}
    # Reverse: meta_account_id → contractor_id (for direct lookup)
    meta_id_to_cid = {r[2]: r[0] for r in active_rows if r[2]}

    for acct_id, metrics in meta_spend_by_account.items():
        if acct_id in matched_meta_accounts:
            continue
        # Resolve this Meta account to a contractor_id (the slug in the
        # contractors table) — NOT the Meta account ID. This keeps c["id"]
        # consistent across the whole breakdown flow.
        acct_norm = _norm(metrics["account_name"])
        linked_cid: Optional[str] = None
        if acct_id in meta_id_to_cid:
            linked_cid = meta_id_to_cid[acct_id]  # direct: contractor has this meta_account_id
        else:
            for norm_name, cid in active_names_norm.items():
                if acct_norm == norm_name or acct_norm in norm_name or norm_name in acct_norm:
                    linked_cid = cid
                    break
        if linked_cid is None:
            continue  # skip — not linked to any active contractor
        # Use the CLEAN name from the contractors table
        display_name = active_id_to_name.get(linked_cid, metrics["account_name"])
        contractors.append({
            "id": linked_cid,
            "name": display_name,
            "property_id": None,
            "visits": 0, "users": 0, "bounce_rate": 0.0,
            "color": "#64748B",
            "meta_account_id": acct_id,
            "meta_account_name": metrics["account_name"],
            "sources": ["META"],
            "spend": round(metrics["spend"], 2),
            "leads": metrics["leads"],
            "revenue": round(metrics["revenue"], 2),
            "impressions": metrics["impressions"],
            "reach": metrics["reach"],
            "cpm": metrics["cpm"],
            "frequency": metrics["frequency"],
            "ctr": metrics["ctr"],
            "cpl": round(metrics["spend"] / max(metrics["leads"], 1), 2) if metrics["leads"] > 0 else 0,
            "meta_spend": round(metrics["spend"], 2),
            "google_spend": 0.0,
            "daily": [],
        })
        matched_meta_accounts.add(acct_id)

    # Final gate: only keep contractors that are active in the contractors table.
    # Also exclude entries whose name starts with [META]/[GA4] or whose id is
    # the CP training account — those are not I-BOS contractors.
    CP_META_ID = "act_144305066"
    contractors = [
        c for c in contractors
        if (c["id"] in active_ids or _norm(c["name"]) in active_names_norm)
        and c["id"] != CP_META_ID
        and not (c.get("name") or "").startswith("[META]")
        and not (c.get("name") or "").startswith("[GA4]")
    ]

    # Clean up names: strip [META]/[GA4] prefixes and "- GA4" suffixes.
    # Breakdown is for executives — no platform tags.
    for c in contractors:
        name = c["name"]
        for prefix in ("[META] ", "[GA4] ", "[META]", "[GA4]"):
            if name.startswith(prefix):
                name = name[len(prefix):].strip()
        if name.endswith("- GA4"):
            name = name[:-5].strip()
        c["name"] = name

    # Ensure ALL active contractors appear — even those with zero data for
    # the selected date range. The executive needs to see every active
    # contractor regardless of whether they generated revenue this period.
    _colors = ["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EF4444","#06B6D4","#EC4899","#F97316","#14B8A6","#6366F1"]
    present_ids = {c["id"] for c in contractors}
    present_norms = {_norm(c["name"]) for c in contractors}
    for row in active_rows:
        cid, cname, _ = row
        # Skip CP training account and [META]/[GA4] prefixed entries
        if cid == CP_META_ID:
            continue
        if cname.startswith("[META]") or cname.startswith("[GA4]"):
            continue
        if cid in present_ids or _norm(cname) in present_norms:
            continue
        contractors.append({
            "id": cid,
            "name": cname,
            "property_id": None,
            "visits": 0, "users": 0, "bounce_rate": 0.0,
            "color": _colors[len(contractors) % len(_colors)],
            "meta_account_id": None,
            "meta_account_name": None,
            "sources": [],
            "spend": 0.0, "leads": 0, "revenue": 0.0, "cpl": 0.0,
            "impressions": 0, "reach": 0, "cpm": 0.0, "frequency": 0.0, "ctr": 0.0,
            "meta_spend": 0.0, "google_spend": 0.0, "daily": [],
        })

    # Sort by visits desc then spend desc, and cap to 30
    contractors.sort(key=lambda c: (c["visits"], c["spend"]), reverse=True)
    contractors = contractors[:30]

    # Google Ads CID → contractor slug map (hoisted so the daily-series
    # block below and the Google Ads fold-in section #5 both use it).
    GADS_CONTRACTOR_MAP = {
        "6754610688": "tailored",   # Tailored Concrete Coatings
        "2957400868": "slg",        # SLG Contracting Inc.
    }

    # ── 4b. Daily spend/leads series per contractor (for sparklines) ────
    # Queries Meta + Google Ads daily rows ONCE, then folds into each
    # contractor's `daily` array. Purely additive — no existing totals
    # are recomputed here.
    try:
        from datetime import timedelta as _td
        # Build the date skeleton so contractors with sparse data still
        # render a continuous sparkline (zero-filled days).
        _day_skel: list[str] = []
        _d = start_date
        while _d <= end_date:
            _day_skel.append(_d.isoformat())
            _d += _td(days=1)

        # Map meta_account_id → contractor reference
        meta_to_c = {c["meta_account_id"]: c for c in contractors if c.get("meta_account_id")}
        # Map google customer_id → contractor reference (direct-mapped only)
        google_to_c: dict[str, dict] = {}
        for cid_key, target_slug in GADS_CONTRACTOR_MAP.items():
            for c in contractors:
                cid_lower = (c["id"] or "").lower()
                name_lower = (c["name"] or "").lower()
                if target_slug in cid_lower or target_slug in name_lower:
                    google_to_c[cid_key] = c
                    break

        # Per-contractor daily accumulator keyed by date string
        per_c: dict[str, dict[str, dict]] = {
            c["id"]: {d: {"date": d, "spend": 0.0, "leads": 0} for d in _day_skel}
            for c in contractors
        }

        # Daily Meta rows
        if meta_to_c:
            meta_daily_q = await db.execute(
                select(
                    MetaAdMetric.account_id,
                    MetaAdMetric.date,
                    func.sum(MetaAdMetric.spend).label("spend"),
                    func.sum(MetaAdMetric.conversions).label("leads"),
                ).where(and_(
                    MetaAdMetric.date >= start_date,
                    MetaAdMetric.date <= end_date,
                    MetaAdMetric.account_id.in_(list(meta_to_c.keys())),
                    MetaAdMetric.account_id != CP_TRAINING_META_ID,
                )).group_by(MetaAdMetric.account_id, MetaAdMetric.date)
            )
            for r in meta_daily_q.all():
                c = meta_to_c.get(r.account_id)
                if not c:
                    continue
                dkey = r.date.isoformat()
                bucket = per_c[c["id"]].get(dkey)
                if bucket is None:
                    continue
                bucket["spend"] = round(bucket["spend"] + float(r.spend or 0), 2)
                bucket["leads"] = bucket["leads"] + int(r.leads or 0)

        # Daily Google Ads rows (direct-mapped CIDs only)
        if google_to_c:
            gads_daily_q = await db.execute(
                select(
                    GoogleAdMetric.customer_id,
                    GoogleAdMetric.date,
                    func.sum(GoogleAdMetric.spend).label("spend"),
                    func.sum(GoogleAdMetric.conversions).label("leads"),
                ).where(and_(
                    GoogleAdMetric.date >= start_date,
                    GoogleAdMetric.date <= end_date,
                    GoogleAdMetric.customer_id.in_(list(google_to_c.keys())),
                )).group_by(GoogleAdMetric.customer_id, GoogleAdMetric.date)
            )
            for r in gads_daily_q.all():
                c = google_to_c.get(r.customer_id)
                if not c:
                    continue
                dkey = r.date.isoformat()
                bucket = per_c[c["id"]].get(dkey)
                if bucket is None:
                    continue
                bucket["spend"] = round(bucket["spend"] + float(r.spend or 0), 2)
                bucket["leads"] = bucket["leads"] + int(r.leads or 0)

        # Attach as ordered array
        for c in contractors:
            c["daily"] = [per_c[c["id"]][d] for d in _day_skel]
    except Exception as e:
        logger.warning("Contractor breakdown daily series failed: %s", e)

    # ── 5. Portfolio totals (I-BOS only — CP already excluded) ──────────
    total_visits = sum(c["visits"] for c in contractors)
    total_users = sum(c["users"] for c in contractors)
    total_spend = sum(c["spend"] for c in contractors)
    total_leads = sum(c["leads"] for c in contractors)

    # Google Ads spend: map CIDs to specific contractors using the hoisted
    # GADS_CONTRACTOR_MAP (see above — also consumed by the daily-series block).
    try:
        from app.models.brand_asset import BrandAsset
        ba_g = await db.execute(
            select(BrandAsset.account_id).where(and_(
                BrandAsset.platform == "google_ads", BrandAsset.brand == "ibos",
            ))
        )
        ibos_gads = [r[0] for r in ba_g.fetchall()]
        if ibos_gads:
            # Fetch per-CID spend
            gads_per_cid = await db.execute(
                select(
                    GoogleAdMetric.customer_id,
                    func.coalesce(func.sum(GoogleAdMetric.spend), 0),
                    func.coalesce(func.sum(GoogleAdMetric.conversions), 0),
                ).where(and_(
                    GoogleAdMetric.date >= start_date,
                    GoogleAdMetric.date <= end_date,
                    GoogleAdMetric.customer_id.in_(ibos_gads),
                )).group_by(GoogleAdMetric.customer_id)
            )
            for cid, gspend, gleads in gads_per_cid.all():
                gspend = float(gspend or 0)
                gleads = int(gleads or 0)
                total_spend += gspend
                total_leads += gleads

                # Try to find the matching contractor by slug prefix
                target_slug = GADS_CONTRACTOR_MAP.get(cid)
                matched = False
                if target_slug:
                    for c in contractors:
                        cid_lower = (c["id"] or "").lower()
                        name_lower = (c["name"] or "").lower()
                        if target_slug in cid_lower or target_slug in name_lower:
                            c["spend"] = round(c["spend"] + gspend, 2)
                            c["google_spend"] = round(c.get("google_spend", 0.0) + gspend, 2)
                            c["leads"] = c["leads"] + gleads
                            c["cpl"] = round(c["spend"] / max(c["leads"], 1), 2) if c["leads"] > 0 else 0
                            if "G-ADS" not in c["sources"]:
                                c["sources"].append("G-ADS")
                            matched = True
                            break

                # Fallback: if no direct map, distribute proportionally
                if not matched:
                    visits_total = sum(c2["visits"] for c2 in contractors) or 1
                    for c in contractors:
                        if c["visits"] <= 0:
                            continue
                        share = c["visits"] / visits_total
                        c["spend"] = round(c["spend"] + gspend * share, 2)
                        c["google_spend"] = round(c.get("google_spend", 0.0) + gspend * share, 2)
                        c["leads"] = int(round(c["leads"] + gleads * share))
                        c["cpl"] = round(c["spend"] / max(c["leads"], 1), 2) if c["leads"] > 0 else 0
    except Exception as e:
        logger.warning("Contractor breakdown Google Ads fold-in failed: %s", e)

    # ── QB Revenue: replace heuristic with real QuickBooks data ─────
    # The QB_Contractor_Revenue tab is stored as qb_revenue:: prefixed
    # GoogleSheetMetric rows. Match by contractor name (fuzzy).
    # Manual alias map for contractors whose ad-account name differs from
    # their QuickBooks business name (no fuzzy match possible).
    QB_NAME_ALIASES = {
        "scf concrete promo": "schmidt custom flooring",
        "schmidt custom flooring": "schmidt custom flooring",  # after rename
    }
    try:
        qb_q = await db.execute(
            select(
                GoogleSheetMetric.metric_name,
                func.sum(GoogleSheetMetric.metric_value).label("revenue"),
            ).where(and_(
                GoogleSheetMetric.sheet_name.like("qb_revenue::%"),
                GoogleSheetMetric.date >= start_date,
                GoogleSheetMetric.date <= end_date,
            )).group_by(GoogleSheetMetric.metric_name)
        )
        qb_data = {row[0].strip().lower(): float(row[1] or 0) for row in qb_q.all()}

        if qb_data:
            logger.info("QB revenue data found: %d contractors, names=%s",
                        len(qb_data), list(qb_data.keys())[:20])
            for c in contractors:
                c_name = (c["name"] or "").lower().strip()
                c_id = (c["id"] or "").lower().strip()
                # Check alias map first (for names that can't fuzzy-match)
                alias = QB_NAME_ALIASES.get(c_name)
                # Try exact match (or alias), then substring match
                matched_rev = qb_data.get(alias) if alias else None
                if matched_rev is None:
                    matched_rev = qb_data.get(c_name)
                if matched_rev is None:
                    # Fuzzy: check if contractor name is contained in any QB name or vice versa
                    for qb_name, qb_rev in qb_data.items():
                        if c_name in qb_name or qb_name in c_name:
                            matched_rev = qb_rev
                            break
                        # Also try matching just the first two words
                        c_words = c_name.split()[:2]
                        qb_words = qb_name.split()[:2]
                        if len(c_words) >= 2 and c_words == qb_words:
                            matched_rev = qb_rev
                            break
                        # Try matching contractor slug/id (e.g. "tvs" in "tvs coatings inc")
                        if c_id and len(c_id) >= 3 and c_id in qb_name:
                            matched_rev = qb_rev
                            break
                        # Try matching first word of contractor name (for short names)
                        first_word = c_name.split()[0] if c_name else ""
                        if first_word and len(first_word) >= 3 and first_word in qb_name.split():
                            matched_rev = qb_rev
                            break
                if matched_rev is not None and matched_rev > 0:
                    c["revenue"] = round(matched_rev, 2)
                    c["revenue_source"] = "quickbooks"
                    if "QB" not in c.get("sources", []):
                        c.setdefault("sources", []).append("QB")
                else:
                    logger.debug("QB no match for '%s' (id=%s)", c_name, c_id)
    except Exception as exc:
        logger.warning("QB revenue lookup failed: %s", exc)

    # Heuristic fallback ONLY for contractors with no QB match AND no Meta conversion_value
    for c in contractors:
        if c.get("revenue", 0) == 0 and c["leads"] > 0:
            c["revenue"] = round(c["leads"] * 2500, 2)
            c["revenue_source"] = "estimate"

    total_revenue = sum(c.get("revenue", 0) for c in contractors)

    # Replace summed campaign reach with the period-unique number Meta
    # Ads Manager shows ("Accounts Center accounts"). This comes from
    # meta_period_reach — populated by the Meta pipeline post_load hook
    # every scheduled run. The dashboard NEVER calls Meta at request
    # time; if the user's window matches one of the pipeline's pre-
    # computed presets (this_month / last_month / last_7 / last_30 /
    # ytd) we use that exact value; otherwise we fall back to the
    # stored campaign-sum approximation.
    preset_match = _match_preset_window(start_date, end_date)
    if preset_match:
        from app.models.metrics import MetaPeriodReach as _MPR
        acct_ids_with_meta = [c["meta_account_id"] for c in contractors if c.get("meta_account_id")]
        if acct_ids_with_meta:
            pr_q = await db.execute(
                select(_MPR.account_id, _MPR.reach, _MPR.fetched_at).where(and_(
                    _MPR.account_id.in_(acct_ids_with_meta),
                    _MPR.preset_key == preset_match,
                ))
            )
            period_reach_by_acct = {r.account_id: int(r.reach or 0) for r in pr_q.all()}
            for c in contractors:
                aid = c.get("meta_account_id")
                if not aid or aid not in period_reach_by_acct:
                    continue
                live = period_reach_by_acct[aid]
                if live <= 0:
                    continue
                c["reach"] = live
                c["reach_source"] = "meta_period_reach"
                imps = int(c.get("impressions") or 0)
                if imps > 0:
                    c["frequency"] = round(imps / live, 2)

    # ── Vetted-leads override (Customer Lead Tracking sheet) ─────────
    # Spend stays as Meta+Google sum, but lead counts come ONLY from the
    # leads:: rows. CPL is recomputed accordingly. If the leads sheet
    # isn't populated for this period (or hasn't been shared with the
    # service account), the map is empty and we fall back to the
    # ad-platform conversion counts already in c["leads"].
    leads_map = await _get_vetted_leads_map(db, start_date, end_date)
    if leads_map:
        vetted_total = 0
        matched = 0
        for c in contractors:
            v = _resolve_vetted_leads(c.get("name") or "", leads_map)
            if v is None:
                continue
            c["leads"] = int(v)
            c["leads_source"] = "vetted_sheet"
            spend = float(c.get("spend") or 0)
            c["cpl"] = round(spend / max(int(v), 1), 2) if int(v) > 0 else 0
            vetted_total += int(v)
            matched += 1
        if matched:
            total_leads = vetted_total
            logger.info(
                f"Vetted leads override applied: {matched} contractor(s), "
                f"{vetted_total} total leads"
            )

    return {
        "period": f"{start_date} to {end_date}",
        "hasLiveData": len(contractors) > 0,
        "preset_match": preset_match,
        "total_visits": total_visits,
        "total_users": total_users,
        "total_spend": round(total_spend, 2),
        "total_leads": total_leads,
        "total_revenue": round(total_revenue, 2),
        "leads_source": "vetted_sheet" if leads_map else "ad_platform_conversions",
        "contractors": contractors,
    }


# ────────────────────────────────────────────────────────────────────────────
# Meta account index — helper for figuring out the right account_id.
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/meta-accounts",
    summary="List all Meta ad accounts known to the system with their contractor mapping",
)
async def list_meta_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return every Meta account we've discovered via brand_assets or the
    contractors table, with the linked contractor name where available.

    Use this to find the correct account_id before calling /meta-validate.
    """
    from app.models.brand_asset import BrandAsset
    from app.models.contractor import Contractor
    from sqlalchemy import and_, select as _select

    ba_q = await db.execute(
        _select(BrandAsset.account_id, BrandAsset.account_name, BrandAsset.brand).where(
            BrandAsset.platform == "meta"
        ).order_by(BrandAsset.account_name)
    )
    accounts: dict[str, dict] = {}
    for r in ba_q.all():
        if not r.account_id:
            continue
        accounts[r.account_id] = {
            "account_id": r.account_id,
            "account_name": r.account_name,
            "brand": r.brand,
            "linked_contractor": None,
        }

    c_q = await db.execute(
        _select(Contractor.id, Contractor.name, Contractor.meta_account_id).where(
            Contractor.meta_account_id.isnot(None)
        )
    )
    for r in c_q.all():
        aid = r.meta_account_id
        if aid in accounts:
            accounts[aid]["linked_contractor"] = {"id": r.id, "name": r.name}
        else:
            accounts[aid] = {
                "account_id": aid,
                "account_name": None,
                "brand": None,
                "linked_contractor": {"id": r.id, "name": r.name},
            }

    return {
        "count": len(accounts),
        "accounts": sorted(accounts.values(), key=lambda a: (
            (a.get("linked_contractor") or {}).get("name") or a.get("account_name") or "",
        )),
    }


# ────────────────────────────────────────────────────────────────────────────
# Bulk validation — every I-BOS Meta account in one call.
# Loops through every contractor with a linked Meta account (excluding the
# CP training account act_144305066) and runs the same direct-Meta vs DB
# comparison for the given date range. Returns a summary table.
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/meta-validate-all",
    summary="Validate EVERY I-BOS Meta account against Meta Ads Manager in one call",
)
async def meta_validate_all(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Bulk data-integrity check. For every contractor with a linked Meta
    ad account (excluding the CP training account), runs the same
    comparison /meta-validate does: Meta direct /insights call vs our DB
    sums, plus period reach lookup.

    Returns a per-account summary row with match flags and a top-line
    count of pass/fail. Use this as the "proof for the presentation":
    one JSON showing every contractor matches Meta Ads Manager.
    """
    import asyncio as _aio
    import traceback as _tb
    from sqlalchemy import and_, func, select as _select
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.exceptions import FacebookRequestError
    from app.models.contractor import Contractor as _Ctr

    CP_TRAINING_ID = "act_144305066"
    HIDDEN = {"ARCHIVED", "DELETED"}

    # Every contractor with a Meta account, except CP training.
    c_q = await db.execute(
        _select(_Ctr.id, _Ctr.name, _Ctr.meta_account_id).where(and_(
            _Ctr.meta_account_id.isnot(None),
            _Ctr.meta_account_id != CP_TRAINING_ID,
        ))
    )
    targets = [
        {"contractor_id": r.id, "name": r.name, "account_id": r.meta_account_id}
        for r in c_q.all()
    ]

    if not targets:
        return {"error": "No contractors with linked Meta accounts found."}

    FacebookAdsApi.init(access_token=settings.META_ACCESS_TOKEN)

    def _meta_totals_blocking(acct_id: str) -> dict:
        acct_api = acct_id if acct_id.startswith("act_") else f"act_{acct_id}"
        ad_account = AdAccount(acct_api)
        visible_ids: list[str] = []
        try:
            for c in ad_account.get_campaigns(
                fields=["id", "effective_status"],
                params={"limit": 500},
            ):
                cid = c.get("id")
                st = c.get("effective_status") or ""
                if cid and st not in HIDDEN:
                    visible_ids.append(str(cid))
        except FacebookRequestError as e:
            return {"error": f"get_campaigns: {e.api_error_code()} {e.api_error_message()}"}

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
        try:
            rows = ad_account.get_insights(
                fields=["spend", "impressions", "clicks", "reach"],
                params=params,
            )
            for row in rows:
                return {
                    "spend": float(row.get("spend", 0) or 0),
                    "impressions": int(row.get("impressions", 0) or 0),
                    "clicks": int(row.get("clicks", 0) or 0),
                    "reach": int(row.get("reach", 0) or 0),
                }
            return {"spend": 0.0, "impressions": 0, "clicks": 0, "reach": 0}
        except FacebookRequestError as e:
            return {"error": f"get_insights: {e.api_error_code()} {e.api_error_message()}"}

    sem = _aio.Semaphore(5)

    async def _one(t: dict) -> dict:
        async with sem:
            aid = t["account_id"]
            # Meta direct
            try:
                meta_totals = await _aio.wait_for(
                    _aio.to_thread(_meta_totals_blocking, aid),
                    timeout=60,
                )
            except Exception as e:  # noqa: BLE001
                return {
                    **t,
                    "status": "meta_error",
                    "error": f"{type(e).__name__}: {e}",
                }
            if "error" in meta_totals:
                return {**t, "status": "meta_error", "error": meta_totals["error"]}

            # DB sums
            q = await db.execute(
                _select(
                    func.sum(MetaAdMetric.spend).label("spend"),
                    func.sum(MetaAdMetric.impressions).label("impressions"),
                    func.sum(MetaAdMetric.clicks).label("clicks"),
                    func.count(MetaAdMetric.id).label("n"),
                ).where(and_(
                    MetaAdMetric.account_id == aid,
                    MetaAdMetric.date >= date_from,
                    MetaAdMetric.date <= date_to,
                ))
            )
            r = q.first()
            db_sums = {
                "spend": float(r.spend or 0) if r else 0.0,
                "impressions": int(r.impressions or 0) if r else 0,
                "clicks": int(r.clicks or 0) if r else 0,
                "row_count": int(r.n or 0) if r else 0,
            }

            # Period reach (preset windows only)
            from app.models.metrics import MetaPeriodReach as _MPR
            preset = _match_preset_window(date_from, date_to)
            pr_val = None
            if preset:
                pr_q = await db.execute(
                    _select(_MPR.reach).where(and_(
                        _MPR.account_id == aid,
                        _MPR.preset_key == preset,
                    ))
                )
                row = pr_q.first()
                if row:
                    pr_val = int(row.reach or 0)

            def _m(a: float, b: float, tol: float = 0.01) -> bool:
                return abs(a - b) < tol

            matches = {
                "spend": _m(meta_totals["spend"], db_sums["spend"]),
                "impressions": _m(meta_totals["impressions"], db_sums["impressions"], tol=1),
                "clicks": _m(meta_totals["clicks"], db_sums["clicks"], tol=1),
                "reach": (_m(meta_totals["reach"], pr_val, tol=2) if pr_val is not None else None),
            }
            all_core_match = all(v is True for k, v in matches.items() if k != "reach")
            return {
                **t,
                "status": "ok",
                "meta": meta_totals,
                "db": db_sums,
                "period_reach": pr_val,
                "preset": preset,
                "match": matches,
                "all_core_match": all_core_match,
                "deltas": {
                    "spend": round(db_sums["spend"] - meta_totals["spend"], 2),
                    "impressions": db_sums["impressions"] - meta_totals["impressions"],
                    "clicks": db_sums["clicks"] - meta_totals["clicks"],
                    "reach": (pr_val - meta_totals["reach"]) if pr_val is not None else None,
                },
            }

    results = await _aio.gather(*[_one(t) for t in targets], return_exceptions=False)

    # Summary
    ok = [r for r in results if r.get("status") == "ok"]
    meta_errors = [r for r in results if r.get("status") == "meta_error"]
    passed = [r for r in ok if r.get("all_core_match")]
    failed = [r for r in ok if not r.get("all_core_match")]

    # Division audit (snapshot across full DB, not just this window)
    div_q = await db.execute(
        _select(
            MetaAdMetric.division,
            func.count(MetaAdMetric.id).label("n"),
            func.sum(MetaAdMetric.spend).label("spend"),
        ).group_by(MetaAdMetric.division)
    )
    by_division = [
        {"division": r.division, "rows": int(r.n or 0), "spend": round(float(r.spend or 0), 2)}
        for r in div_q.all()
    ]
    leak_a = await db.execute(
        _select(func.count(MetaAdMetric.id)).where(and_(
            MetaAdMetric.division == "cp",
            MetaAdMetric.account_id != CP_TRAINING_ID,
        ))
    )
    leak_b = await db.execute(
        _select(func.count(MetaAdMetric.id)).where(and_(
            MetaAdMetric.division == "ibos",
            MetaAdMetric.account_id == CP_TRAINING_ID,
        ))
    )
    la = int(leak_a.scalar() or 0)
    lb = int(leak_b.scalar() or 0)

    return {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "contractors_checked": len(targets),
        "passed_count": len(passed),
        "failed_count": len(failed),
        "meta_error_count": len(meta_errors),
        "all_clean": len(failed) == 0 and len(meta_errors) == 0 and la == 0 and lb == 0,
        "division_audit": {
            "by_division": by_division,
            "rows_tagged_cp_but_not_training": la,
            "rows_tagged_ibos_but_on_training": lb,
            "clean": la == 0 and lb == 0,
        },
        "results": sorted(results, key=lambda r: (
            0 if r.get("status") == "ok" and r.get("all_core_match") else
            1 if r.get("status") == "ok" else 2,
            r.get("name") or "",
        )),
        "conclusion": (
            f"✅ All {len(passed)}/{len(targets)} I-BOS contractors match Meta Ads Manager. "
            f"Zero CP/I-BOS leakage."
            if len(failed) == 0 and len(meta_errors) == 0 and la == 0 and lb == 0 else
            f"❌ {len(failed)} mismatched / {len(meta_errors)} Meta-error out of {len(targets)}. "
            f"See `results` for details."
        ),
    }


# ────────────────────────────────────────────────────────────────────────────
# Meta data-integrity validation — direct Meta call vs DB + division audit.
# Same logic as backend/scripts/validate_meta.py, exposed as HTTP so it can
# be triggered from the browser without shell access.
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/meta-validate",
    summary="Validate that the DB matches Meta Ads Manager for one account",
)
async def meta_validate(
    account_id: Optional[str] = Query(None, description="Meta ad account id (act_ or bare). Optional if ?contractor= is given."),
    contractor: Optional[str] = Query(None, description="Contractor name or slug (e.g. 'floor warriors'). Resolved to account_id via contractors table."),
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """One-shot integrity check for a Meta ad account.

    Runs the exact same two queries side-by-side:
    - Meta direct /insights call at level=account, filtered to visible
      (non-archived/deleted) campaigns — i.e. what Meta Ads Manager shows.
    - Our DB sums for the same (account_id, date_range).

    Returns per-metric match flags plus the division-leak audit counts.
    """
    # Outer catch so any unhandled exception lands in the JSON body with a
    # real stack trace instead of a generic 500 HTML page.
    import traceback as _tb
    try:
        return await _meta_validate_impl(
            account_id=account_id,
            contractor=contractor,
            date_from=date_from,
            date_to=date_to,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("meta-validate unhandled error")
        return {
            "error": True,
            "exception_type": type(e).__name__,
            "message": str(e),
            "traceback": _tb.format_exc(),
            "hint": "This is an unhandled server error — see traceback. "
                    "Paste the traceback back to Claude so it can diagnose.",
        }


async def _meta_validate_impl(
    *,
    account_id: Optional[str],
    contractor: Optional[str],
    date_from: date,
    date_to: date,
    db: AsyncSession,
) -> dict:
    import asyncio as _aio
    import time as _time
    from sqlalchemy import and_, func, select as _select, or_
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.exceptions import FacebookRequestError

    CP_TRAINING_ID = "act_144305066"
    HIDDEN = {"ARCHIVED", "DELETED"}

    # ── Resolve account_id from contractor name/slug if provided ─────────
    # Fuzzy match on contractors.name (case-insensitive substring) and on
    # contractors.id. Picks the first row whose meta_account_id is set.
    resolved_from_contractor: Optional[str] = None
    if not account_id and contractor:
        from app.models.contractor import Contractor as _Ctr
        needle = contractor.strip().lower()
        # Normalize by stripping non-alphanumerics for looser matching
        needle_norm = "".join(ch for ch in needle if ch.isalnum())
        c_q = await db.execute(
            _select(_Ctr.id, _Ctr.name, _Ctr.meta_account_id).where(
                _Ctr.meta_account_id.isnot(None)
            )
        )
        candidates = []
        for r in c_q.all():
            hay = (r.name or "").lower()
            hay_norm = "".join(ch for ch in hay if ch.isalnum())
            id_norm = "".join(ch for ch in (r.id or "").lower() if ch.isalnum())
            if needle in hay or needle_norm in hay_norm or needle_norm in id_norm:
                candidates.append((r.id, r.name, r.meta_account_id))
        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"No contractor matching '{contractor}' with a linked Meta "
                    f"account. Hit /api/dashboard/meta-accounts to see the list."
                ),
            )
        if len(candidates) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Multiple contractors matched '{contractor}': "
                    + ", ".join(f"{n} ({cid})" for cid, n, _ in candidates)
                    + ". Narrow the search string or pass account_id directly."
                ),
            )
        _, _, account_id = candidates[0]
        resolved_from_contractor = contractor

    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either ?account_id=act_... or ?contractor=<name>",
        )

    # ── Meta direct call (source of truth) — runs in a worker thread ─
    def _meta_blocking() -> dict:
        FacebookAdsApi.init(access_token=settings.META_ACCESS_TOKEN)
        acct_api = account_id if account_id.startswith("act_") else f"act_{account_id}"
        ad_account = AdAccount(acct_api)
        visible_ids: list[str] = []
        hidden_ids: list[str] = []
        try:
            for c in ad_account.get_campaigns(
                fields=["id", "name", "effective_status"],
                params={"limit": 500},
            ):
                cid = c.get("id")
                st = c.get("effective_status") or ""
                if not cid:
                    continue
                (hidden_ids if st in HIDDEN else visible_ids).append(str(cid))
        except FacebookRequestError as e:
            return {"error": f"get_campaigns: {e.api_error_code()} {e.api_error_message()}"}

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
        try:
            rows = ad_account.get_insights(
                fields=["spend", "impressions", "clicks", "reach"],
                params=params,
            )
            for row in rows:
                return {
                    "totals": {
                        "spend": float(row.get("spend", 0) or 0),
                        "impressions": int(row.get("impressions", 0) or 0),
                        "clicks": int(row.get("clicks", 0) or 0),
                        "reach": int(row.get("reach", 0) or 0),
                    },
                    "visible_campaigns": len(visible_ids),
                    "hidden_campaigns": len(hidden_ids),
                }
            return {
                "totals": {"spend": 0.0, "impressions": 0, "clicks": 0, "reach": 0},
                "visible_campaigns": len(visible_ids),
                "hidden_campaigns": len(hidden_ids),
            }
        except FacebookRequestError as e:
            return {"error": f"get_insights: {e.api_error_code()} {e.api_error_message()}"}

    try:
        meta_res = await _aio.wait_for(_aio.to_thread(_meta_blocking), timeout=60)
    except _aio.TimeoutError:
        meta_res = {"error": "Meta API call timed out after 60 seconds"}
    except Exception as e:  # noqa: BLE001
        meta_res = {"error": f"{type(e).__name__}: {e}"}

    # Meta errors are NOT fatal to the endpoint — return them in the JSON
    # body so the caller can see exactly what Meta said (e.g. permissions,
    # bad account id) without a 502 swallowing the detail.
    meta_failed = "error" in meta_res

    # ── DB sums ─
    q = await db.execute(
        _select(
            func.sum(MetaAdMetric.spend).label("spend"),
            func.sum(MetaAdMetric.impressions).label("impressions"),
            func.sum(MetaAdMetric.clicks).label("clicks"),
            func.count(MetaAdMetric.id).label("row_count"),
            func.min(MetaAdMetric.fetched_at).label("earliest"),
            func.max(MetaAdMetric.fetched_at).label("latest"),
        ).where(and_(
            MetaAdMetric.account_id == account_id,
            MetaAdMetric.date >= date_from,
            MetaAdMetric.date <= date_to,
        ))
    )
    row = q.first()
    db_stored = {
        "spend": float(row.spend or 0) if row else 0.0,
        "impressions": int(row.impressions or 0) if row else 0,
        "clicks": int(row.clicks or 0) if row else 0,
        "row_count": int(row.row_count or 0) if row else 0,
        "earliest_fetched": row.earliest.isoformat() if row and row.earliest else None,
        "latest_fetched": row.latest.isoformat() if row and row.latest else None,
    }

    # ── Period reach (from meta_period_reach when the window is a preset) ─
    from app.models.metrics import MetaPeriodReach as _MPR
    preset = _match_preset_window(date_from, date_to)
    pr_reach: Optional[int] = None
    pr_fetched = None
    if preset:
        pr_q = await db.execute(
            _select(_MPR.reach, _MPR.fetched_at).where(and_(
                _MPR.account_id == account_id,
                _MPR.preset_key == preset,
            ))
        )
        pr_row = pr_q.first()
        if pr_row:
            pr_reach = int(pr_row.reach or 0)
            pr_fetched = pr_row.fetched_at

    # ── Division-leak audit ─
    div_q = await db.execute(
        _select(
            MetaAdMetric.division,
            func.count(MetaAdMetric.id).label("n"),
            func.sum(MetaAdMetric.spend).label("spend"),
        ).group_by(MetaAdMetric.division)
    )
    by_division = [
        {"division": r.division, "rows": int(r.n or 0), "spend": round(float(r.spend or 0), 2)}
        for r in div_q.all()
    ]
    leak_a = await db.execute(
        _select(func.count(MetaAdMetric.id)).where(and_(
            MetaAdMetric.division == "cp",
            MetaAdMetric.account_id != CP_TRAINING_ID,
        ))
    )
    leak_b = await db.execute(
        _select(func.count(MetaAdMetric.id)).where(and_(
            MetaAdMetric.division == "ibos",
            MetaAdMetric.account_id == CP_TRAINING_ID,
        ))
    )
    leak_a_val = int(leak_a.scalar() or 0)
    leak_b_val = int(leak_b.scalar() or 0)
    leakage = {
        "by_division": by_division,
        "rows_tagged_cp_but_not_training": leak_a_val,
        "rows_tagged_ibos_but_on_training": leak_b_val,
        "clean": leak_a_val == 0 and leak_b_val == 0,
    }

    # ── Also look up what we think this account is (brand_assets + contractors) ─
    from app.models.brand_asset import BrandAsset
    from app.models.contractor import Contractor
    ba_q = await db.execute(
        _select(BrandAsset.account_name, BrandAsset.brand, BrandAsset.platform).where(
            BrandAsset.account_id == account_id
        )
    )
    ba_rows = [
        {"account_name": r.account_name, "brand": r.brand, "platform": r.platform}
        for r in ba_q.all()
    ]
    c_q = await db.execute(
        _select(Contractor.id, Contractor.name).where(
            Contractor.meta_account_id == account_id
        )
    )
    linked_contractors = [
        {"contractor_id": r.id, "name": r.name} for r in c_q.all()
    ]

    # ── Side-by-side match (only if Meta call succeeded) ─
    if meta_failed:
        return {
            "account_id": account_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "meta_live_source_of_truth": meta_res,
            "i_dash_db": db_stored,
            "brand_asset_lookup": ba_rows,
            "linked_contractors": linked_contractors,
            "division_audit": leakage,
            "conclusion": (
                f"❌ Meta direct call failed — cannot compare. "
                f"Error: {meta_res.get('error')}"
            ),
            "hint": (
                "Check that this account_id is correct and that "
                "META_ACCESS_TOKEN has permission for it. Use "
                "brand_asset_lookup + linked_contractors to see what "
                "the DB thinks this account is."
            ),
        }

    m = meta_res["totals"]
    def _match(meta_v: float, db_v: float, tol: float = 0.01) -> dict:
        return {
            "meta": meta_v,
            "db": db_v,
            "delta": round(db_v - meta_v, 2),
            "match": abs(db_v - meta_v) < tol,
        }

    comparison = {
        "spend": _match(m["spend"], db_stored["spend"]),
        "impressions": _match(m["impressions"], float(db_stored["impressions"]), tol=1),
        "clicks": _match(m["clicks"], float(db_stored["clicks"]), tol=1),
    }
    if pr_reach is not None:
        comparison["reach"] = _match(m["reach"], float(pr_reach), tol=2)
        comparison["reach"]["source"] = f"meta_period_reach preset={preset}"
        comparison["reach"]["fetched_at"] = pr_fetched.isoformat() if pr_fetched else None
    else:
        comparison["reach"] = {
            "meta": m["reach"],
            "db": None,
            "match": None,
            "note": "no preset matches this window — period reach not pre-computed",
        }

    all_match = all(c.get("match") is True for k, c in comparison.items() if k != "reach")
    return {
        "account_id": account_id,
        "resolved_from_contractor": resolved_from_contractor,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "meta_live_source_of_truth": meta_res,
        "i_dash_db": db_stored,
        "brand_asset_lookup": ba_rows,
        "linked_contractors": linked_contractors,
        "comparison": comparison,
        "spend_impressions_clicks_match": all_match,
        "division_audit": leakage,
        "conclusion": (
            "✅ DB matches Meta Ads Manager for this account+range."
            if all_match and leakage["clean"] else
            "❌ Mismatch — see comparison and division_audit."
        ),
    }


# ────────────────────────────────────────────────────────────────────────────
# Meta reconciliation debug — what's in the DB vs what Meta's API returns
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/meta-reconcile",
    summary="Debug: show stored vs Meta-live totals for one account + date range",
)
async def meta_reconcile(
    account_id: str = Query(..., description="Meta ad account id (act_ or bare)"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """For a single Meta ad account + date window, return three things:

    1. ``stored`` — what's currently summed from our DB (the numbers the
       contractor card shows).
    2. ``meta_live`` — what Meta's API returns right now with the exact
       same campaign whitelist (archived/deleted excluded), one API call
       at level=account.
    3. ``campaigns`` — the campaign list with their effective_status so
       you can see which ones Meta's UI is hiding by default.

    Use this when dashboard totals drift from Meta Ads Manager to see
    whether the gap is in (a) the pipeline ingesting extra campaigns,
    (b) stale rows that weren't re-deleted, or (c) the Meta API itself.
    """
    import asyncio
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.exceptions import FacebookRequestError

    # 1. Stored totals — mirror the contractor-breakdown aggregation
    acct_for_db = account_id
    stored_q = await db.execute(
        select(
            func.sum(MetaAdMetric.spend).label("spend"),
            func.sum(MetaAdMetric.impressions).label("impressions"),
            func.sum(MetaAdMetric.reach).label("reach_sum"),
            func.sum(MetaAdMetric.clicks).label("clicks"),
            func.count(MetaAdMetric.id).label("row_count"),
            func.min(MetaAdMetric.fetched_at).label("earliest_fetched"),
            func.max(MetaAdMetric.fetched_at).label("latest_fetched"),
        ).where(and_(
            MetaAdMetric.account_id == acct_for_db,
            MetaAdMetric.date >= date_from,
            MetaAdMetric.date <= date_to,
        ))
    )
    stored_row = stored_q.first()

    # Per-campaign breakdown of what's in the DB for this window
    stored_campaigns_q = await db.execute(
        select(
            MetaAdMetric.campaign_id,
            MetaAdMetric.campaign_name,
            func.sum(MetaAdMetric.spend).label("spend"),
            func.sum(MetaAdMetric.impressions).label("impressions"),
        ).where(and_(
            MetaAdMetric.account_id == acct_for_db,
            MetaAdMetric.date >= date_from,
            MetaAdMetric.date <= date_to,
        )).group_by(MetaAdMetric.campaign_id, MetaAdMetric.campaign_name)
        .order_by(func.sum(MetaAdMetric.spend).desc())
    )
    stored_campaigns = [
        {
            "campaign_id": r.campaign_id,
            "campaign_name": r.campaign_name,
            "spend": round(float(r.spend or 0), 2),
            "impressions": int(r.impressions or 0),
        }
        for r in stored_campaigns_q.all()
    ]

    # 2/3. Live Meta call
    FacebookAdsApi.init(access_token=settings.META_ACCESS_TOKEN)
    acct_id_api = account_id if account_id.startswith("act_") else f"act_{account_id}"
    ad_account = AdAccount(acct_id_api)
    HIDDEN_STATUSES = {"ARCHIVED", "DELETED"}

    def _blocking_live() -> dict:
        # List all campaigns + statuses
        campaigns_live = []
        visible_ids: list[str] = []
        try:
            campaigns = ad_account.get_campaigns(
                fields=["id", "name", "effective_status"],
                params={"limit": 500},
            )
            for c in campaigns:
                cid = str(c.get("id") or "")
                cname = c.get("name") or ""
                cstatus = c.get("effective_status") or ""
                campaigns_live.append({
                    "campaign_id": cid,
                    "campaign_name": cname,
                    "effective_status": cstatus,
                    "visible_by_default": cstatus not in HIDDEN_STATUSES,
                })
                if cstatus not in HIDDEN_STATUSES and cid:
                    visible_ids.append(cid)
        except FacebookRequestError as e:
            return {
                "error": f"get_campaigns failed: code={e.api_error_code()} msg={e.api_error_message()}",
                "campaigns_live": [],
                "visible_ids": [],
                "totals_all": None,
                "totals_visible": None,
            }

        # Unfiltered totals (all campaigns including archived)
        totals_all = None
        try:
            rows = ad_account.get_insights(
                fields=["spend", "impressions", "reach", "clicks"],
                params={
                    "time_range": {
                        "since": date_from.isoformat(),
                        "until": date_to.isoformat(),
                    },
                    "level": "account",
                    "limit": 1,
                },
            )
            for row in rows:
                totals_all = {
                    "spend": round(float(row.get("spend", 0) or 0), 2),
                    "impressions": int(row.get("impressions", 0) or 0),
                    "reach": int(row.get("reach", 0) or 0),
                    "clicks": int(row.get("clicks", 0) or 0),
                }
                break
        except FacebookRequestError as e:
            totals_all = {"error": f"{e.api_error_code()}: {e.api_error_message()}"}

        # Filtered totals (visible-only, matches Meta UI default)
        totals_visible = None
        if visible_ids:
            try:
                rows = ad_account.get_insights(
                    fields=["spend", "impressions", "reach", "clicks"],
                    params={
                        "time_range": {
                            "since": date_from.isoformat(),
                            "until": date_to.isoformat(),
                        },
                        "level": "account",
                        "limit": 1,
                        "filtering": [{
                            "field": "campaign.id",
                            "operator": "IN",
                            "value": visible_ids,
                        }],
                    },
                )
                for row in rows:
                    totals_visible = {
                        "spend": round(float(row.get("spend", 0) or 0), 2),
                        "impressions": int(row.get("impressions", 0) or 0),
                        "reach": int(row.get("reach", 0) or 0),
                        "clicks": int(row.get("clicks", 0) or 0),
                    }
                    break
            except FacebookRequestError as e:
                totals_visible = {"error": f"{e.api_error_code()}: {e.api_error_message()}"}

        return {
            "campaigns_live": campaigns_live,
            "visible_ids": visible_ids,
            "hidden_count": sum(1 for c in campaigns_live if not c["visible_by_default"]),
            "totals_all": totals_all,
            "totals_visible": totals_visible,
        }

    live = await asyncio.wait_for(asyncio.to_thread(_blocking_live), timeout=60)

    return {
        "account_id": account_id,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "stored": {
            "spend": round(float(stored_row.spend or 0), 2) if stored_row else 0,
            "impressions": int(stored_row.impressions or 0) if stored_row else 0,
            "reach_sum_of_campaigns": int(stored_row.reach_sum or 0) if stored_row else 0,
            "clicks": int(stored_row.clicks or 0) if stored_row else 0,
            "row_count": int(stored_row.row_count or 0) if stored_row else 0,
            "earliest_fetched": stored_row.earliest_fetched.isoformat() if stored_row and stored_row.earliest_fetched else None,
            "latest_fetched": stored_row.latest_fetched.isoformat() if stored_row and stored_row.latest_fetched else None,
        },
        "stored_campaigns": stored_campaigns,
        "meta_live": live,
    }


# ────────────────────────────────────────────────────────────────────────────
# All Contractors Revenue — QuickBooks-wide view (active + inactive)
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/all-contractors-revenue",
    summary="Complete QB revenue view — active + inactive contractors, split and ranked",
)
async def get_all_contractors_revenue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    top_n: int = Query(10, description="Top-N to return for each category"),
) -> dict:
    """
    Surface every QuickBooks contractor revenue record — both active I-BOS
    contractors and non-active/past buyers — for executive reporting.

    Classification rule (per QB naming convention):
      - Active contractors: match an entry in the contractors table (by name
        or the QB_NAME_ALIASES map). Usually have company names.
      - Non-active: personal-name-only entries in the QB sheet with no match.

    Returns per-category totals, counts, and top-N lists. Use for the
    "Revenue" tab on the Contractor Breakdown page and Executive Summary
    scorecards.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # Pull QB revenue grouped by contractor name for the date range
    qb_q = await db.execute(
        select(
            GoogleSheetMetric.metric_name,
            func.sum(GoogleSheetMetric.metric_value).label("revenue"),
        ).where(and_(
            GoogleSheetMetric.sheet_name.like("qb_revenue::%"),
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
        )).group_by(GoogleSheetMetric.metric_name)
    )
    qb_rows = qb_q.all()

    # Load active contractor names + aliases
    from app.models.contractor import Contractor as ContractorModel
    active_q = await db.execute(
        select(ContractorModel.id, ContractorModel.name)
        .where(ContractorModel.active == True, ContractorModel.division != "cp")
    )
    active_rows = active_q.all()

    def _nrm(s: str) -> str:
        if not s:
            return ""
        s = s.lower()
        for tok in ("llc", "inc.", "inc", ".com", ".co"):
            s = s.replace(tok, "")
        return "".join(ch for ch in s if ch.isalnum())

    active_name_map = {_nrm(n): cid for cid, n in active_rows}
    active_display_names = {cid: n for cid, n in active_rows}

    # QB aliases for ad-account names that differ from QB names
    QB_NAME_ALIASES = {
        "schmidt custom flooring": "scf concrete promo",
    }

    def _classify(qb_name: str) -> tuple[str, Optional[str], Optional[str]]:
        """Return (kind, matched_contractor_id, display_name). kind=active|inactive."""
        raw = (qb_name or "").strip()
        if not raw:
            return "inactive", None, raw
        n = _nrm(raw)
        # Exact or substring match against active contractors
        if n in active_name_map:
            cid = active_name_map[n]
            return "active", cid, active_display_names[cid]
        for active_norm, cid in active_name_map.items():
            if not active_norm:
                continue
            if (len(active_norm) >= 4 and active_norm in n) or (len(n) >= 4 and n in active_norm):
                return "active", cid, active_display_names[cid]
        # Check aliases (reverse lookup)
        alias_target = QB_NAME_ALIASES.get(raw.lower())
        if alias_target:
            alias_norm = _nrm(alias_target)
            if alias_norm in active_name_map:
                cid = active_name_map[alias_norm]
                return "active", cid, active_display_names[cid]
        # Heuristic: if the name contains a comma (LastName, FirstName), it's a personal name = inactive
        # If it looks like a company (has words like "concrete", "coatings", "flooring", "inc", "llc"), it's still inactive if not matched
        return "inactive", None, raw.title()

    # Skip aggregate/summary rows that aren't real contractors
    def _is_aggregate_row(name: str) -> bool:
        n = (name or "").strip().lower()
        if not n:
            return True
        aggregate_keywords = (
            "total", "grand total", "subtotal", "sum of",
            "net income", "gross profit", "n/a",
        )
        # Exact match or starts-with for short aggregate names
        if n in aggregate_keywords:
            return True
        # Only treat as aggregate if the full name IS an aggregate term
        # (not if the name happens to contain the word, e.g. "Grand Coatings")
        return False

    # Aggregate: for each classified entry, accumulate revenue. Merge QB entries
    # that map to the same active contractor (e.g. multiple rows for Tailored).
    active_agg: Dict[str, Dict[str, Any]] = {}
    inactive_agg: Dict[str, Dict[str, Any]] = {}
    for qb_name, rev in qb_rows:
        rev_f = float(rev or 0)
        if rev_f <= 0:
            continue
        if _is_aggregate_row(qb_name):
            continue
        kind, cid, display = _classify(qb_name)
        bucket = active_agg if kind == "active" else inactive_agg
        key = cid or display
        if key in bucket:
            bucket[key]["revenue"] += rev_f
        else:
            bucket[key] = {
                "id": cid or key,
                "name": display,
                "revenue": rev_f,
                "kind": kind,
            }

    active_list = sorted(active_agg.values(), key=lambda r: r["revenue"], reverse=True)
    inactive_list = sorted(inactive_agg.values(), key=lambda r: r["revenue"], reverse=True)

    active_total = sum(r["revenue"] for r in active_list)
    inactive_total = sum(r["revenue"] for r in inactive_list)
    grand_total = active_total + inactive_total

    # Round for display
    for r in active_list + inactive_list:
        r["revenue"] = round(r["revenue"], 2)

    all_list = sorted(active_list + inactive_list, key=lambda r: r["revenue"], reverse=True)

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "grand_total": round(grand_total, 2),
        "active_total": round(active_total, 2),
        "inactive_total": round(inactive_total, 2),
        "active_count": len(active_list),
        "inactive_count": len(inactive_list),
        "active_pct": round((active_total / grand_total * 100), 1) if grand_total else 0,
        "inactive_pct": round((inactive_total / grand_total * 100), 1) if grand_total else 0,
        "top_active": active_list[:top_n],
        "top_inactive": inactive_list[:top_n],
        "top_all": all_list[:top_n],
    }


# ────────────────────────────────────────────────────────────────────────────
# Retail Breakdown — Google Sheets (Sani-Tred Order Export)
# ────────────────────────────────────────────────────────────────────────────

@router.get(
    "/retail",
    summary="Get retail metrics from Google Sheets pipeline with live-data detection",
    responses={
        200: {"description": "Retail metrics with hasLiveData flag"},
        401: {"description": "Unauthorized"},
    },
)
async def get_retail_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    division: str = Query("sanitred", description="Division slug: sanitred"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
) -> dict:
    """
    Return retail data from the Google Sheets pipeline for a division.

    Follows the same hasLiveData pattern as /marketing and /web-analytics:
    - ``hasLiveData: true`` when the google_sheets pipeline has run and
      Revenue-category metrics exist for the date range.
    - ``hasLiveData: false`` when no pipeline has run or no retail data found.

    The frontend uses this to flip from amber "Estimated" to green "Live" banner.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Check if google_sheets pipeline has ever run ──────────────
    pipeline_ran = await _has_pipeline_run(
        db, "google_sheets", "google_sheets_pipeline",
    )

    if not pipeline_ran:
        from app.api.pipelines import _running_pipelines
        for pname in ("google_sheets", "google_sheets_pipeline"):
            info = _running_pipelines.get(pname, {})
            if info.get("status") in ("success", "completed"):
                pipeline_ran = True
                break

    if not pipeline_ran:
        return {
            "division": division,
            "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
            "hasLiveData": False,
            "scorecards": {},
            "channelRevenue": [],
            "topProducts": [],
            "monthlyMetrics": [],
        }

    # ── 2. Aggregate revenue scorecards ──────────────────────────────
    revenue_stmt = select(
        func.sum(GoogleSheetMetric.metric_value).label("total_value"),
        func.count(GoogleSheetMetric.id).label("row_count"),
    ).where(
        and_(
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
            GoogleSheetMetric.category == "Revenue",
        )
    )
    revenue_result = await db.execute(revenue_stmt)
    rev = revenue_result.first()
    total_revenue = float(rev[0] or 0)
    has_data = (rev[1] or 0) > 0

    # ── 3. Order count & AOV ─────────────────────────────────────────
    order_stmt = select(
        func.sum(GoogleSheetMetric.metric_value).label("total_orders"),
    ).where(
        and_(
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
            GoogleSheetMetric.metric_name.ilike("%order%"),
        )
    )
    order_result = await db.execute(order_stmt)
    total_orders = float((await db.execute(order_stmt)).first()[0] or 0)
    avg_order_value = (total_revenue / total_orders) if total_orders > 0 else 0

    # ── 4. Monthly time series ───────────────────────────────────────
    monthly_stmt = select(
        func.date_trunc("month", GoogleSheetMetric.date).label("month"),
        GoogleSheetMetric.metric_name,
        func.sum(GoogleSheetMetric.metric_value).label("value"),
    ).where(
        and_(
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
        )
    ).group_by("month", GoogleSheetMetric.metric_name).order_by("month")

    monthly_result = await db.execute(monthly_stmt)
    monthly_map: dict = {}
    for row in monthly_result.all():
        m = row[0].strftime("%b %Y") if row[0] else "Unknown"
        monthly_map.setdefault(m, {"month": m})
        metric_key = (row[1] or "unknown").lower().replace(" ", "_")
        monthly_map[m][metric_key] = float(row[2] or 0)

    monthly_metrics = list(monthly_map.values())

    # ── 5. Top products (by metric_name containing product info) ─────
    product_stmt = select(
        GoogleSheetMetric.metric_name,
        func.sum(GoogleSheetMetric.metric_value).label("total"),
    ).where(
        and_(
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
            GoogleSheetMetric.category == "Revenue",
        )
    ).group_by(GoogleSheetMetric.metric_name).order_by(
        func.sum(GoogleSheetMetric.metric_value).desc()
    ).limit(10)

    product_result = await db.execute(product_stmt)
    top_products = [
        {"name": row[0], "revenue": float(row[1] or 0)}
        for row in product_result.all()
    ]

    # ── 6. Channel breakdown (by sheet_name as proxy for channel) ────
    channel_stmt = select(
        GoogleSheetMetric.sheet_name,
        func.sum(GoogleSheetMetric.metric_value).label("revenue"),
    ).where(
        and_(
            GoogleSheetMetric.date >= start_date,
            GoogleSheetMetric.date <= end_date,
            GoogleSheetMetric.category == "Revenue",
        )
    ).group_by(GoogleSheetMetric.sheet_name)

    channel_result = await db.execute(channel_stmt)
    channel_revenue = [
        {"channel": row[0], "revenue": float(row[1] or 0)}
        for row in channel_result.all()
    ]

    logger.info(
        "Retail data for %s: revenue=$%.2f, orders=%.0f, products=%d, hasLive=%s",
        division, total_revenue, total_orders, len(top_products), has_data or pipeline_ran,
    )

    return {
        "division": division,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "hasLiveData": True,
        "scorecards": {
            "totalRevenue": total_revenue,
            "totalOrders": int(total_orders),
            "avgOrderValue": round(avg_order_value, 2),
        },
        "channelRevenue": channel_revenue,
        "topProducts": top_products,
        "monthlyMetrics": monthly_metrics,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Executive Summary — top-level landing page aggregate
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/executive-summary",
    summary="Executive Summary — live cross-division KPIs, quarterly table, pipeline status",
)
async def get_executive_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """
    Aggregate every live metric source into a single payload for the
    Executive Summary landing page. Pulls:

      - Quarterly KPI table from the ``exec::TCP MAIN`` pivot tab
        (produced by the enhanced google_sheets pipeline).
      - Scorecards derived from the latest quarter + combined ad spend
        (meta_ad_metrics + google_ad_metrics) across the selected range.
      - Division revenue breakdown (CP / Sani-Tred / I-BOS) summed
        across every quarter present in the TCP MAIN tab.
      - YOY comparison series (current vs previous year).
      - Pipeline status: which sources are live, last sync, record counts.

    No hardcoded numbers anywhere. If a sheet row is missing, it returns
    ``null`` rather than guessing — the frontend renders an em-dash.
    """
    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Pull every cell from the pivot-layout TCP MAIN tab ─────────
    # sheet_name is 'exec::TCP MAIN' (or similar exec:: prefix) per the
    # pivot transform in google_sheets.py.
    pivot_stmt = (
        select(
            GoogleSheetMetric.metric_name,
            GoogleSheetMetric.date,
            GoogleSheetMetric.metric_value,
        )
        .where(GoogleSheetMetric.sheet_name.like("exec::%"))
        .order_by(GoogleSheetMetric.date, GoogleSheetMetric.metric_name)
    )
    pivot_rows = (await db.execute(pivot_stmt)).all()

    # Build a two-level dict: {metric_name: {quarter_label: value}}
    #   quarter_label = "Q1 2025" / "Q2 2025" / ...
    def _quarter_label(d: date) -> str:
        return f"Q{((d.month - 1) // 3) + 1} {d.year}"

    quarterly_table: dict = {}
    quarter_order: list = []  # preserved insertion order of quarter labels
    quarter_seen = set()
    for metric_name, d, value in pivot_rows:
        ql = _quarter_label(d)
        if ql not in quarter_seen:
            quarter_order.append(ql)
            quarter_seen.add(ql)
        quarterly_table.setdefault(metric_name, {})[ql] = float(value or 0)

    # Sort quarters chronologically (Q1 2025 < Q2 2025 < ...)
    def _q_sort_key(label: str) -> tuple:
        # label = "Q<n> <YYYY>"
        try:
            q, y = label.split(" ")
            return (int(y), int(q.lstrip("Q")))
        except Exception:
            return (9999, 9)

    quarter_order.sort(key=_q_sort_key)

    # ── 2. Current-quarter scorecards ─────────────────────────────────
    latest_quarter = quarter_order[-1] if quarter_order else None
    prev_quarter = quarter_order[-2] if len(quarter_order) >= 2 else None

    def _cell(metric: str, q: Optional[str]) -> Optional[float]:
        if not q or metric not in quarterly_table:
            return None
        v = quarterly_table[metric].get(q)
        return None if v is None else float(v)

    def _pct_change(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
        if cur is None or prev in (None, 0):
            return None
        try:
            return round(((cur - prev) / abs(prev)) * 100, 1)
        except ZeroDivisionError:
            return None

    total_revenue_cur = _cell("Total Revenue", latest_quarter)
    total_revenue_prev = _cell("Total Revenue", prev_quarter)
    contractor_rev_cur = _cell("Contractor Revenue", latest_quarter)
    retail_sales_cur = _cell("Retail Sales", latest_quarter)
    equipment_sold_cur = _cell("Equipment Sold", latest_quarter)
    equipment_sold_prev = _cell("Equipment Sold", prev_quarter)
    marketing_leads_cur = _cell("Marketing Leads", latest_quarter)
    marketing_leads_prev = _cell("Marketing Leads", prev_quarter)
    marketing_spend_sheet_cur = _cell("Marketing Spend", latest_quarter)

    # Live marketing spend from ads pipelines (may exceed sheet value — use live if present)
    ads_spend_q = await db.execute(
        select(
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
        ).where(and_(MetaAdMetric.date >= start_date, MetaAdMetric.date <= end_date))
    )
    meta_spend, meta_leads = ads_spend_q.one()
    gads_spend_q = await db.execute(
        select(
            func.coalesce(func.sum(GoogleAdMetric.spend), 0),
            func.coalesce(func.sum(GoogleAdMetric.conversions), 0),
        ).where(and_(GoogleAdMetric.date >= start_date, GoogleAdMetric.date <= end_date))
    )
    gads_spend, gads_leads = gads_spend_q.one()
    live_ads_spend = float(meta_spend or 0) + float(gads_spend or 0)
    live_ads_leads = float(meta_leads or 0) + float(gads_leads or 0)

    # Combined total revenue = sum across every quarter in the sheet
    combined_total_revenue = sum(
        (quarterly_table.get("Total Revenue", {}).get(q, 0) or 0)
        for q in quarter_order
    )
    # Equipment Sold = sum of all units sold across quarters (YTD)
    equipment_sold_total = sum(
        (quarterly_table.get("Equipment Sold", {}).get(q, 0) or 0)
        for q in quarter_order
    )

    # Marketing Spend/Leads are live from the ads pipelines and are
    # already filtered by the requested date range. Do NOT fall back
    # to the latest-quarter sheet value when live = 0 — that leaks
    # pre-period numbers into narrow windows ("today" with no ads
    # would show last quarter's total).
    scorecards = [
        {
            "label": "Combined Total Revenue",
            "value": round(combined_total_revenue, 2),
            "change": _pct_change(total_revenue_cur, total_revenue_prev),
            "format": "currency",
            "source": "Google Sheets · TCP MAIN",
        },
        {
            "label": "Marketing Spend",
            "value": round(live_ads_spend or 0, 2),
            "change": _pct_change(live_ads_spend, marketing_spend_sheet_cur),
            "format": "currency",
            "source": "Meta + Google Ads (live)",
        },
        {
            "label": "Marketing Leads",
            "value": int(live_ads_leads or 0),
            "change": _pct_change(marketing_leads_cur, marketing_leads_prev),
            "format": "number",
            "source": "Ads pipelines",
        },
        {
            "label": "Equipment Sold",
            "value": int(equipment_sold_total or 0),
            "change": _pct_change(equipment_sold_cur, equipment_sold_prev),
            "format": "number",
            "source": "Google Sheets · TCP MAIN",
        },
    ]

    # ── 3. Division revenue breakdown (summed across all quarters) ────
    # CP derived = Total Revenue − Contractor Revenue − Retail Sales
    total_rev_sum = sum(
        (quarterly_table.get("Total Revenue", {}).get(q, 0) or 0) for q in quarter_order
    )
    contractor_rev_sum = sum(
        (quarterly_table.get("Contractor Revenue", {}).get(q, 0) or 0) for q in quarter_order
    )
    retail_sum = sum(
        (quarterly_table.get("Retail Sales", {}).get(q, 0) or 0) for q in quarter_order
    )
    cp_derived = max(0.0, total_rev_sum - contractor_rev_sum - retail_sum)
    division_revenue = {
        "cp": round(cp_derived, 2),
        "sanitred": round(retail_sum, 2),
        "ibos": round(contractor_rev_sum, 2),
    }

    # ── 4. Revenue by quarter chart series ────────────────────────────
    revenue_by_quarter = []
    for q in quarter_order:
        total = quarterly_table.get("Total Revenue", {}).get(q, 0) or 0
        contractor = quarterly_table.get("Contractor Revenue", {}).get(q, 0) or 0
        retail = quarterly_table.get("Retail Sales", {}).get(q, 0) or 0
        cp = max(0.0, total - contractor - retail)
        revenue_by_quarter.append({
            "quarter": q,
            "cp": round(cp, 2),
            "retail": round(retail, 2),
            "contractor": round(contractor, 2),
            "total": round(total, 2),
        })

    # ── 5. YOY series — pair each 2025 quarter with the 2026 quarter ──
    yoy_sales = []
    for q_num in (1, 2, 3, 4):
        prev_label = f"Q{q_num} 2025"
        cur_label = f"Q{q_num} 2026"
        prev_val = quarterly_table.get("Total Revenue", {}).get(prev_label)
        cur_val = quarterly_table.get("Total Revenue", {}).get(cur_label)
        yoy_sales.append({
            "month": f"Q{q_num}",
            "previous": round(float(prev_val), 2) if prev_val is not None else None,
            "current": round(float(cur_val), 2) if cur_val is not None else None,
        })

    # ── 6. Quarterly KPI table — preserve metric order as written in sheet ──
    quarterly_rows = []
    # Preserve the order metrics first appeared in pivot_rows
    seen_metrics = []
    seen_set = set()
    for metric_name, _d, _v in pivot_rows:
        if metric_name not in seen_set:
            seen_metrics.append(metric_name)
            seen_set.add(metric_name)
    for metric in seen_metrics:
        row: dict = {"metric": metric}
        for q in quarter_order:
            row[q] = quarterly_table.get(metric, {}).get(q)
        quarterly_rows.append(row)

    # ── 7. Pipeline status ────────────────────────────────────────────
    pipeline_status = []
    for pname, label in [
        ("google_sheets", "Google Sheets"),
        ("meta_ads", "Meta Ads"),
        ("google_ads", "Google Ads"),
        ("google_analytics", "Google Analytics (GA4)"),
        ("hubspot", "HubSpot CRM"),
        ("snapshot", "Snapshot Aggregator"),
    ]:
        last_log = await db.execute(
            select(PipelineLog)
            .where(PipelineLog.pipeline_name.in_([pname, f"{pname}_pipeline"]))
            .order_by(PipelineLog.started_at.desc())
            .limit(1)
        )
        log = last_log.scalar_one_or_none()
        pipeline_status.append({
            "name": pname,
            "label": label,
            "status": (
                "live" if log and log.status == PipelineStatus.SUCCESS
                else "failed" if log and log.status == PipelineStatus.FAILED
                else "pending"
            ),
            "last_run": log.started_at.isoformat() if log and log.started_at else None,
            "records": log.records_fetched if log else 0,
        })

    # ── 8. QB Revenue scorecards (active + inactive contractors) ─────
    try:
        qb_summary = await get_all_contractors_revenue(
            db=db, current_user=current_user,
            date_from=date_from, date_to=date_to, top_n=5,
        )
    except Exception as exc:
        logger.warning("Executive summary: QB revenue fetch failed: %s", exc)
        qb_summary = None

    # ── 8b. Rebuild Combined Total Revenue from live sources ──────────
    # TCP MAIN sheet Total Revenue cells may be empty. Fall back to:
    #   Combined = QB Contractor Revenue + Sani-Tred retail + CP Shopify retail
    # CP Shopify retail — always compute so it can surface on the dashboard
    shopify_total = 0.0
    shopify_orders = 0
    try:
        from app.models.metrics import ShopifyOrder as _SO
        sh_q = await db.execute(
            select(
                func.coalesce(func.sum(_SO.total), 0),
                func.count(_SO.id),
            ).where(and_(
                _SO.date_created >= start_date,
                _SO.date_created <= end_date,
            ))
        )
        sh_row = sh_q.one_or_none()
        if sh_row:
            shopify_total = float(sh_row[0] or 0)
            shopify_orders = int(sh_row[1] or 0)
    except Exception as exc:
        logger.warning("Executive summary: Shopify retail query failed: %s", exc)

    # Sani-Tred retail — two sources:
    #   (a) WooCommerce orders for the selected window (current / post-2026)
    #   (b) Historical retail:: sheet rows (pre-2026 archive)
    # Previously we only read (b), which is gated to pre-2026-01-01 at
    # extract time. That left the fallback at $0 whenever a live-period
    # demo hit a fresh env where TCP MAIN hadn't synced yet.
    wc_retail_total = 0.0
    try:
        from app.models.metrics import WCOrder, SUCCESSFUL_WC_STATUSES
        wc_q = await db.execute(
            select(func.coalesce(func.sum(WCOrder.total), 0))
            .where(and_(
                WCOrder.date_created >= start_date,
                WCOrder.date_created <= end_date,
                WCOrder.division == "sanitred",
                WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
                WCOrder.total > 0,
            ))
        )
        wc_retail_total = float(wc_q.scalar() or 0)
    except Exception as exc:
        logger.warning("Executive summary: WooCommerce retail query failed: %s", exc)

    sheet_retail_total = 0.0
    try:
        retail_q = await db.execute(
            select(func.sum(GoogleSheetMetric.metric_value))
            .where(and_(
                GoogleSheetMetric.sheet_name.like("retail::%"),
                GoogleSheetMetric.category == "Revenue",
                GoogleSheetMetric.date >= start_date,
                GoogleSheetMetric.date <= end_date,
            ))
        )
        sheet_retail_total = float(retail_q.scalar() or 0)
    except Exception:
        pass

    qb_total = float((qb_summary or {}).get("grand_total") or 0)
    retail_total = wc_retail_total if wc_retail_total > 0 else sheet_retail_total
    live_combined = qb_total + retail_total + shopify_total

    # Fire the live-composition fallback whenever TCP MAIN hasn't given
    # us a usable number AND at least one live source has data. Prior
    # logic required QB to be populated, which masked valid Shopify /
    # WC-only windows with a stale $0.
    if (
        scorecards
        and scorecards[0].get("label") == "Combined Total Revenue"
        and not scorecards[0].get("value")
        and live_combined > 0
    ):
        scorecards[0]["value"] = round(live_combined, 2)
        parts = []
        if qb_total > 0:
            parts.append("QB contractor")
        if retail_total > 0:
            parts.append("Sani-Tred retail")
        if shopify_total > 0:
            parts.append("CP Shopify")
        scorecards[0]["source"] = " + ".join(parts) + " (live)" if parts else "Live sources"

    # Equipment Sold: only the TCP MAIN sheet tracks this. If the pivot
    # is empty there's no live equivalent, so render an em-dash ("—")
    # rather than a misleading 0. Frontend treats null as "no data".
    if (
        scorecards
        and len(scorecards) >= 4
        and scorecards[3].get("label") == "Equipment Sold"
        and not scorecards[3].get("value")
        and not quarter_order
    ):
        scorecards[3]["value"] = None
        scorecards[3]["source"] = "Awaiting Google Sheets sync"

    # ── 8c. CP Store (Shopify) daily revenue series ──────────────────
    # Feeds a small area chart on the Executive Summary so CP Store has
    # visual parity with the division bars. Additive — nothing else
    # depends on this field. Empty list if Shopify has no rows.
    cp_shopify_daily: list = []
    try:
        from app.models.metrics import ShopifyOrder as _SO2
        daily_q = await db.execute(
            select(
                _SO2.date_created,
                func.coalesce(func.sum(_SO2.total), 0),
                func.count(_SO2.id),
            )
            .where(and_(
                _SO2.date_created >= start_date,
                _SO2.date_created <= end_date,
                _SO2.date_created.isnot(None),
            ))
            .group_by(_SO2.date_created)
            .order_by(_SO2.date_created)
        )
        for d, rev, n in daily_q.all():
            if d is None:
                continue
            cp_shopify_daily.append({
                "date": d.isoformat(),
                "revenue": round(float(rev or 0), 2),
                "orders": int(n or 0),
            })
    except Exception as exc:
        logger.warning("Executive summary: Shopify daily series failed: %s", exc)

    # ── 9. Final payload ──────────────────────────────────────────────
    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "has_live_data": bool(quarter_order),
        "latest_quarter": latest_quarter,
        "scorecards": scorecards,
        "quarterly_kpis": {
            "quarters": quarter_order,
            "rows": quarterly_rows,
        },
        "division_revenue": division_revenue,
        "revenue_by_quarter": revenue_by_quarter,
        "yoy_sales": yoy_sales,
        "qb_revenue": qb_summary,
        "cp_shopify": {"revenue": shopify_total, "orders": shopify_orders},
        "cp_shopify_daily": cp_shopify_daily,
        "pipeline_status": pipeline_status,
        "sources": {
            "quarterly_kpis": "google_sheets :: TCP MAIN",
            "marketing_spend": "meta_ad_metrics + google_ad_metrics",
            "marketing_leads": "meta_ad_metrics + google_ad_metrics (conversions)",
            "qb_revenue": "google_sheets :: QB_Contractor_Revenue",
            "cp_shopify": "shopify_orders (The Concrete Protector Store)",
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# WooCommerce Store — Sani-Tred retail orders + products
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/woocommerce/store",
    summary="WooCommerce store metrics — orders, products, revenue",
)
async def get_wc_store(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """
    Aggregated WooCommerce store data for the Sani-Tred Retail Breakdown.

    Returns scorecards, monthly performance, product performance, orders
    by status, payment methods, and regional breakdown — all from
    wc_orders + wc_products tables.
    """
    from app.models.metrics import WCOrder, WCProduct, SUCCESSFUL_WC_STATUSES

    start_date, end_date = _get_date_range(date_from, date_to)

    # ── Check if pipeline has ever run OR if records exist ──────────
    pipeline_ran = False
    try:
        pipeline_ran = await _has_pipeline_run(
            db, "woocommerce", "woocommerce_pipeline",
        )
    except Exception as exc:
        logger.warning("WC store: pipeline check failed: %s", exc)

    if not pipeline_ran:
        try:
            wc_count = await db.execute(
                select(func.count()).select_from(WCOrder)
            )
            prod_count = await db.execute(
                select(func.count()).select_from(WCProduct)
            )
            if (wc_count.scalar() or 0) > 0 or (prod_count.scalar() or 0) > 0:
                pipeline_ran = True
        except Exception as exc:
            # Tables might not exist yet — that's fine, just means no data
            logger.warning("WC store: table check failed (tables may not exist): %s", exc)

    if not pipeline_ran:
        return {
            "period": f"{start_date} to {end_date}",
            "hasLiveData": False,
            "scorecards": {},
            "monthly": [],
            "products": [],
            "ordersByStatus": [],
            "paymentMethods": [],
            "regions": [],
        }

    # ── Scorecards ────────────────────────────────────────────────────
    # Try date-filtered first; fall back to all orders if none match
    # (handles cases where date_created is NULL or pipeline only fetched
    # the default 30-day window which doesn't overlap the date picker).
    # Top KPIs (Total Retail Revenue / Online Orders / Avg Order Value)
    # only count orders that actually generated revenue:
    #   - status ∈ SUCCESSFUL_WC_STATUSES (completed / processing / on-hold)
    #   - total > 0 (excludes $0 successful orders WC's view also excludes)
    # The per-status breakdown lower on the page still shows Failed /
    # Cancelled / etc. so revenue at the top matches WC admin filtered
    # to those same conditions.
    totals = await db.execute(
        select(
            func.count(WCOrder.id).label("total_orders"),
            func.coalesce(func.sum(WCOrder.total), 0).label("total_revenue"),
            func.coalesce(func.avg(WCOrder.total), 0).label("avg_order_value"),
            func.coalesce(func.sum(WCOrder.discount), 0).label("total_discount"),
            func.coalesce(func.sum(WCOrder.shipping), 0).label("total_shipping"),
            func.coalesce(func.sum(WCOrder.tax), 0).label("total_tax"),
        ).where(and_(
            WCOrder.date_created >= start_date,
            WCOrder.date_created <= end_date,
            WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            WCOrder.total > 0,
        ))
    )
    t = totals.first()
    total_orders = int(t.total_orders or 0)
    total_revenue = float(t.total_revenue or 0)
    avg_order = float(t.avg_order_value or 0)

    # If the date filter returns no orders, honour it — do NOT silently
    # swap in all-time totals. Previously this fell back to every order
    # in the table, which made "today" show lifetime revenue and broke
    # trust in the date picker across the CEO dashboard.

    # Completed vs refunded for refund rate
    completed_q = await db.execute(
        select(func.count()).select_from(WCOrder).where(and_(
            WCOrder.date_created >= start_date,
            WCOrder.date_created <= end_date,
            WCOrder.status == "completed",
        ))
    )
    completed = completed_q.scalar() or 0
    refunded_q = await db.execute(
        select(func.count()).select_from(WCOrder).where(and_(
            WCOrder.date_created >= start_date,
            WCOrder.date_created <= end_date,
            WCOrder.status == "refunded",
        ))
    )
    refunded = refunded_q.scalar() or 0
    refund_rate = round((refunded / max(total_orders, 1)) * 100, 1)

    # ── Monthly performance ───────────────────────────────────────────
    # Monthly performance — use extract(year/month) instead of date_trunc
    # for better compatibility with Date columns across SQLAlchemy versions.
    from sqlalchemy import case, extract
    monthly = []
    try:
        year_col = extract("year", WCOrder.date_created)
        month_col = extract("month", WCOrder.date_created)
        # Monthly trend reflects successful revenue only — same filter as
        # the top KPIs. Refund count is counted separately so users can
        # see refund volume per month without it inflating the line.
        monthly_q = await db.execute(
            select(
                year_col.label("yr"),
                month_col.label("mn"),
                func.count(WCOrder.id).label("orders"),
                func.coalesce(func.sum(WCOrder.total), 0).label("revenue"),
                func.coalesce(func.avg(WCOrder.total), 0).label("avg_order"),
                func.sum(case((WCOrder.status == "refunded", 1), else_=0)).label("refunds"),
            ).where(and_(
                WCOrder.date_created >= start_date,
                WCOrder.date_created <= end_date,
                WCOrder.date_created.isnot(None),
                WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            )).group_by(year_col, month_col)
            .order_by(year_col, month_col)
        )
        import calendar
        monthly = [
            {
                "month": f"{calendar.month_abbr[int(row.mn)]} {int(row.yr)}" if row.yr and row.mn else "—",
                "orders": int(row.orders or 0),
                "revenue": round(float(row.revenue or 0), 2),
                "avg_order": round(float(row.avg_order or 0), 2),
                "refunds": int(row.refunds or 0),
            }
            for row in monthly_q.all()
        ]
    except Exception as exc:
        logger.warning("WC store monthly query failed: %s", exc)

    # ── Product performance (from wc_products snapshot) ───────────────
    products = []
    try:
        products_q = await db.execute(
            select(WCProduct)
            .order_by(WCProduct.total_sales.desc())
            .limit(20)
        )
        products = [
            {
                "product_id": p.product_id,
                "name": p.name,
                "sku": p.sku or "—",
                "price": float(p.price or 0),
                "total_sales": int(p.total_sales or 0),
                "revenue": round(float(p.price or 0) * int(p.total_sales or 0), 2),
                "stock_status": p.stock_status or "—",
                "categories": p.categories or "—",
            }
            for p in products_q.scalars().all()
        ]
    except Exception as exc:
        logger.warning("WC store products query failed: %s", exc)

    # ── Orders by status ──────────────────────────────────────────────
    orders_by_status = []
    try:
        status_q = await db.execute(
            select(
                WCOrder.status,
                func.count(WCOrder.id).label("count"),
                func.coalesce(func.sum(WCOrder.total), 0).label("revenue"),
            ).where(and_(
                WCOrder.date_created >= start_date,
                WCOrder.date_created <= end_date,
            )).group_by(WCOrder.status)
            .order_by(func.count(WCOrder.id).desc())
        )
        orders_by_status = [
            {"status": row.status, "count": int(row.count), "revenue": round(float(row.revenue), 2)}
            for row in status_q.all()
        ]
    except Exception as exc:
        logger.warning("WC store orders-by-status query failed: %s", exc)

    # ── Payment methods ───────────────────────────────────────────────
    payment_methods = []
    try:
        payment_q = await db.execute(
            select(
                WCOrder.payment_method,
                func.count(WCOrder.id).label("count"),
                func.coalesce(func.sum(WCOrder.total), 0).label("revenue"),
            ).where(and_(
                WCOrder.date_created >= start_date,
                WCOrder.date_created <= end_date,
                WCOrder.payment_method.isnot(None),
                WCOrder.payment_method != "",
                WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            )).group_by(WCOrder.payment_method)
            .order_by(func.sum(WCOrder.total).desc())
        )
        payment_methods = [
            {"method": row.payment_method or "Unknown", "count": int(row.count), "revenue": round(float(row.revenue), 2)}
            for row in payment_q.all()
        ]
    except Exception as exc:
        logger.warning("WC store payment methods query failed: %s", exc)

    # ── Regional breakdown ────────────────────────────────────────────
    regions = []
    try:
        region_q = await db.execute(
            select(
                WCOrder.billing_state,
                func.count(WCOrder.id).label("orders"),
                func.coalesce(func.sum(WCOrder.total), 0).label("revenue"),
                func.coalesce(func.avg(WCOrder.total), 0).label("avg_order"),
            ).where(and_(
                WCOrder.date_created >= start_date,
                WCOrder.date_created <= end_date,
                WCOrder.billing_state.isnot(None),
                WCOrder.billing_state != "",
                WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
            )).group_by(WCOrder.billing_state)
            .order_by(func.sum(WCOrder.total).desc())
            .limit(20)
        )
        regions = [
            {
                "state": row.billing_state,
                "orders": int(row.orders),
                "revenue": round(float(row.revenue), 2),
                "avg_order": round(float(row.avg_order), 2),
                "pct_of_total": round((float(row.revenue) / max(total_revenue, 1)) * 100, 1),
            }
            for row in region_q.all()
        ]
    except Exception as exc:
        logger.warning("WC store regional query failed: %s", exc)

    return {
        "period": f"{start_date} to {end_date}",
        "hasLiveData": True,
        "scorecards": {
            "totalRevenue": round(total_revenue, 2),
            "totalOrders": total_orders,
            "avgOrderValue": round(avg_order, 2),
            "completedOrders": completed,
            "refundedOrders": refunded,
            "refundRate": refund_rate,
            "totalDiscount": round(float(t.total_discount or 0), 2),
            "totalShipping": round(float(t.total_shipping or 0), 2),
            "totalTax": round(float(t.total_tax or 0), 2),
        },
        "monthly": monthly,
        "products": products,
        "ordersByStatus": orders_by_status,
        "paymentMethods": payment_methods,
        "regions": regions,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Shopify Store — CP retail (The Concrete Protector)
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/shopify/store",
    summary="Shopify store metrics — orders, products, customers, revenue",
)
async def get_shopify_store(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """Aggregated Shopify data for the CP Retail Breakdown page.

    Returns scorecards, monthly performance, top products, orders by
    financial status, payment methods, and regional breakdown — all
    from shopify_orders + shopify_products + shopify_customers tables.
    Shape mirrors /woocommerce/store so both retail surfaces can share
    the same frontend component.
    """
    from app.models.metrics import ShopifyCustomer, ShopifyOrder, ShopifyProduct

    start_date, end_date = _get_date_range(date_from, date_to)

    # Gate: has the pipeline ever run, or are there rows?
    pipeline_ran = False
    try:
        pipeline_ran = await _has_pipeline_run(db, "shopify", "shopify_pipeline")
    except Exception as exc:
        logger.warning("Shopify store: pipeline check failed: %s", exc)

    if not pipeline_ran:
        try:
            sh_count = await db.execute(select(func.count(ShopifyOrder.id)))
            pr_count = await db.execute(select(func.count(ShopifyProduct.id)))
            if (sh_count.scalar() or 0) > 0 or (pr_count.scalar() or 0) > 0:
                pipeline_ran = True
        except Exception as exc:
            logger.warning("Shopify store: table check failed (tables may not exist): %s", exc)

    if not pipeline_ran:
        return {
            "period": f"{start_date} to {end_date}",
            "hasLiveData": False,
            "scorecards": {},
            "monthly": [],
            "products": [],
            "ordersByStatus": [],
            "paymentMethods": [],
            "regions": [],
        }

    # Scorecards — strictly date-filtered. Previously had a
    # "if zero orders in range, show all-time totals" fallback that
    # made "today" quote the lifetime Shopify figure ($3,863 / 7
    # orders). Same bug the WooCommerce handler had — removed for
    # identical reasons. If the range is genuinely empty, return 0.
    totals = await db.execute(
        select(
            func.count(ShopifyOrder.id).label("total_orders"),
            func.coalesce(func.sum(ShopifyOrder.total), 0).label("total_revenue"),
            func.coalesce(func.avg(ShopifyOrder.total), 0).label("avg_order_value"),
            func.coalesce(func.sum(ShopifyOrder.discount), 0).label("total_discount"),
            func.coalesce(func.sum(ShopifyOrder.shipping), 0).label("total_shipping"),
            func.coalesce(func.sum(ShopifyOrder.tax), 0).label("total_tax"),
        ).where(and_(
            ShopifyOrder.date_created >= start_date,
            ShopifyOrder.date_created <= end_date,
        ))
    )
    t = totals.first()
    total_orders = int(t.total_orders or 0)
    total_revenue = float(t.total_revenue or 0)
    avg_order = float(t.avg_order_value or 0)

    cust_count_q = await db.execute(select(func.count(ShopifyCustomer.id)))
    unique_customers = int(cust_count_q.scalar() or 0)

    # Refund detection — Shopify financial_status values: refunded, partially_refunded
    from sqlalchemy import case, extract
    refunded_q = await db.execute(
        select(func.count(ShopifyOrder.id))
        .where(and_(
            ShopifyOrder.date_created >= start_date,
            ShopifyOrder.date_created <= end_date,
            ShopifyOrder.financial_status.in_(["refunded", "partially_refunded"]),
        ))
    )
    refunded = int(refunded_q.scalar() or 0)
    refund_rate = round((refunded / max(total_orders, 1)) * 100, 1)

    # Monthly breakdown via extract(year/month) — Postgres-compatible and matches WC shape
    monthly = []
    try:
        year_col = extract("year", ShopifyOrder.date_created)
        month_col = extract("month", ShopifyOrder.date_created)
        monthly_q = await db.execute(
            select(
                year_col.label("yr"),
                month_col.label("mn"),
                func.count(ShopifyOrder.id).label("orders"),
                func.coalesce(func.sum(ShopifyOrder.total), 0).label("revenue"),
                func.coalesce(func.avg(ShopifyOrder.total), 0).label("avg_order"),
                func.sum(case((ShopifyOrder.financial_status.in_(["refunded", "partially_refunded"]), 1), else_=0)).label("refunds"),
            ).where(and_(
                ShopifyOrder.date_created >= start_date,
                ShopifyOrder.date_created <= end_date,
                ShopifyOrder.date_created.isnot(None),
            )).group_by(year_col, month_col)
            .order_by(year_col, month_col)
        )
        import calendar
        monthly = [
            {
                "month": f"{calendar.month_abbr[int(row.mn)]} {int(row.yr)}" if row.yr and row.mn else "—",
                "orders": int(row.orders or 0),
                "revenue": round(float(row.revenue or 0), 2),
                "avg_order": round(float(row.avg_order or 0), 2),
                "refunds": int(row.refunds or 0),
            }
            for row in monthly_q.all()
        ]
    except Exception as exc:
        logger.warning("Shopify store monthly query failed: %s", exc)

    # Top products — aggregate from shopify_order_lines in the date range so
    # "Product Performance" reflects real sales, not catalog listing order.
    # Falls back to the catalog (sorted by price) if no line data is present.
    from app.models.metrics import ShopifyOrderLine
    products = []
    try:
        lines_q = await db.execute(
            select(
                ShopifyOrderLine.product_id,
                func.max(ShopifyOrderLine.title).label("title"),
                func.max(ShopifyOrderLine.sku).label("sku"),
                func.sum(ShopifyOrderLine.quantity).label("units"),
                func.sum(ShopifyOrderLine.line_total).label("revenue"),
                func.avg(ShopifyOrderLine.price).label("avg_price"),
            ).where(and_(
                ShopifyOrderLine.order_date >= start_date,
                ShopifyOrderLine.order_date <= end_date,
                ShopifyOrderLine.product_id.isnot(None),
            )).group_by(ShopifyOrderLine.product_id)
            .order_by(func.sum(ShopifyOrderLine.line_total).desc())
            .limit(10)
        )
        line_rows = lines_q.all()
        if line_rows:
            # Enrich with categories from ShopifyProduct where available.
            prod_map_q = await db.execute(
                select(ShopifyProduct.product_id, ShopifyProduct.product_type)
            )
            prod_types = {r[0]: r[1] for r in prod_map_q.all()}
            products = [
                {
                    "product_id": r.product_id,
                    "name": r.title or "—",
                    "sku": r.sku or "—",
                    "price": round(float(r.avg_price or 0), 2),
                    "total_sales": int(r.units or 0),
                    "revenue": round(float(r.revenue or 0), 2),
                    "stock_status": "—",
                    "categories": prod_types.get(r.product_id) or "—",
                }
                for r in line_rows
            ]
        else:
            # No line items in range — fall back to catalog listing (no sales shown).
            products_q = await db.execute(
                select(ShopifyProduct).order_by(ShopifyProduct.price.desc()).limit(10)
            )
            products = [
                {
                    "product_id": p.product_id,
                    "name": p.name,
                    "sku": p.sku or "—",
                    "price": float(p.price or 0),
                    "total_sales": 0,
                    "revenue": 0.0,
                    "stock_status": p.status or "—",
                    "categories": p.product_type or "—",
                }
                for p in products_q.scalars().all()
            ]
    except Exception as exc:
        logger.warning("Shopify store products query failed: %s", exc)

    # Orders by financial status — uses "revenue" key to match WC shape
    orders_by_status = []
    try:
        status_q = await db.execute(
            select(
                ShopifyOrder.financial_status.label("status"),
                func.count(ShopifyOrder.id).label("count"),
                func.coalesce(func.sum(ShopifyOrder.total), 0).label("revenue"),
            ).where(and_(
                ShopifyOrder.date_created >= start_date,
                ShopifyOrder.date_created <= end_date,
            )).group_by(ShopifyOrder.financial_status)
            .order_by(func.count(ShopifyOrder.id).desc())
        )
        orders_by_status = [
            {"status": row.status or "unknown", "count": int(row.count), "revenue": round(float(row.revenue), 2)}
            for row in status_q.all()
        ]
    except Exception as exc:
        logger.warning("Shopify store orders-by-status query failed: %s", exc)

    # Payment methods — uses "revenue" key to match WC shape
    payment_methods = []
    try:
        pm_q = await db.execute(
            select(
                ShopifyOrder.payment_method,
                func.count(ShopifyOrder.id).label("count"),
                func.coalesce(func.sum(ShopifyOrder.total), 0).label("revenue"),
            ).where(and_(
                ShopifyOrder.date_created >= start_date,
                ShopifyOrder.date_created <= end_date,
                ShopifyOrder.payment_method.isnot(None),
                ShopifyOrder.payment_method != "",
            )).group_by(ShopifyOrder.payment_method)
            .order_by(func.sum(ShopifyOrder.total).desc())
        )
        payment_methods = [
            {"method": row.payment_method or "Unknown", "count": int(row.count), "revenue": round(float(row.revenue), 2)}
            for row in pm_q.all()
        ]
    except Exception as exc:
        logger.warning("Shopify store payment methods query failed: %s", exc)

    # Regions — matches WC shape (state, orders, revenue, avg_order, pct_of_total)
    regions = []
    try:
        region_q = await db.execute(
            select(
                ShopifyOrder.billing_state,
                func.count(ShopifyOrder.id).label("orders"),
                func.coalesce(func.sum(ShopifyOrder.total), 0).label("revenue"),
                func.coalesce(func.avg(ShopifyOrder.total), 0).label("avg_order"),
            ).where(and_(
                ShopifyOrder.date_created >= start_date,
                ShopifyOrder.date_created <= end_date,
                ShopifyOrder.billing_state.isnot(None),
                ShopifyOrder.billing_state != "",
            )).group_by(ShopifyOrder.billing_state)
            .order_by(func.sum(ShopifyOrder.total).desc())
            .limit(20)
        )
        regions = [
            {
                "state": row.billing_state,
                "orders": int(row.orders),
                "revenue": round(float(row.revenue), 2),
                "avg_order": round(float(row.avg_order), 2),
                "pct_of_total": round((float(row.revenue) / max(total_revenue, 1)) * 100, 1),
            }
            for row in region_q.all()
        ]
    except Exception as exc:
        logger.warning("Shopify store regional query failed: %s", exc)

    return {
        "period": f"{start_date} to {end_date}",
        "hasLiveData": True,
        "scorecards": {
            "totalRevenue": round(total_revenue, 2),
            "totalOrders": total_orders,
            "avgOrderValue": round(avg_order, 2),
            "refundedOrders": refunded,
            "refundRate": refund_rate,
            "uniqueCustomers": unique_customers,
            "totalDiscount": round(float(t.total_discount or 0), 2),
            "totalShipping": round(float(t.total_shipping or 0), 2),
            "totalTax": round(float(t.total_tax or 0), 2),
        },
        "monthly": monthly,
        "products": products,
        "ordersByStatus": orders_by_status,
        "paymentMethods": payment_methods,
        "regions": regions,
    }


# ═══════════════════════════════════════════════════════════════════════════
# QB Contractor Revenue — aggregated for Executive Summary + I-BOS Overview
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/contractor-revenue",
    summary="QB contractor revenue — top performers, totals, spend vs revenue",
)
async def get_contractor_revenue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """Aggregated QuickBooks contractor revenue for executive-level views."""
    start_date, end_date = _get_date_range(date_from, date_to)

    # QB revenue by contractor
    qb_by_contractor = []
    total_qb_revenue = 0.0
    try:
        qb_q = await db.execute(
            select(
                GoogleSheetMetric.metric_name,
                func.sum(GoogleSheetMetric.metric_value).label("revenue"),
            ).where(and_(
                GoogleSheetMetric.sheet_name.like("qb_revenue::%"),
                GoogleSheetMetric.date >= start_date,
                GoogleSheetMetric.date <= end_date,
            )).group_by(GoogleSheetMetric.metric_name)
            .order_by(func.sum(GoogleSheetMetric.metric_value).desc())
        )
        for row in qb_q.all():
            rev = float(row[1] or 0)
            if rev > 0:
                qb_by_contractor.append({
                    "name": row[0].strip(),
                    "revenue": round(rev, 2),
                })
                total_qb_revenue += rev
    except Exception as exc:
        logger.warning("QB contractor revenue query failed: %s", exc)

    # QB monthly trend (total across all contractors)
    qb_monthly = []
    try:
        from sqlalchemy import extract
        qb_month_q = await db.execute(
            select(
                extract("year", GoogleSheetMetric.date).label("yr"),
                extract("month", GoogleSheetMetric.date).label("mn"),
                func.sum(GoogleSheetMetric.metric_value).label("revenue"),
            ).where(and_(
                GoogleSheetMetric.sheet_name.like("qb_revenue::%"),
                GoogleSheetMetric.date >= start_date,
                GoogleSheetMetric.date <= end_date,
            )).group_by(
                extract("year", GoogleSheetMetric.date),
                extract("month", GoogleSheetMetric.date),
            ).order_by(
                extract("year", GoogleSheetMetric.date),
                extract("month", GoogleSheetMetric.date),
            )
        )
        import calendar
        for row in qb_month_q.all():
            if row.yr and row.mn:
                qb_monthly.append({
                    "month": f"{calendar.month_abbr[int(row.mn)]} {int(row.yr)}",
                    "revenue": round(float(row.revenue or 0), 2),
                })
    except Exception as exc:
        logger.warning("QB monthly revenue query failed: %s", exc)

    # Ad spend by contractor (for spend vs revenue comparison)
    ad_spend_by_contractor = {}
    try:
        meta_spend_q = await db.execute(
            select(
                MetaAdMetric.account_name,
                func.sum(MetaAdMetric.spend).label("spend"),
            ).where(and_(
                MetaAdMetric.date >= start_date,
                MetaAdMetric.date <= end_date,
                MetaAdMetric.division == "ibos",
            )).group_by(MetaAdMetric.account_name)
        )
        for row in meta_spend_q.all():
            name = (row[0] or "").replace("[META] ", "").strip().lower()
            ad_spend_by_contractor[name] = float(row[1] or 0)
    except Exception:
        pass

    # Merge spend into contractor list
    for c in qb_by_contractor:
        c_lower = c["name"].lower()
        matched_spend = 0.0
        for spend_name, spend_val in ad_spend_by_contractor.items():
            if c_lower in spend_name or spend_name in c_lower:
                matched_spend = spend_val
                break
            c_words = c_lower.split()[:2]
            s_words = spend_name.split()[:2]
            if len(c_words) >= 2 and c_words == s_words:
                matched_spend = spend_val
                break
        c["ad_spend"] = round(matched_spend, 2)
        c["roi"] = round(c["revenue"] / max(matched_spend, 1), 1) if matched_spend > 0 else None

    # Pct of total
    for c in qb_by_contractor:
        c["pct_of_total"] = round((c["revenue"] / max(total_qb_revenue, 1)) * 100, 1)

    return {
        "period": f"{start_date} to {end_date}",
        "hasData": len(qb_by_contractor) > 0,
        "totalRevenue": round(total_qb_revenue, 2),
        "contractorCount": len(qb_by_contractor),
        "contractors": qb_by_contractor[:20],
        "monthly": qb_monthly,
    }


@router.get(
    "/debug/qb-revenue",
    summary="Debug: show all qb_revenue:: GoogleSheetMetric rows (admin only)",
)
async def debug_qb_revenue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> dict:
    """Diagnostic endpoint to verify QB sheet ingestion."""
    rows = await db.execute(
        select(
            GoogleSheetMetric.sheet_name,
            GoogleSheetMetric.metric_name,
            GoogleSheetMetric.date,
            GoogleSheetMetric.metric_value,
        )
        .where(GoogleSheetMetric.sheet_name.like("qb_revenue::%"))
        .order_by(GoogleSheetMetric.metric_name, GoogleSheetMetric.date)
        .limit(500)
    )
    data = [
        {"sheet": r[0], "contractor": r[1], "date": r[2].isoformat() if r[2] else None,
         "revenue": float(r[3] or 0)}
        for r in rows.all()
    ]
    # Also count exec:: rows for comparison
    exec_count = await db.execute(
        select(func.count()).select_from(GoogleSheetMetric)
        .where(GoogleSheetMetric.sheet_name.like("exec::%"))
    )
    qb_count = await db.execute(
        select(func.count()).select_from(GoogleSheetMetric)
        .where(GoogleSheetMetric.sheet_name.like("qb_revenue::%"))
    )
    # Distinct sheet_names to see what's actually in the DB
    distinct_sheets = await db.execute(
        select(
            GoogleSheetMetric.sheet_name,
            func.count(GoogleSheetMetric.id),
        ).group_by(GoogleSheetMetric.sheet_name)
        .order_by(func.count(GoogleSheetMetric.id).desc())
        .limit(20)
    )
    return {
        "qb_revenue_count": qb_count.scalar() or 0,
        "exec_count": exec_count.scalar() or 0,
        "all_sheets": [{"sheet_name": r[0], "row_count": r[1]} for r in distinct_sheets.all()],
        "sample_qb_rows": data[:50],
    }


@router.get(
    "/debug/sheet-headers",
    summary="Debug: show metric_names from each sheet to diagnose pivot detection (admin only)",
)
async def debug_sheet_headers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    sheet: str = Query(..., description="Sheet name to inspect"),
) -> dict:
    """Return distinct metric_names + sample dates for a given sheet_name."""
    distinct_metrics = await db.execute(
        select(GoogleSheetMetric.metric_name, func.count(GoogleSheetMetric.id))
        .where(GoogleSheetMetric.sheet_name == sheet)
        .group_by(GoogleSheetMetric.metric_name)
        .order_by(func.count(GoogleSheetMetric.id).desc())
        .limit(100)
    )
    metrics = [{"metric_name": r[0], "count": r[1]} for r in distinct_metrics.all()]
    distinct_dates = await db.execute(
        select(GoogleSheetMetric.date, func.count(GoogleSheetMetric.id))
        .where(GoogleSheetMetric.sheet_name == sheet)
        .group_by(GoogleSheetMetric.date)
        .order_by(GoogleSheetMetric.date)
        .limit(50)
    )
    dates = [{"date": r[0].isoformat() if r[0] else None, "count": r[1]} for r in distinct_dates.all()]
    sample = await db.execute(
        select(
            GoogleSheetMetric.metric_name,
            GoogleSheetMetric.date,
            GoogleSheetMetric.metric_value,
            GoogleSheetMetric.category,
        )
        .where(GoogleSheetMetric.sheet_name == sheet)
        .limit(20)
    )
    return {
        "sheet_name": sheet,
        "distinct_metrics_top_100": metrics,
        "distinct_dates_top_50": dates,
        "sample_rows": [
            {"metric": r[0], "date": r[1].isoformat() if r[1] else None,
             "value": float(r[2] or 0), "category": r[3]}
            for r in sample.all()
        ],
    }


@router.get(
    "/debug/revenue-source-audit",
    summary="Admin audit: contractor revenue source breakdown for a date range",
)
async def revenue_source_audit(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> dict:
    """
    Calls the contractor-breakdown logic and reports each contractor's revenue
    along with its source (`quickbooks` vs `estimate`). Use this to spot-check
    whether any contractor is silently falling back to the leads×$2,500
    heuristic instead of pulling real QB data.
    """
    breakdown = await get_contractor_breakdown(
        db=db,
        current_user=current_user,
        date_from=date_from,
        date_to=date_to,
    )
    contractors = breakdown.get("contractors", [])
    counts: dict[str, int] = {}
    for c in contractors:
        src = c.get("revenue_source") or "none"
        counts[src] = counts.get(src, 0) + 1
    return {
        "period": breakdown.get("period"),
        "total_contractors": len(contractors),
        "source_counts": counts,
        "contractors": [
            {
                "name": c.get("name"),
                "revenue": c.get("revenue", 0),
                "revenue_source": c.get("revenue_source", "none"),
                "leads": c.get("leads", 0),
                "spend": c.get("spend", 0),
            }
            for c in sorted(
                contractors, key=lambda x: x.get("revenue", 0), reverse=True
            )
        ],
    }
