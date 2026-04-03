"""
Dashboard Snapshot aggregation pipeline for I-Dash Analytics Platform.

Aggregates data from all metric tables and computes KPIs for dashboard display,
including ROAS, cost per lead, and lead-to-deal conversion rates.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.metrics import (
    DashboardSnapshot,
    GoogleAdMetric,
    GoogleSheetMetric,
    HubSpotMetric,
    MetaAdMetric,
)
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class SnapshotPipeline(BasePipeline):
    """
    Aggregate metrics into dashboard snapshots.

    Reads from all metric tables and computes aggregated KPIs:
    - Total revenue
    - Total ad spend
    - Total leads
    - Total deals won
    - Blended ROAS
    - Cost per lead
    - Lead-to-deal conversion rate

    Creates DashboardSnapshot records for efficient dashboard queries.
    """

    def __init__(
        self,
        start_date: datetime = None,
        end_date: datetime = None,
        **kwargs,
    ) -> None:
        """
        Initialize Snapshot pipeline.

        Args:
            start_date: Start of date range to aggregate (default: 30 days ago).
            end_date: End of date range to aggregate (default: today).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="snapshot_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date

    async def extract(self) -> Dict[str, Any]:
        """
        Extract aggregated metrics from all source tables.

        Queries HubSpot, Meta Ads, Google Ads, and Google Sheets tables
        for data within the date range.

        Returns:
            Dictionary with aggregated metrics:
                - hubspot_metrics: List of HubSpot records
                - meta_ads_metrics: List of Meta Ads records
                - google_ads_metrics: List of Google Ads records
                - google_sheets_metrics: List of Google Sheets records
        """
        try:
            self.logger.info(
                f"Extracting snapshot data from {self.start_date} "
                f"to {self.end_date}"
            )

            async with async_session_maker() as session:
                # Get HubSpot metrics
                hubspot_metrics = await self._get_hubspot_metrics(session)
                self.logger.debug(
                    f"Fetched {len(hubspot_metrics)} HubSpot records"
                )

                # Get Meta Ads metrics
                meta_ads_metrics = await self._get_meta_ads_metrics(session)
                self.logger.debug(
                    f"Fetched {len(meta_ads_metrics)} Meta Ads records"
                )

                # Get Google Ads metrics
                google_ads_metrics = await self._get_google_ads_metrics(session)
                self.logger.debug(
                    f"Fetched {len(google_ads_metrics)} Google Ads records"
                )

                # Get Google Sheets metrics
                google_sheets_metrics = await self._get_google_sheets_metrics(
                    session
                )
                self.logger.debug(
                    f"Fetched {len(google_sheets_metrics)} "
                    f"Google Sheets records"
                )

            return {
                "hubspot_metrics": hubspot_metrics,
                "meta_ads_metrics": meta_ads_metrics,
                "google_ads_metrics": google_ads_metrics,
                "google_sheets_metrics": google_sheets_metrics,
            }

        except Exception as e:
            self.logger.error(f"Error extracting snapshot data: {str(e)}")
            raise

    async def _get_hubspot_metrics(self, session: AsyncSession) -> List[dict]:
        """Fetch HubSpot metrics for the date range."""
        try:
            stmt = select(HubSpotMetric).where(
                HubSpotMetric.date >= self.start_date,
                HubSpotMetric.date <= self.end_date,
            )
            result = await session.execute(stmt)
            metrics = result.scalars().all()
            return [
                {
                    "date": m.date,
                    "revenue_won": m.revenue_won,
                    "deals_won": m.deals_won,
                    "contacts_created": m.contacts_created,
                }
                for m in metrics
            ]
        except Exception as e:
            self.logger.warning(f"Error fetching HubSpot metrics: {str(e)}")
            return []

    async def _get_meta_ads_metrics(self, session: AsyncSession) -> List[dict]:
        """Fetch Meta Ads metrics for the date range."""
        try:
            stmt = select(MetaAdMetric).where(
                MetaAdMetric.date >= self.start_date,
                MetaAdMetric.date <= self.end_date,
            )
            result = await session.execute(stmt)
            metrics = result.scalars().all()
            return [
                {
                    "date": m.date,
                    "spend": m.spend,
                    "conversion_value": m.conversion_value,
                    "conversions": m.conversions,
                }
                for m in metrics
            ]
        except Exception as e:
            self.logger.warning(f"Error fetching Meta Ads metrics: {str(e)}")
            return []

    async def _get_google_ads_metrics(self, session: AsyncSession) -> List[dict]:
        """Fetch Google Ads metrics for the date range."""
        try:
            stmt = select(GoogleAdMetric).where(
                GoogleAdMetric.date >= self.start_date,
                GoogleAdMetric.date <= self.end_date,
            )
            result = await session.execute(stmt)
            metrics = result.scalars().all()
            return [
                {
                    "date": m.date,
                    "spend": m.spend,
                    "conversion_value": m.conversion_value,
                    "conversions": m.conversions,
                }
                for m in metrics
            ]
        except Exception as e:
            self.logger.warning(f"Error fetching Google Ads metrics: {str(e)}")
            return []

    async def _get_google_sheets_metrics(
        self, session: AsyncSession
    ) -> List[dict]:
        """Fetch Google Sheets metrics for the date range."""
        try:
            stmt = select(GoogleSheetMetric).where(
                GoogleSheetMetric.date >= self.start_date,
                GoogleSheetMetric.date <= self.end_date,
            )
            result = await session.execute(stmt)
            metrics = result.scalars().all()
            return [
                {
                    "date": m.date,
                    "metric_name": m.metric_name,
                    "metric_value": m.metric_value,
                    "category": m.category,
                }
                for m in metrics
            ]
        except Exception as e:
            self.logger.warning(
                f"Error fetching Google Sheets metrics: {str(e)}"
            )
            return []

    async def transform(self, raw_data: Dict[str, Any]) -> List[DashboardSnapshot]:
        """
        Aggregate metrics into daily snapshots with computed KPIs.

        Calculates total revenue, ad spend, leads, deals won, ROAS,
        cost per lead, and conversion rates.

        Args:
            raw_data: Dictionary with metrics from all sources.

        Returns:
            List of DashboardSnapshot instances.
        """
        try:
            # Build daily aggregations
            daily_data: Dict[str, Dict[str, Any]] = {}

            # Initialize dates
            current_date = self.start_date
            while current_date <= self.end_date:
                date_key = current_date.isoformat()
                daily_data[date_key] = {
                    "date": current_date,
                    "total_revenue": 0.0,
                    "total_ad_spend": 0.0,
                    "total_leads": 0,
                    "total_deals_won": 0,
                    "ad_conversions": 0.0,
                    "ad_conversion_value": 0.0,
                }
                current_date += timedelta(days=1)

            # Aggregate HubSpot metrics
            for metric in raw_data.get("hubspot_metrics", []):
                date_key = metric["date"].isoformat()
                if date_key in daily_data:
                    daily_data[date_key]["total_revenue"] += metric.get(
                        "revenue_won", 0
                    )
                    daily_data[date_key]["total_deals_won"] += metric.get(
                        "deals_won", 0
                    )
                    daily_data[date_key]["total_leads"] += metric.get(
                        "contacts_created", 0
                    )

            # Aggregate Meta Ads metrics
            for metric in raw_data.get("meta_ads_metrics", []):
                date_key = metric["date"].isoformat()
                if date_key in daily_data:
                    daily_data[date_key]["total_ad_spend"] += metric.get(
                        "spend", 0
                    )
                    daily_data[date_key]["ad_conversions"] += metric.get(
                        "conversions", 0
                    )
                    daily_data[date_key]["ad_conversion_value"] += (
                        metric.get("conversion_value", 0)
                    )

            # Aggregate Google Ads metrics
            for metric in raw_data.get("google_ads_metrics", []):
                date_key = metric["date"].isoformat()
                if date_key in daily_data:
                    daily_data[date_key]["total_ad_spend"] += metric.get(
                        "spend", 0
                    )
                    daily_data[date_key]["ad_conversions"] += metric.get(
                        "conversions", 0
                    )
                    daily_data[date_key]["ad_conversion_value"] += (
                        metric.get("conversion_value", 0)
                    )

            # Create snapshots with calculated KPIs
            records = []
            for date_key, data in daily_data.items():
                # Calculate KPIs
                blended_roas = (
                    (
                        data["ad_conversion_value"] / data["total_ad_spend"]
                    )
                    if data["total_ad_spend"] > 0
                    else 0.0
                )

                cost_per_lead = (
                    (data["total_ad_spend"] / data["total_leads"])
                    if data["total_leads"] > 0
                    else 0.0
                )

                lead_to_deal_rate = (
                    (
                        data["total_deals_won"] / data["total_leads"] * 100
                    )
                    if data["total_leads"] > 0
                    else 0.0
                )

                record = DashboardSnapshot(
                    date=data["date"],
                    total_revenue=round(data["total_revenue"], 2),
                    total_ad_spend=round(data["total_ad_spend"], 2),
                    total_leads=data["total_leads"],
                    total_deals_won=data["total_deals_won"],
                    blended_roas=round(blended_roas, 2),
                    cost_per_lead=round(cost_per_lead, 2),
                    lead_to_deal_rate=round(lead_to_deal_rate, 2),
                )
                records.append(record)

            self.logger.info(
                f"Transformed {len(records)} dashboard snapshot records"
            )
            return records

        except Exception as e:
            self.logger.error(f"Error transforming snapshot data: {str(e)}")
            raise
