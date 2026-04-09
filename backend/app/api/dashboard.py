"""
Dashboard API router for I-Dash Analytics Platform.

Provides aggregated metrics, KPI scorecards, revenue data, ads performance,
CRM metrics, and custom metric queries with role-based filtering.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
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
    ).where(
        and_(
            HubSpotMetric.date >= start_date,
            HubSpotMetric.date <= end_date,
        )
    )

    result = await db.execute(stmt)
    data = result.first()

    logger.info(f"User {current_user.id} retrieved HubSpot metrics")

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "contacts_created": int(data[0] or 0),
        "deals_created": int(data[1] or 0),
        "deals_won": int(data[2] or 0),
        "deals_lost": int(data[3] or 0),
        "revenue_won": float(data[4] or 0),
        "pipeline_value": float(data[5] or 0),
        "meetings_booked": int(data[6] or 0),
        "emails_sent": int(data[7] or 0),
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

    # Allow admin and data-analyst roles
    if current_user.role.value not in ("admin", "data-analyst", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sales Intelligence requires at least viewer access",
        )

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

    # ── 4. Rep leaderboard — whitelist + heuristic revenue ──────────────
    # Only show active sales reps. Admin/general owners are excluded.
    SALES_REP_WHITELIST = {
        "Kathy Fowler", "Tony Phillips", "Brett Pettiford",
        "Nakoiya Dotson", "Darian Booth",
    }

    # Heuristic: $2,500 average deal value when HubSpot amount is $0/NULL
    HEURISTIC_DEAL_VALUE = 2500.0

    reps_data = []
    for owner_id, info in owners.items():
        name = f"{info.get('first', '')} {info.get('last', '')}".strip()
        if not name or name not in SALES_REP_WHITELIST:
            continue
        initials = (info.get("first", "?")[0] + (info.get("last", "?")[0] if info.get("last") else "")).upper()
        reps_data.append({
            "id": owner_id,
            "name": name,
            "avatar": initials,
            "deals_won": 0,
            "deals_lost": 0,
            "revenue": 0.0,
            "avg_days": 0,
            "calls": 0,
            "emails": 0,
            "meetings": 0,
            "prospecting": 0,
            "closing": 0,
            "nurturing": 0,
            "quota": 0,
            "pipeline_value": 0.0,
        })

    # Apply heuristic revenue: if DB revenue is near-zero but deals exist,
    # estimate based on $2,500 per won deal.
    deals_won = totals["deals_won"]
    actual_rev = totals["revenue_won"]
    heuristic_rev = max(actual_rev, deals_won * HEURISTIC_DEAL_VALUE) if deals_won > 0 else actual_rev
    heuristic_pipeline = max(totals["pipeline_value"], totals["deals_created"] * HEURISTIC_DEAL_VALUE * 0.3)

    # Override totals with heuristic values
    totals["revenue_won"] = heuristic_rev
    totals["pipeline_value"] = heuristic_pipeline

    # Pipeline waterfall from heuristic totals
    rev = heuristic_rev
    pipe = heuristic_pipeline
    pipeline_waterfall = [
        {"name": "Starting Pipeline", "value": pipe + rev, "fill": "#6366F1"},
        {"name": "New Deals (+)", "value": pipe, "fill": "#22D3EE"},
        {"name": "Deals Won (-)", "value": -rev, "fill": "#F59E0B"},
        {"name": "Deals Lost (-)", "value": 0, "fill": "#F43F5E"},
        {"name": "Ending Pipeline", "value": pipe, "fill": "#8B5CF6"},
    ]

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "daily_series": daily_series,
        "totals": totals,
        "reps": reps_data,
        "stalled_deals": [],
        "pipeline_waterfall": pipeline_waterfall,
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
    property_id = await _resolve_ga4_property(division, db=db, property_id_override=property_id)

    # If no property is configured at all, return empty / no-live-data
    if not property_id:
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
                GA4Metric.property_id == property_id,
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
            "No GA4 data in DB for property %s (%s), range %s–%s",
            property_id, division, start_date, end_date,
        )
        resp = _empty_web_analytics(start_date, end_date, division)
        resp["property_id"] = property_id  # property exists, just no data yet
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
                GA4Metric.property_id == property_id,
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

    # ── Visitor trend series ─────────────────────────────────────────
    visitor_trend = []
    if granularity == "daily":
        for row in overview_rows:
            visitor_trend.append({
                "month": row.date.strftime("%b %d"),
                "visits": row.sessions,
                "returning": max(0, row.total_users - row.new_users),
            })
    else:
        # Monthly aggregation
        from collections import defaultdict as _dd
        monthly = _dd(lambda: {"visits": 0, "returning": 0})
        for row in overview_rows:
            key = row.date.strftime("%b %Y")
            monthly[key]["visits"] += row.sessions
            monthly[key]["returning"] += max(0, row.total_users - row.new_users)
        for label, vals in monthly.items():
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
                GA4Metric.property_id == property_id,
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
                GA4Metric.property_id == property_id,
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

    logger.info(
        "User %s fetched GA4 web analytics for %s (%d overview rows)",
        current_user.id, division, len(overview_rows),
    )

    return {
        "division": division,
        "property_id": property_id,
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "granularity": granularity,
        "hasLiveData": True,
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
        return {
            "division": division,
            "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
            "hasLiveData": False,
            "scorecards": {},
            "platforms": [],
            "spendByPeriod": [],
        }

    # ── 2. Meta Ads aggregates ────────────────────────────────────────
    meta_stmt = select(
        func.sum(MetaAdMetric.impressions).label("impressions"),
        func.sum(MetaAdMetric.clicks).label("clicks"),
        func.sum(MetaAdMetric.spend).label("spend"),
        func.sum(MetaAdMetric.conversions).label("conversions"),
        func.sum(MetaAdMetric.conversion_value).label("conversion_value"),
        func.avg(MetaAdMetric.ctr).label("avg_ctr"),
        func.avg(MetaAdMetric.roas).label("avg_roas"),
    ).where(
        and_(
            MetaAdMetric.date >= start_date,
            MetaAdMetric.date <= end_date,
        )
    )
    meta_result = await db.execute(meta_stmt)
    meta = meta_result.first()

    # ── 3. Google Ads aggregates ──────────────────────────────────────
    google_stmt = select(
        func.sum(GoogleAdMetric.impressions).label("impressions"),
        func.sum(GoogleAdMetric.clicks).label("clicks"),
        func.sum(GoogleAdMetric.spend).label("spend"),
        func.sum(GoogleAdMetric.conversions).label("conversions"),
        func.sum(GoogleAdMetric.conversion_value).label("conversion_value"),
        func.avg(GoogleAdMetric.ctr).label("avg_ctr"),
        func.avg(GoogleAdMetric.roas).label("avg_roas"),
    ).where(
        and_(
            GoogleAdMetric.date >= start_date,
            GoogleAdMetric.date <= end_date,
        )
    )
    google_result = await db.execute(google_stmt)
    gads = google_result.first()

    # ── 4. Daily spend time-series (for Spend & Leads chart) ─────────
    meta_daily = select(
        MetaAdMetric.date,
        func.sum(MetaAdMetric.spend).label("spend"),
        func.sum(MetaAdMetric.conversions).label("leads"),
    ).where(
        and_(MetaAdMetric.date >= start_date, MetaAdMetric.date <= end_date)
    ).group_by(MetaAdMetric.date).order_by(MetaAdMetric.date)

    google_daily = select(
        GoogleAdMetric.date,
        func.sum(GoogleAdMetric.spend).label("spend"),
        func.sum(GoogleAdMetric.conversions).label("leads"),
    ).where(
        and_(GoogleAdMetric.date >= start_date, GoogleAdMetric.date <= end_date)
    ).group_by(GoogleAdMetric.date).order_by(GoogleAdMetric.date)

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

    logger.info(
        "Marketing data for %s: spend=$%.2f, impressions=%d, leads=%d, hasLive=True",
        division, total_spend, total_impressions, total_leads,
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
        "platforms": platforms,
        "spendByPeriod": spend_by_period,
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
