"""
Google Analytics 4 (GA4) data pipeline for I-Dash Analytics Platform.

Extracts web analytics metrics from the GA4 Data API and loads
into GA4Metric records with session, user, and engagement data.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
    RunReportResponse,
)

from app.core.config import settings
from app.models.metrics import GA4Metric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class GoogleAnalyticsPipeline(BasePipeline):
    """
    Extract and load Google Analytics 4 web metrics.

    Connects to GA4 Data API and extracts property-level web analytics:
    - Sessions, Users, New Users
    - Page Views, Screen Page Views
    - Avg Session Duration, Bounce Rate
    - Conversions, Event Count
    - Traffic source breakdown (channel, medium, source)

    Data is aggregated by date and traffic source dimensions.
    Supports filtering by date range and specific property IDs.
    """

    def __init__(
        self,
        property_id: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        **kwargs,
    ) -> None:
        """
        Initialize GA4 pipeline.

        Args:
            property_id: GA4 property ID (e.g. '123456789'). Falls back to config.
            start_date: Start of date range to fetch (default: 30 days ago).
            end_date: End of date range to fetch (default: today).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="google_analytics_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date
        self.property_id = property_id or settings.GA4_PROPERTY_ID

        # Validate configuration
        if not self.property_id:
            raise ValueError("GA4_PROPERTY_ID must be configured")

        if not settings.GA4_CREDENTIALS_JSON:
            raise ValueError(
                "GA4_CREDENTIALS_JSON must be configured "
                "(path to service account JSON)"
            )

        # Initialize GA4 Data API client
        import os
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = (
            settings.GA4_CREDENTIALS_JSON
        )
        self.client = BetaAnalyticsDataClient()

    async def extract(self) -> Dict[str, Any]:
        """
        Extract web analytics data from GA4 Data API.

        Runs two reports:
        1. Daily overview (sessions, users, pageviews, bounce rate, etc.)
        2. Traffic source breakdown by channel grouping

        Returns:
            Dictionary with:
                - overview: List of daily overview records
                - traffic_sources: List of traffic source records
        """
        try:
            self.logger.info(
                f"Extracting GA4 data for property {self.property_id} "
                f"from {self.start_date} to {self.end_date}"
            )

            overview_data = await self._get_daily_overview()
            traffic_data = await self._get_traffic_sources()
            device_data = await self._get_device_breakdown()

            self.logger.debug(
                f"Fetched {len(overview_data)} overview rows, "
                f"{len(traffic_data)} traffic rows, "
                f"{len(device_data)} device rows"
            )

            return {
                "overview": overview_data,
                "traffic_sources": traffic_data,
                "devices": device_data,
            }

        except Exception as e:
            self.logger.error(f"Error extracting GA4 data: {str(e)}")
            raise

    async def _get_daily_overview(self) -> List[Dict[str, Any]]:
        """Fetch daily overview metrics from GA4."""
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{self.property_id}",
                dimensions=[Dimension(name="date")],
                metrics=[
                    Metric(name="sessions"),
                    Metric(name="totalUsers"),
                    Metric(name="newUsers"),
                    Metric(name="screenPageViews"),
                    Metric(name="averageSessionDuration"),
                    Metric(name="bounceRate"),
                    Metric(name="conversions"),
                    Metric(name="eventCount"),
                    Metric(name="engagedSessions"),
                    Metric(name="engagementRate"),
                ],
                date_ranges=[
                    DateRange(
                        start_date=self.start_date.isoformat(),
                        end_date=self.end_date.isoformat(),
                    )
                ],
            )

            response = self.client.run_report(request)

            for row in response.rows:
                rows.append({
                    "date": row.dimension_values[0].value,
                    "sessions": int(row.metric_values[0].value),
                    "total_users": int(row.metric_values[1].value),
                    "new_users": int(row.metric_values[2].value),
                    "page_views": int(row.metric_values[3].value),
                    "avg_session_duration": float(row.metric_values[4].value),
                    "bounce_rate": float(row.metric_values[5].value),
                    "conversions": int(row.metric_values[6].value),
                    "event_count": int(row.metric_values[7].value),
                    "engaged_sessions": int(row.metric_values[8].value),
                    "engagement_rate": float(row.metric_values[9].value),
                })

        except Exception as e:
            self.logger.warning(f"Error fetching daily overview: {str(e)}")

        return rows

    async def _get_traffic_sources(self) -> List[Dict[str, Any]]:
        """Fetch traffic source breakdown from GA4."""
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{self.property_id}",
                dimensions=[
                    Dimension(name="date"),
                    Dimension(name="sessionDefaultChannelGroup"),
                    Dimension(name="sessionSource"),
                    Dimension(name="sessionMedium"),
                ],
                metrics=[
                    Metric(name="sessions"),
                    Metric(name="totalUsers"),
                    Metric(name="conversions"),
                    Metric(name="bounceRate"),
                ],
                date_ranges=[
                    DateRange(
                        start_date=self.start_date.isoformat(),
                        end_date=self.end_date.isoformat(),
                    )
                ],
            )

            response = self.client.run_report(request)

            for row in response.rows:
                rows.append({
                    "date": row.dimension_values[0].value,
                    "channel": row.dimension_values[1].value,
                    "source": row.dimension_values[2].value,
                    "medium": row.dimension_values[3].value,
                    "sessions": int(row.metric_values[0].value),
                    "users": int(row.metric_values[1].value),
                    "conversions": int(row.metric_values[2].value),
                    "bounce_rate": float(row.metric_values[3].value),
                })

        except Exception as e:
            self.logger.warning(f"Error fetching traffic sources: {str(e)}")

        return rows

    async def _get_device_breakdown(self) -> List[Dict[str, Any]]:
        """Fetch device category breakdown from GA4."""
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{self.property_id}",
                dimensions=[
                    Dimension(name="date"),
                    Dimension(name="deviceCategory"),
                ],
                metrics=[
                    Metric(name="sessions"),
                    Metric(name="totalUsers"),
                    Metric(name="screenPageViews"),
                    Metric(name="bounceRate"),
                ],
                date_ranges=[
                    DateRange(
                        start_date=self.start_date.isoformat(),
                        end_date=self.end_date.isoformat(),
                    )
                ],
            )

            response = self.client.run_report(request)

            for row in response.rows:
                rows.append({
                    "date": row.dimension_values[0].value,
                    "device": row.dimension_values[1].value,
                    "sessions": int(row.metric_values[0].value),
                    "users": int(row.metric_values[1].value),
                    "page_views": int(row.metric_values[2].value),
                    "bounce_rate": float(row.metric_values[3].value),
                })

        except Exception as e:
            self.logger.warning(f"Error fetching device breakdown: {str(e)}")

        return rows

    async def transform(self, raw_data: Dict[str, Any]) -> List["GA4Metric"]:
        """
        Transform GA4 data into metric records.

        Merges daily overview with traffic source data to create
        GA4Metric instances with full analytics context.

        Args:
            raw_data: Dictionary with overview, traffic_sources, and devices data.

        Returns:
            List of GA4Metric instances.
        """
        try:
            records = []

            # Process daily overview rows
            for row in raw_data.get("overview", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue

                    # GA4 returns dates as YYYYMMDD
                    try:
                        metric_date = datetime.strptime(date_str, "%Y%m%d").date()
                    except ValueError:
                        try:
                            metric_date = datetime.strptime(
                                date_str, "%Y-%m-%d"
                            ).date()
                        except ValueError:
                            self.logger.debug(f"Invalid date: {date_str}")
                            continue

                    record = GA4Metric(
                        date=metric_date,
                        property_id=self.property_id,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("total_users", 0),
                        new_users=row.get("new_users", 0),
                        page_views=row.get("page_views", 0),
                        avg_session_duration=round(
                            row.get("avg_session_duration", 0.0), 2
                        ),
                        bounce_rate=round(
                            row.get("bounce_rate", 0.0) * 100, 2
                        ),
                        conversions=row.get("conversions", 0),
                        event_count=row.get("event_count", 0),
                        engaged_sessions=row.get("engaged_sessions", 0),
                        engagement_rate=round(
                            row.get("engagement_rate", 0.0) * 100, 2
                        ),
                        channel="(all)",
                        source="(all)",
                        medium="(all)",
                        device="(all)",
                    )
                    records.append(record)

                except Exception as e:
                    self.logger.warning(
                        f"Error processing GA4 overview row: {str(e)}"
                    )
                    continue

            # Process traffic source rows
            for row in raw_data.get("traffic_sources", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue

                    try:
                        metric_date = datetime.strptime(date_str, "%Y%m%d").date()
                    except ValueError:
                        try:
                            metric_date = datetime.strptime(
                                date_str, "%Y-%m-%d"
                            ).date()
                        except ValueError:
                            continue

                    record = GA4Metric(
                        date=metric_date,
                        property_id=self.property_id,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("users", 0),
                        new_users=0,
                        page_views=0,
                        avg_session_duration=0.0,
                        bounce_rate=round(
                            row.get("bounce_rate", 0.0) * 100, 2
                        ),
                        conversions=row.get("conversions", 0),
                        event_count=0,
                        engaged_sessions=0,
                        engagement_rate=0.0,
                        channel=row.get("channel", "(not set)"),
                        source=row.get("source", "(not set)"),
                        medium=row.get("medium", "(not set)"),
                        device="(all)",
                    )
                    records.append(record)

                except Exception as e:
                    self.logger.warning(
                        f"Error processing traffic source row: {str(e)}"
                    )
                    continue

            # Process device rows
            for row in raw_data.get("devices", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue

                    try:
                        metric_date = datetime.strptime(date_str, "%Y%m%d").date()
                    except ValueError:
                        try:
                            metric_date = datetime.strptime(
                                date_str, "%Y-%m-%d"
                            ).date()
                        except ValueError:
                            continue

                    record = GA4Metric(
                        date=metric_date,
                        property_id=self.property_id,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("users", 0),
                        new_users=0,
                        page_views=row.get("page_views", 0),
                        avg_session_duration=0.0,
                        bounce_rate=round(
                            row.get("bounce_rate", 0.0) * 100, 2
                        ),
                        conversions=0,
                        event_count=0,
                        engaged_sessions=0,
                        engagement_rate=0.0,
                        channel="(all)",
                        source="(all)",
                        medium="(all)",
                        device=row.get("device", "(not set)"),
                    )
                    records.append(record)

                except Exception as e:
                    self.logger.warning(
                        f"Error processing device row: {str(e)}"
                    )
                    continue

            self.logger.info(
                f"Transformed {len(records)} GA4 metric records"
            )
            return records

        except Exception as e:
            self.logger.error(f"Error transforming GA4 data: {str(e)}")
            raise
