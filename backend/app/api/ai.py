"""
AI chatbot and insights API router for I-Dash Analytics Platform.

Provides AI-powered questions answering about metrics, automated insights generation,
and natural language report generation using Groq API.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.metrics import DashboardSnapshot, HubSpotMetric, MetaAdMetric
from app.models.user import User, UserDepartment
from app.schemas.user import UserResponse
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Insights"])

# Global AI service instance
_ai_service: AIService = None


def get_ai_service() -> AIService:
    """
    Get or initialize the AI service.

    Returns:
        AIService: Singleton AI service instance.

    Raises:
        HTTPException: If Groq API key is not configured.
    """
    global _ai_service
    if _ai_service is None:
        if not settings.GROQ_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service not configured. Please set GROQ_API_KEY.",
            )
        _ai_service = AIService(api_key=settings.GROQ_API_KEY)
    return _ai_service


async def _fetch_metrics_context(
    db: AsyncSession,
    user: User,
    days: int = 730,
) -> Dict[str, Any]:
    """
    Fetch ALL available metrics to give the AI maximum context.

    Pulls from every live pipeline (Meta, Google Ads, GA4, HubSpot,
    WooCommerce, Google Sheets) across the FULL data range — not
    just the last 30 days. The AI needs to answer questions like
    "what were our best months in 2024?" which requires all-time data.
    """
    # Use a wide window: 2 years back to today (covers 2024-2026 backfill)
    start_date = date.today() - timedelta(days=days)
    end_date = date.today()

    # Also compute YTD (current year)
    ytd_start = date(date.today().year, 1, 1)

    # ── Snapshot totals (all-time) ────────────────────────────────────
    snapshot_stmt = select(
        func.sum(DashboardSnapshot.total_revenue).label("revenue"),
        func.sum(DashboardSnapshot.total_ad_spend).label("ad_spend"),
        func.sum(DashboardSnapshot.total_leads).label("leads"),
        func.sum(DashboardSnapshot.total_deals_won).label("deals_won"),
        func.avg(DashboardSnapshot.blended_roas).label("roas"),
    ).where(and_(
        DashboardSnapshot.date >= start_date,
        DashboardSnapshot.date <= end_date,
    ))
    snapshot_result = await db.execute(snapshot_stmt)
    snapshot_data = snapshot_result.first()

    context = {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_revenue": float(snapshot_data[0] or 0),
        "total_ad_spend": float(snapshot_data[1] or 0),
        "total_leads": int(snapshot_data[2] or 0),
        "total_deals_won": int(snapshot_data[3] or 0),
        "blended_roas": float(snapshot_data[4] or 0),
    }

    # ── Meta Ads (all-time + per-contractor) ──────────────────────────
    try:
        meta_total = await db.execute(select(
            func.sum(MetaAdMetric.spend),
            func.sum(MetaAdMetric.conversions),
            func.avg(MetaAdMetric.roas),
            func.count(MetaAdMetric.id),
        ).where(MetaAdMetric.date >= start_date))
        mt = meta_total.first()

        # Per-contractor (top 15 by spend)
        meta_by_acct = await db.execute(select(
            MetaAdMetric.account_name,
            func.sum(MetaAdMetric.spend).label("spend"),
            func.sum(MetaAdMetric.conversions).label("leads"),
            func.sum(MetaAdMetric.clicks).label("clicks"),
            func.sum(MetaAdMetric.impressions).label("impressions"),
        ).where(MetaAdMetric.date >= start_date)
        .group_by(MetaAdMetric.account_name)
        .order_by(func.sum(MetaAdMetric.spend).desc())
        .limit(15))

        context["meta_ads"] = {
            "total_spend": float(mt[0] or 0),
            "total_conversions": float(mt[1] or 0),
            "avg_roas": float(mt[2] or 0),
            "total_records": int(mt[3] or 0),
            "by_contractor": [
                {"name": r[0] or "Unknown", "spend": round(float(r[1] or 0), 2),
                 "leads": int(r[2] or 0), "clicks": int(r[3] or 0),
                 "impressions": int(r[4] or 0)}
                for r in meta_by_acct.all()
            ],
        }
    except Exception:
        pass

    # ── Google Ads (all-time + per-customer) ──────────────────────────
    try:
        from app.models.metrics import GoogleAdMetric
        gads_total = await db.execute(select(
            func.sum(GoogleAdMetric.spend),
            func.sum(GoogleAdMetric.conversions),
            func.count(GoogleAdMetric.id),
        ).where(GoogleAdMetric.date >= start_date))
        gt = gads_total.first()
        context["google_ads"] = {
            "total_spend": float(gt[0] or 0),
            "total_conversions": float(gt[1] or 0),
            "total_records": int(gt[2] or 0),
        }
    except Exception:
        pass

    # ── HubSpot (all-time) ────────────────────────────────────────────
    try:
        hubspot_stmt = select(
            func.sum(HubSpotMetric.contacts_created),
            func.sum(HubSpotMetric.deals_created),
            func.sum(HubSpotMetric.deals_won),
            func.sum(HubSpotMetric.revenue_won),
            func.sum(HubSpotMetric.meetings_booked),
            func.sum(HubSpotMetric.tasks_completed),
            func.sum(HubSpotMetric.pipeline_value),
        ).where(HubSpotMetric.date >= start_date)
        hr = (await db.execute(hubspot_stmt)).first()
        context["hubspot"] = {
            "contacts_created": int(hr[0] or 0),
            "deals_created": int(hr[1] or 0),
            "deals_won": int(hr[2] or 0),
            "revenue_won": float(hr[3] or 0),
            "meetings_booked": int(hr[4] or 0),
            "tasks_completed": int(hr[5] or 0),
            "pipeline_value": float(hr[6] or 0),
        }
    except Exception:
        pass

    # ── GA4 web analytics (all-time, by division) ─────────────────────
    try:
        from app.models.metrics import GA4Metric
        ga4_q = await db.execute(select(
            func.sum(GA4Metric.sessions),
            func.sum(GA4Metric.total_users),
            func.avg(GA4Metric.bounce_rate),
        ).where(and_(
            GA4Metric.date >= start_date,
            GA4Metric.channel == "(all)",
            GA4Metric.source == "(all)",
            GA4Metric.device == "(all)",
        )))
        ga4 = ga4_q.first()
        context["ga4"] = {
            "total_sessions": int(ga4[0] or 0),
            "total_users": int(ga4[1] or 0),
            "avg_bounce_rate": round(float(ga4[2] or 0), 1),
        }
    except Exception:
        pass

    # ── WooCommerce (all-time) ────────────────────────────────────────
    try:
        from app.models.metrics import WCOrder, WCProduct
        wc_q = await db.execute(select(
            func.count(WCOrder.id),
            func.coalesce(func.sum(WCOrder.total), 0),
            func.coalesce(func.avg(WCOrder.total), 0),
        ).where(WCOrder.date_created >= start_date))
        wc = wc_q.first()
        prod_count = await db.execute(select(func.count()).select_from(WCProduct))
        context["woocommerce"] = {
            "total_orders": int(wc[0] or 0),
            "total_revenue": float(wc[1] or 0),
            "avg_order_value": round(float(wc[2] or 0), 2),
            "product_count": prod_count.scalar() or 0,
        }
    except Exception:
        pass

    # ── Google Sheets KPIs (exec:: TCP MAIN) ──────────────────────────
    try:
        from app.models.metrics import GoogleSheetMetric
        sheets_q = await db.execute(
            select(
                GoogleSheetMetric.metric_name,
                func.sum(GoogleSheetMetric.metric_value),
            ).where(GoogleSheetMetric.sheet_name.like("exec::%"))
            .group_by(GoogleSheetMetric.metric_name)
        )
        sheets_kpis = {r[0]: round(float(r[1] or 0), 2) for r in sheets_q.all()}
        if sheets_kpis:
            context["google_sheets_kpis"] = sheets_kpis
    except Exception:
        pass

    # ── Active contractors summary ────────────────────────────────────
    try:
        from app.models.contractor import Contractor
        contractors_q = await db.execute(
            select(Contractor.name, Contractor.meta_account_id, Contractor.meta_account_status)
            .where(and_(Contractor.active == True, Contractor.status == "active"))
            .order_by(Contractor.name)
        )
        context["active_contractors"] = [
            {"name": r[0], "meta_id": r[1], "ad_status": r[2]}
            for r in contractors_q.all()
        ]
    except Exception:
        pass

    return context


@router.post(
    "/chat",
    summary="Ask AI a question about your data",
    responses={
        200: {"description": "AI response to the question"},
        401: {"description": "Unauthorized"},
        503: {"description": "AI service not available"},
    },
)
async def chat(
    question: str = Query(..., min_length=1, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> Dict[str, Any]:
    """
    Ask a question about analytics data and get an AI-powered answer.

    The AI has context about your recent metrics and provides answers filtered
    by the user's department access level.

    Args:
        question: The question to ask about metrics.
        db: Database session.
        current_user: Current authenticated user.
        ai_service: AI service instance.

    Returns:
        Dictionary with AI response.

    Raises:
        HTTPException: If AI service fails or is not configured.
    """
    try:
        # Build metrics context
        context = await _fetch_metrics_context(db, current_user)

        # Generate response
        response = await ai_service.chat(
            question=question,
            context=context,
            user_department=current_user.department.value,
        )

        logger.info(f"User {current_user.id} asked AI question: {question[:50]}...")

        return {
            "question": question,
            "answer": response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "context_days": context["period_days"],
        }

    except Exception as e:
        logger.error(f"Error in AI chat: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service error. Please try again later.",
        )


@router.get(
    "/insights",
    summary="Get auto-generated insights about recent data trends",
    responses={
        200: {"description": "AI-generated insights"},
        401: {"description": "Unauthorized"},
        503: {"description": "AI service not available"},
    },
)
async def get_insights(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
    days: int = Query(7, ge=1, le=90, description="Days to analyze (1-90)"),
) -> Dict[str, Any]:
    """
    Get automatically generated insights about recent data trends.

    Analyzes anomalies, trends, and significant changes over the specified period.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        ai_service: AI service instance.
        days: Number of days to analyze.

    Returns:
        Dictionary with insights summary and details.

    Raises:
        HTTPException: If AI service fails.
    """
    try:
        # Build metrics context
        context = await _fetch_metrics_context(db, current_user, days=days)

        # Generate insights
        insights = await ai_service.generate_insights(
            context=context,
            user_department=current_user.department.value,
        )

        logger.info(f"User {current_user.id} retrieved AI insights for {days} days")

        return {
            "summary": insights.get("summary"),
            "key_findings": insights.get("key_findings", []),
            "anomalies": insights.get("anomalies", []),
            "recommendations": insights.get("recommendations", []),
            "period_days": days,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error(f"Error generating insights: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to generate insights. Please try again later.",
        )


@router.post(
    "/report",
    summary="Generate a natural language report",
    responses={
        200: {"description": "AI-generated natural language report"},
        401: {"description": "Unauthorized"},
        503: {"description": "AI service not available"},
    },
)
async def generate_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
    date_from: Optional[date] = Query(None, description="Report start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Report end date (YYYY-MM-DD)"),
    report_type: str = Query(
        "summary",
        regex="^(summary|detailed|executive)$",
        description="Report type: summary, detailed, or executive",
    ),
) -> Dict[str, Any]:
    """
    Generate a natural language report for a date range.

    Creates comprehensive narratives about business performance with context-aware
    analysis based on user's department access.

    Args:
        db: Database session.
        current_user: Current authenticated user.
        ai_service: AI service instance.
        date_from: Report start date (defaults to 30 days ago).
        date_to: Report end date (defaults to today).
        report_type: Type of report (summary, detailed, executive).

    Returns:
        Dictionary with AI-generated report.

    Raises:
        HTTPException: If AI service fails.
    """
    try:
        # Determine date range
        end = date_to or date.today()
        start = date_from or (end - timedelta(days=30))

        if start > end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="date_from must be before date_to",
            )

        # Build metrics context
        days = (end - start).days or 1
        context = await _fetch_metrics_context(db, current_user, days=days)

        # Generate report
        report = await ai_service.generate_report(
            context=context,
            report_type=report_type,
            user_department=current_user.department.value,
        )

        logger.info(
            f"User {current_user.id} generated {report_type} report "
            f"for {start} to {end}"
        )

        return {
            "report_type": report_type,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "content": report,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error(f"Error generating report: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to generate report. Please try again later.",
        )
