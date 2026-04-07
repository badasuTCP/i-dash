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
    GoogleAdMetric,
    HubSpotMetric,
    MetaAdMetric,
)
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
    from collections import defaultdict
    from hubspot import Client as HubSpotClient
    from app.services.hubspot_owners import (
        get_hubspot_owners,
        resolve_owner_name,
        resolve_owner_avatar,
    )

    # Admin-only for now (super-admin role)
    if current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sales Intelligence requires admin access",
        )

    start_date, end_date = _get_date_range(date_from, date_to)

    # ── 1. Pre-load HubSpot owner map ──────────────────────────────────
    owners = await get_hubspot_owners()

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

    # ── 4. Live deal-level + owner-level data from HubSpot API ──────────
    reps_data = []
    stalled_deals = []
    pipeline_waterfall = []

    try:
        if not settings.HUBSPOT_API_KEY:
            raise ValueError("HUBSPOT_API_KEY not configured")

        hs = HubSpotClient(access_token=settings.HUBSPOT_API_KEY)

        # Fetch all deals with owner info
        all_deals = []
        deal_page = hs.crm.deals.get_page(
            limit=100,
            properties=[
                "dealname", "dealstage", "amount", "closedate",
                "createdate", "hubspot_owner_id",
                "notes_last_updated", "hs_lastmodifieddate",
            ],
        )
        while deal_page:
            all_deals.extend(deal_page.results or [])
            if deal_page.paging and deal_page.paging.next:
                deal_page = hs.crm.deals.get_page(
                    limit=100,
                    after=deal_page.paging.next.after,
                    properties=[
                        "dealname", "dealstage", "amount", "closedate",
                        "createdate", "hubspot_owner_id",
                        "notes_last_updated", "hs_lastmodifieddate",
                    ],
                )
            else:
                break

        logger.info("Sales Intelligence: fetched %d deals from HubSpot", len(all_deals))

        # Fetch meetings/emails/tasks with owner info for activity counts
        activity_counts = defaultdict(lambda: {"calls": 0, "emails": 0, "meetings": 0})

        # Meetings
        try:
            mtg_page = hs.crm.objects.meetings.get_page(
                limit=100,
                properties=["hs_timestamp", "hubspot_owner_id"],
            )
            while mtg_page:
                for mtg in mtg_page.results or []:
                    oid = (mtg.properties or {}).get("hubspot_owner_id")
                    if oid:
                        activity_counts[oid]["meetings"] += 1
                if mtg_page.paging and mtg_page.paging.next:
                    mtg_page = hs.crm.objects.meetings.get_page(
                        limit=100,
                        after=mtg_page.paging.next.after,
                        properties=["hs_timestamp", "hubspot_owner_id"],
                    )
                else:
                    break
        except Exception as e:
            logger.warning("Meetings fetch for SI skipped: %s", e)

        # Emails
        try:
            email_page = hs.crm.objects.emails.get_page(
                limit=100,
                properties=["hs_timestamp", "hubspot_owner_id"],
            )
            while email_page:
                for em in email_page.results or []:
                    oid = (em.properties or {}).get("hubspot_owner_id")
                    if oid:
                        activity_counts[oid]["emails"] += 1
                if email_page.paging and email_page.paging.next:
                    email_page = hs.crm.objects.emails.get_page(
                        limit=100,
                        after=email_page.paging.next.after,
                        properties=["hs_timestamp", "hubspot_owner_id"],
                    )
                else:
                    break
        except Exception as e:
            logger.warning("Emails fetch for SI skipped: %s", e)

        # Tasks (calls proxy)
        try:
            task_page = hs.crm.objects.tasks.get_page(
                limit=100,
                properties=["hs_task_status", "hs_timestamp", "hubspot_owner_id"],
            )
            while task_page:
                for t in task_page.results or []:
                    props = t.properties or {}
                    oid = props.get("hubspot_owner_id")
                    if oid and props.get("hs_task_status") == "completed":
                        activity_counts[oid]["calls"] += 1
                if task_page.paging and task_page.paging.next:
                    task_page = hs.crm.objects.tasks.get_page(
                        limit=100,
                        after=task_page.paging.next.after,
                        properties=["hs_task_status", "hs_timestamp", "hubspot_owner_id"],
                    )
                else:
                    break
        except Exception as e:
            logger.warning("Tasks fetch for SI skipped: %s", e)

        # ── Build per-owner rep profiles from deals ──────────────────────
        rep_stats = defaultdict(lambda: {
            "deals_won": 0, "deals_lost": 0, "deals_open": 0,
            "revenue": 0.0, "pipeline_value": 0.0,
            "total_close_days": 0, "close_count": 0,
        })

        now_ts = datetime.now(timezone.utc)
        stage_labels = {
            "appointmentscheduled": "Appointment",
            "qualifiedtobuy": "Qualified",
            "presentationscheduled": "Presentation",
            "decisionmakerboughtin": "Decision Maker",
            "contractsent": "Contract Sent",
            "closedwon": "Closed Won",
            "closedlost": "Closed Lost",
        }

        for deal in all_deals:
            props = deal.properties or {}
            owner_id = props.get("hubspot_owner_id")
            if not owner_id:
                continue

            stage = props.get("dealstage", "")
            amount = 0.0
            try:
                amount = float(props.get("amount") or 0)
            except (ValueError, TypeError):
                pass

            if stage == "closedwon":
                rep_stats[owner_id]["deals_won"] += 1
                rep_stats[owner_id]["revenue"] += amount
                # Calculate days to close
                try:
                    create_str = props.get("createdate", "")
                    close_str = props.get("closedate", "")
                    if create_str and close_str:
                        create_dt = datetime.fromisoformat(create_str.replace("Z", "+00:00"))
                        close_dt = datetime.fromisoformat(close_str.replace("Z", "+00:00"))
                        days = (close_dt - create_dt).days
                        if days >= 0:
                            rep_stats[owner_id]["total_close_days"] += days
                            rep_stats[owner_id]["close_count"] += 1
                except Exception:
                    pass
            elif stage == "closedlost":
                rep_stats[owner_id]["deals_lost"] += 1
            else:
                rep_stats[owner_id]["deals_open"] += 1
                rep_stats[owner_id]["pipeline_value"] += amount

                # Stalled deal detection (no update in 72+ hours)
                try:
                    last_mod = props.get("hs_lastmodifieddate") or props.get("notes_last_updated") or ""
                    if last_mod:
                        last_dt = datetime.fromisoformat(last_mod.replace("Z", "+00:00"))
                        days_stalled = (now_ts - last_dt).days
                        if days_stalled >= 3 and amount > 0:
                            stalled_deals.append({
                                "id": deal.id,
                                "name": props.get("dealname", "Untitled Deal"),
                                "value": amount,
                                "rep": await resolve_owner_name(owner_id),
                                "stage": stage_labels.get(stage, stage.replace("_", " ").title()),
                                "days_stalled": days_stalled,
                                "last_touch": "Activity",
                            })
                except Exception:
                    pass

        # Sort stalled deals by days descending, take top 12
        stalled_deals.sort(key=lambda d: d["days_stalled"], reverse=True)
        stalled_deals = stalled_deals[:12]

        # ── Assemble reps_data list ──────────────────────────────────────
        for owner_id, stats in rep_stats.items():
            name = await resolve_owner_name(owner_id)
            avatar = await resolve_owner_avatar(owner_id)
            acts = activity_counts.get(owner_id, {"calls": 0, "emails": 0, "meetings": 0})
            won = stats["deals_won"]
            lost = stats["deals_lost"]
            avg_days = (
                round(stats["total_close_days"] / stats["close_count"])
                if stats["close_count"] > 0 else 0
            )
            total_activities = acts["calls"] + acts["emails"] + acts["meetings"]

            reps_data.append({
                "id": owner_id,
                "name": name,
                "avatar": avatar,
                "deals_won": won,
                "deals_lost": lost,
                "revenue": stats["revenue"],
                "avg_days": avg_days,
                "calls": acts["calls"],
                "emails": acts["emails"],
                "meetings": acts["meetings"],
                "prospecting": min(100, round(acts["calls"] / max(total_activities, 1) * 200)),
                "closing": min(100, round(won / max(won + lost, 1) * 100)),
                "nurturing": min(100, round(acts["emails"] / max(total_activities, 1) * 200)),
                "quota": 0,  # frontend can override or ignore
                "pipeline_value": stats["pipeline_value"],
            })

        # Sort by revenue desc
        reps_data.sort(key=lambda r: r["revenue"], reverse=True)

        # ── Pipeline waterfall ───────────────────────────────────────────
        total_pipeline = sum(s["pipeline_value"] for s in rep_stats.values())
        total_new = sum(
            float((d.properties or {}).get("amount") or 0)
            for d in all_deals
            if (d.properties or {}).get("dealstage") not in ("closedwon", "closedlost")
            and _is_recent_deal(d, start_date)
        )
        total_won_val = sum(s["revenue"] for s in rep_stats.values())
        total_lost_val = sum(
            float((d.properties or {}).get("amount") or 0)
            for d in all_deals
            if (d.properties or {}).get("dealstage") == "closedlost"
        )
        starting = total_pipeline + total_won_val + total_lost_val - total_new
        ending = total_pipeline

        pipeline_waterfall = [
            {"name": "Starting Pipeline", "value": starting, "fill": "#6366F1"},
            {"name": "New Deals (+)", "value": total_new, "fill": "#22D3EE"},
            {"name": "Deals Won (-)", "value": -total_won_val, "fill": "#F59E0B"},
            {"name": "Deals Lost (-)", "value": -total_lost_val, "fill": "#F43F5E"},
            {"name": "Ending Pipeline", "value": ending, "fill": "#8B5CF6"},
        ]

    except Exception as exc:
        logger.warning("Live HubSpot owner fetch failed, returning DB-only data: %s", exc)

    logger.info("User %s retrieved sales intelligence (%d reps)", current_user.id, len(reps_data))

    return {
        "period": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "daily_series": daily_series,
        "totals": totals,
        "reps": reps_data,
        "stalled_deals": stalled_deals,
        "pipeline_waterfall": pipeline_waterfall,
        "owners_synced": len(owners) > 0,
    }


def _is_recent_deal(deal, start_date) -> bool:
    """Check if deal was created on or after start_date."""
    try:
        cd = (deal.properties or {}).get("createdate", "")
        if cd:
            return datetime.fromisoformat(cd.replace("Z", "+00:00")).date() >= start_date
    except Exception:
        pass
    return False


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
