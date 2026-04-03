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
    days: int = 30,
) -> Dict[str, Any]:
    """
    Fetch metrics to build context for AI queries.

    Args:
        db: Database session.
        user: Current user for department filtering.
        days: Number of days to fetch (default 30).

    Returns:
        Dictionary with aggregated metrics.
    """
    start_date = date.today() - timedelta(days=days)
    end_date = date.today()

    # Fetch dashboard snapshots
    snapshot_stmt = select(
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

    # Add platform-specific data if user has access
    if user.department.value in [UserDepartment.MARKETING.value, UserDepartment.ALL.value] or user.role.value == "admin":
        meta_stmt = select(
            func.sum(MetaAdMetric.spend).label("spend"),
            func.sum(MetaAdMetric.conversions).label("conversions"),
            func.avg(MetaAdMetric.roas).label("roas"),
        ).where(
            and_(
                MetaAdMetric.date >= start_date,
                MetaAdMetric.date <= end_date,
            )
        )

        meta_result = await db.execute(meta_stmt)
        meta_data = meta_result.first()

        context["meta_ads"] = {
            "spend": float(meta_data[0] or 0),
            "conversions": float(meta_data[1] or 0),
            "roas": float(meta_data[2] or 0),
        }

    if user.department.value in [UserDepartment.SALES.value, UserDepartment.ALL.value] or user.role.value == "admin":
        hubspot_stmt = select(
            func.sum(HubSpotMetric.contacts_created).label("contacts"),
            func.sum(HubSpotMetric.deals_created).label("deals_created"),
            func.sum(HubSpotMetric.revenue_won).label("revenue_won"),
        ).where(
            and_(
                HubSpotMetric.date >= start_date,
                HubSpotMetric.date <= end_date,
            )
        )

        hubspot_result = await db.execute(hubspot_stmt)
        hubspot_data = hubspot_result.first()

        context["hubspot"] = {
            "contacts_created": int(hubspot_data[0] or 0),
            "deals_created": int(hubspot_data[1] or 0),
            "revenue_won": float(hubspot_data[2] or 0),
        }

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
