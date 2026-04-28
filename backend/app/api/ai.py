"""
AI chatbot and insights API router for I-Dash Analytics Platform.

Provides AI-powered questions answering about metrics, automated insights generation,
and natural language report generation using Groq API.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.metrics import HubSpotMetric, MetaAdMetric
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

    Source of truth — DO NOT use DashboardSnapshot (empty/unreliable).
    Every aggregate is pulled live from the underlying pipelines so the
    AI can't contradict the dashboards it's explaining.

    Revenue composition (all recorded in dollars):
      - HubSpot `revenue_won` — CRM closed-won deals (training + B2B)
      - Shopify orders        — CP Store
      - WooCommerce orders    — Sani-Tred retail
      - QB contractor revenue — i-bos division (google_sheet_metrics qb_revenue::)
      - TCP MAIN Total Revenue — the canonical executive figure, quarterly

    Revenue from these sources is reported BOTH individually and as a
    `composite` total so the AI can explain breakdowns. Ad spend is
    pulled live from Meta + Google Ads. Blended ROAS is ONLY returned
    when ad-attributable revenue is measurable; otherwise we emit a
    string "N/A — ad-attributable revenue not tracked separately" so
    the AI doesn't invent a number.
    """
    # Use a wide window: 2 years back to today (covers 2024-2026 backfill)
    start_date = date.today() - timedelta(days=days)
    end_date = date.today()

    context = {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }

    # ── Revenue by source ─────────────────────────────────────────────
    revenue_sources = {}

    # HubSpot revenue_won (deals actually closed in the period)
    try:
        hs_rev = await db.execute(
            select(func.coalesce(func.sum(HubSpotMetric.revenue_won), 0))
            .where(HubSpotMetric.date >= start_date)
        )
        v = float(hs_rev.scalar() or 0)
        if v > 0:
            revenue_sources["hubspot_deals_won"] = round(v, 2)
    except Exception:
        pass

    # Shopify revenue (CP Store)
    try:
        from app.models.metrics import ShopifyOrder as _SO
        sh_rev = await db.execute(
            select(func.coalesce(func.sum(_SO.total), 0))
            .where(and_(_SO.date_created >= start_date, _SO.date_created <= end_date))
        )
        v = float(sh_rev.scalar() or 0)
        if v > 0:
            revenue_sources["shopify_cp_store"] = round(v, 2)
    except Exception:
        pass

    # WooCommerce revenue (Sani-Tred) — successful statuses only so the
    # AI quotes match what the dashboards display.
    try:
        from app.models.metrics import WCOrder as _WC, SUCCESSFUL_WC_STATUSES as _OK
        wc_rev = await db.execute(
            select(func.coalesce(func.sum(_WC.total), 0))
            .where(and_(
                _WC.date_created >= start_date,
                _WC.date_created <= end_date,
                _WC.status.in_(_OK),
            ))
        )
        v = float(wc_rev.scalar() or 0)
        if v > 0:
            revenue_sources["woocommerce_sanitred"] = round(v, 2)
    except Exception:
        pass

    # QB contractor revenue (i-bos division)
    try:
        from app.models.metrics import GoogleSheetMetric as _GSM
        qb_rev = await db.execute(
            select(func.coalesce(func.sum(_GSM.metric_value), 0))
            .where(and_(
                _GSM.sheet_name.like("qb_revenue::%"),
                _GSM.date >= start_date, _GSM.date <= end_date,
            ))
        )
        v = float(qb_rev.scalar() or 0)
        if v > 0:
            revenue_sources["qb_contractors_ibos"] = round(v, 2)
    except Exception:
        pass

    # TCP MAIN Total Revenue (canonical executive figure, quarterly)
    try:
        from app.models.metrics import GoogleSheetMetric as _GSM
        tcp_rev = await db.execute(
            select(func.coalesce(func.sum(_GSM.metric_value), 0))
            .where(and_(
                _GSM.sheet_name.like("exec::%"),
                _GSM.metric_name == "Total Revenue",
                _GSM.date >= start_date, _GSM.date <= end_date,
            ))
        )
        v = float(tcp_rev.scalar() or 0)
        if v > 0:
            revenue_sources["tcp_main_total_revenue"] = round(v, 2)
    except Exception:
        pass

    context["revenue_sources"] = revenue_sources
    # Composite = sum of everything EXCEPT TCP MAIN (which is already
    # an aggregate of the other sources at the quarterly level). The
    # AI should quote tcp_main_total_revenue as the "official" figure
    # and the others as drill-downs.
    composite = sum(v for k, v in revenue_sources.items() if k != "tcp_main_total_revenue")
    context["composite_revenue_ex_tcp"] = round(composite, 2)
    context["total_revenue_tcp_main"] = revenue_sources.get("tcp_main_total_revenue", 0)

    # ── Ad spend + leads (live, division-aware) ───────────────────────
    total_ad_spend = 0.0
    total_ad_leads = 0
    try:
        ads_row = (await db.execute(select(
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
        ).where(MetaAdMetric.date >= start_date))).first()
        total_ad_spend += float(ads_row[0] or 0)
        total_ad_leads += int(ads_row[1] or 0)
    except Exception:
        pass
    try:
        from app.models.metrics import GoogleAdMetric as _GAM
        gads_row = (await db.execute(select(
            func.coalesce(func.sum(_GAM.spend), 0),
            func.coalesce(func.sum(_GAM.conversions), 0),
        ).where(_GAM.date >= start_date))).first()
        total_ad_spend += float(gads_row[0] or 0)
        total_ad_leads += int(gads_row[1] or 0)
    except Exception:
        pass
    context["total_ad_spend"] = round(total_ad_spend, 2)
    context["total_leads"] = total_ad_leads

    # HubSpot deals for blended metrics
    deals_won = 0
    try:
        dw = await db.execute(
            select(func.coalesce(func.sum(HubSpotMetric.deals_won), 0))
            .where(HubSpotMetric.date >= start_date)
        )
        deals_won = int(dw.scalar() or 0)
    except Exception:
        pass
    context["total_deals_won"] = deals_won

    # Blended ROAS — only compute if ad-attributable revenue is
    # identifiable. We don't pretend to know how much of HubSpot /
    # Shopify / WC revenue was ad-driven; pass an honest string so
    # the AI doesn't invent a number.
    context["blended_roas"] = "N/A — ad-attributable revenue is not tracked separately from organic/direct. Do NOT compute or claim a ROAS figure from total revenue / ad spend."

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
        from app.models.metrics import WCOrder, WCProduct, SUCCESSFUL_WC_STATUSES
        wc_q = await db.execute(select(
            func.count(WCOrder.id),
            func.coalesce(func.sum(WCOrder.total), 0),
            func.coalesce(func.avg(WCOrder.total), 0),
        ).where(and_(
            WCOrder.date_created >= start_date,
            WCOrder.status.in_(SUCCESSFUL_WC_STATUSES),
        )))
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

    # ── Per-brand performance breakdown ───────────────────────────────
    # Each brand's ad spend + leads, so the AI can rank brands and
    # speak about them specifically without having to re-derive from
    # account IDs. Mirrors the brand-summary endpoint's division gate.
    brand_performance: Dict[str, Dict[str, float]] = {}
    for brand_slug in ("cp", "sanitred", "ibos"):
        div_values = [brand_slug]
        if brand_slug == "ibos":
            div_values.append("i-bos")
        try:
            m_row = (await db.execute(select(
                func.coalesce(func.sum(MetaAdMetric.spend), 0),
                func.coalesce(func.sum(MetaAdMetric.conversions), 0),
                func.coalesce(func.sum(MetaAdMetric.clicks), 0),
            ).where(and_(
                MetaAdMetric.date >= start_date,
                MetaAdMetric.division.in_(div_values),
            )))).first()
            from app.models.metrics import GoogleAdMetric as _GAM
            g_row = (await db.execute(select(
                func.coalesce(func.sum(_GAM.spend), 0),
                func.coalesce(func.sum(_GAM.conversions), 0),
                func.coalesce(func.sum(_GAM.clicks), 0),
            ).where(and_(
                _GAM.date >= start_date,
                _GAM.division.in_(div_values),
            )))).first()
            spend = float(m_row[0] or 0) + float(g_row[0] or 0)
            leads = int((m_row[1] or 0) + (g_row[1] or 0))
            clicks = int((m_row[2] or 0) + (g_row[2] or 0))
            brand_performance[brand_slug] = {
                "ad_spend": round(spend, 2),
                "ad_leads": leads,
                "ad_clicks": clicks,
                "cost_per_lead": round(spend / leads, 2) if leads > 0 else 0,
            }
        except Exception:
            pass
    if brand_performance:
        context["by_brand"] = brand_performance

    # ── Top + bottom contractors by ROAS (I-BOS only) ─────────────────
    # Join Meta ad spend/leads by account against QB revenue by contractor
    # name to rank marketing efficiency. Uses the same normalisation that
    # /all-contractors-revenue uses.
    try:
        from app.models.metrics import GoogleSheetMetric as _GSM2
        meta_by_acct = (await db.execute(select(
            MetaAdMetric.account_name,
            func.coalesce(func.sum(MetaAdMetric.spend), 0).label("spend"),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0).label("leads"),
        ).where(and_(
            MetaAdMetric.date >= start_date,
            MetaAdMetric.division.in_(["ibos", "i-bos"]),
            MetaAdMetric.account_name.isnot(None),
        ))
        .group_by(MetaAdMetric.account_name)
        .having(func.sum(MetaAdMetric.spend) > 0))).all()

        qb_by_name = (await db.execute(select(
            _GSM2.metric_name,
            func.coalesce(func.sum(_GSM2.metric_value), 0).label("rev"),
        ).where(and_(
            _GSM2.sheet_name.like("qb_revenue::%"),
            _GSM2.date >= start_date, _GSM2.date <= end_date,
        ))
        .group_by(_GSM2.metric_name))).all()

        def _nrm(s):
            if not s: return ""
            s = s.lower()
            for tok in ("llc", "inc.", "inc", ".com", ".co", "[meta]"):
                s = s.replace(tok, "")
            return "".join(ch for ch in s if ch.isalnum())
        qb_lookup = {_nrm(r[0]): float(r[1] or 0) for r in qb_by_name}

        ranked = []
        for name, spend, leads in meta_by_acct:
            rev = qb_lookup.get(_nrm(name), 0.0)
            roas = (rev / spend) if spend > 0 else 0
            cpl = (spend / leads) if leads > 0 else 0
            ranked.append({
                "name": name,
                "spend": round(float(spend), 2),
                "leads": int(leads or 0),
                "revenue": round(rev, 2),
                "roas": round(roas, 2),
                "cpl": round(cpl, 2),
            })
        ranked.sort(key=lambda c: c["roas"], reverse=True)
        if ranked:
            context["contractor_roas_ranking"] = {
                "top_3": ranked[:3],
                "bottom_3": [c for c in ranked if c["spend"] > 100][-3:][::-1],
                "total_ranked": len(ranked),
            }
    except Exception:
        pass

    # ── Per-contractor full performance (Meta + Google Ads + QB rev) ──
    # The chatbot's prompt builder looks for a flat "contractors" list. Build
    # it live here from meta_ad_metrics + google_ad_metrics + qb_revenue::
    # so the AI never falls back to the hardcoded CONTRACTOR_MARKETING_DATA
    # constant in ai_service.py (which had stale Floor Warriors=$0 entries
    # that contradicted the dashboard during the Will Fowler demo).
    try:
        from app.models.metrics import GoogleSheetMetric as _GSM3, GoogleAdMetric as _GAM3

        meta_rows = (await db.execute(select(
            MetaAdMetric.account_name,
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
            func.coalesce(func.sum(MetaAdMetric.clicks), 0),
        ).where(and_(
            MetaAdMetric.date >= start_date,
            MetaAdMetric.account_name.isnot(None),
        )).group_by(MetaAdMetric.account_name))).all()

        # google_ad_metrics rows carry only customer_id, not contractor name.
        # Map the two known I-BOS CIDs to their contractors (per project
        # canonical mapping: 6754610688 = Tailored Concrete Coatings,
        # 2957400868 = SLG Contracting Inc.). Anything else falls under the
        # CID string so the AI can still talk about it specifically.
        GADS_CID_TO_NAME = {
            "6754610688": "Tailored Concrete Coatings",
            "2957400868": "SLG Contracting Inc.",
        }
        gads_raw = (await db.execute(select(
            _GAM3.customer_id,
            func.coalesce(func.sum(_GAM3.spend), 0),
            func.coalesce(func.sum(_GAM3.conversions), 0),
            func.coalesce(func.sum(_GAM3.clicks), 0),
        ).where(_GAM3.date >= start_date).group_by(_GAM3.customer_id))).all()
        gads_rows = [
            (
                GADS_CID_TO_NAME.get(str(cid).strip(), f"Google Ads {cid}"),
                spend, leads, clicks,
            )
            for cid, spend, leads, clicks in gads_raw
            if cid is not None
        ]

        qb_rows = (await db.execute(select(
            _GSM3.metric_name,
            func.coalesce(func.sum(_GSM3.metric_value), 0),
        ).where(and_(
            _GSM3.sheet_name.like("qb_revenue::%"),
            _GSM3.date >= start_date,
        )).group_by(_GSM3.metric_name))).all()

        def _norm(s: Optional[str]) -> str:
            if not s:
                return ""
            s = s.lower()
            for tok in ("llc", "inc.", "inc", ".com", ".co", "[meta]", "(", ")", "-"):
                s = s.replace(tok, " ")
            return " ".join(s.split())

        merged: Dict[str, Dict[str, Any]] = {}
        for name, spend, leads, clicks in meta_rows:
            key = _norm(name)
            if not key:
                continue
            merged.setdefault(key, {"name": name, "spend": 0.0, "leads": 0, "clicks": 0, "revenue": 0.0})
            merged[key]["spend"] += float(spend or 0)
            merged[key]["leads"] += int(leads or 0)
            merged[key]["clicks"] += int(clicks or 0)
        for name, spend, leads, clicks in gads_rows:
            key = _norm(name)
            if not key:
                continue
            merged.setdefault(key, {"name": name, "spend": 0.0, "leads": 0, "clicks": 0, "revenue": 0.0})
            merged[key]["spend"] += float(spend or 0)
            merged[key]["leads"] += int(leads or 0)
            merged[key]["clicks"] += int(clicks or 0)
        for qname, qrev in qb_rows:
            key = _norm(qname)
            if not key:
                continue
            merged.setdefault(key, {"name": qname, "spend": 0.0, "leads": 0, "clicks": 0, "revenue": 0.0})
            merged[key]["revenue"] += float(qrev or 0)

        contractor_list: List[Dict[str, Any]] = []
        for c in merged.values():
            spend = c["spend"]
            leads = c["leads"]
            revenue = c["revenue"]
            roas = round(revenue / spend, 2) if spend > 0 else None
            cpl = round(spend / leads, 2) if leads > 0 else 0
            contractor_list.append({
                "name": c["name"],
                "spend": round(spend, 2),
                "leads": leads,
                "clicks": c["clicks"],
                "revenue": round(revenue, 2),
                "roas": roas,
                "cpl": cpl,
            })
        contractor_list.sort(key=lambda r: r["spend"], reverse=True)
        if contractor_list:
            context["contractors"] = contractor_list
    except Exception as exc:
        logger.warning(f"Failed to build live per-contractor context: {exc}")

    # ── Period-over-period comparison ─────────────────────────────────
    # Same-length window immediately prior to the selected range, so the
    # AI can say "spend is up 23% vs the prior period" instead of only
    # citing the period total.
    try:
        prior_end = start_date - timedelta(days=1)
        prior_start = prior_end - (end_date - start_date)
        prior = {}
        prior_ads_meta = (await db.execute(select(
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
        ).where(and_(MetaAdMetric.date >= prior_start, MetaAdMetric.date <= prior_end)))).first()
        from app.models.metrics import GoogleAdMetric as _GAM2
        prior_ads_gads = (await db.execute(select(
            func.coalesce(func.sum(_GAM2.spend), 0),
            func.coalesce(func.sum(_GAM2.conversions), 0),
        ).where(and_(_GAM2.date >= prior_start, _GAM2.date <= prior_end)))).first()
        prior["ad_spend"] = round(
            float(prior_ads_meta[0] or 0) + float(prior_ads_gads[0] or 0), 2
        )
        prior["ad_leads"] = int((prior_ads_meta[1] or 0) + (prior_ads_gads[1] or 0))
        prior_hs = (await db.execute(select(
            func.coalesce(func.sum(HubSpotMetric.deals_won), 0),
            func.coalesce(func.sum(HubSpotMetric.revenue_won), 0),
        ).where(HubSpotMetric.date >= prior_start))).first()
        prior["hubspot_deals_won"] = int(prior_hs[0] or 0)
        prior["hubspot_revenue_won"] = round(float(prior_hs[1] or 0), 2)
        prior["period_start"] = prior_start.isoformat()
        prior["period_end"] = prior_end.isoformat()
        context["prior_period"] = prior
    except Exception:
        pass

    return context


class ChatTurn(BaseModel):
    """One turn of the chat history. Mirrors the OpenAI/Groq schema."""
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., max_length=4000)


class DashboardState(BaseModel):
    """Snapshot of what the user is looking at when they ask a question.

    All fields optional — frontend only sends what's currently visible.
    """
    page: Optional[str] = Field(None, description="e.g. 'Executive Summary'")
    brand: Optional[str] = Field(None, description="cp | sanitred | ibos")
    date_range: Optional[str] = Field(None, description="e.g. 'Jan 1 – Apr 28, 2026'")
    visible_kpis: Optional[Dict[str, Any]] = Field(None, description="label → value")


class ChatRequest(BaseModel):
    """Body for /ai/chat. Backwards compatible with the legacy
    ?question= query-string call: when no body is sent the route
    accepts the question as a query param instead."""
    question: str = Field(..., min_length=1, max_length=1000)
    history: List[ChatTurn] = Field(default_factory=list, description="Prior turns, oldest first. Last 10 are kept.")
    dashboard_state: Optional[DashboardState] = None


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
    request: Optional[ChatRequest] = Body(None),
    question: Optional[str] = Query(None, min_length=1, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> Dict[str, Any]:
    """
    Ask a question about analytics data and get an AI-powered answer.

    Accepts either:
      - JSON body { question, history?, dashboard_state? } (preferred)
      - Legacy ?question=... query string (backwards compatible)

    The AI is given:
      - The full live metrics context (rebuilt fresh on every call)
      - The last 10 turns of conversation history
      - The user's current dashboard view-state (page, brand, date range,
        visible KPI values) so it can resolve "this number" / "that chart"
    """
    if request is not None:
        q = request.question
        history = [t.dict() for t in request.history[-10:]]
        dash_state = request.dashboard_state.dict() if request.dashboard_state else None
    elif question:
        q = question
        history = []
        dash_state = None
    else:
        raise HTTPException(status_code=400, detail="Missing question")

    try:
        # Build metrics context
        context = await _fetch_metrics_context(db, current_user)

        # Generate response
        response = await ai_service.chat(
            question=q,
            context=context,
            user_department=current_user.department.value,
            history=history,
            dashboard_state=dash_state,
        )

        logger.info(f"User {current_user.id} asked AI question: {q[:50]}... (history={len(history)} turns)")

        return {
            "question": q,
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
    days: int = Query(7, ge=1, le=1095, description="Days to analyze (1-1095, ~3 years)"),
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
