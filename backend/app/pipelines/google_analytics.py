"""
Google Analytics 4 (GA4) data pipeline for I-Dash Analytics Platform.

Two operating modes:
    1. **Discovery mode** (default when no property_id given):
       Runs account-level discovery across all five target accounts,
       persists properties to ga4_properties table, auto-creates DCKN
       contractors, then extracts data for all enabled properties.

    2. **Single-property mode** (explicit property_id):
       Extracts data for one specific GA4 property (legacy behaviour).
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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

    Phase 1: Account-level property discovery
    Phase 2: Data extraction for each enabled property
    """

    def __init__(
        self,
        property_id: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        **kwargs,
    ) -> None:
        super().__init__(name="google_analytics_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date
        self.property_id = property_id or settings.GA4_PROPERTY_ID
        self.discovery_mode = not self.property_id

        if not settings.GA4_CREDENTIALS_JSON:
            raise ValueError(
                "GA4_CREDENTIALS_JSON must be configured "
                "(JSON string or path to service account JSON)"
            )

        # Initialize GA4 Data API client
        import json as _json
        import os
        import tempfile

        cred_value = settings.GA4_CREDENTIALS_JSON.strip()
        if cred_value.startswith("{"):
            _tmp = tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            )
            _tmp.write(cred_value)
            _tmp.close()
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name
        else:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_value

        self.client = BetaAnalyticsDataClient()
        self._discovery_summary = {}

    async def extract(self) -> Dict[str, Any]:
        """
        Extract GA4 data.

        In discovery mode: first runs account-level discovery, then
        extracts data for all enabled properties across all divisions.

        In single-property mode: extracts data for one property.
        """
        try:
            if self.discovery_mode:
                return await self._extract_discovery_mode()
            else:
                return await self._extract_single_property(self.property_id)
        except Exception as e:
            self.logger.error(f"Error extracting GA4 data: {str(e)}")
            raise

    async def _extract_discovery_mode(self) -> Dict[str, Any]:
        """
        Phase 1: Run account-level discovery and persist to DB.
        Phase 2: Extract data for all enabled properties.
        """
        # Phase 1: Discovery
        self.logger.info("GA4 Pipeline — Phase 1: Account-level property discovery")
        try:
            from app.services.ga4_discovery import (
                discover_all_ga4_properties,
                persist_discovered_properties,
            )
            from app.core.database import async_session_maker

            # Run discovery
            all_props = await discover_all_ga4_properties(force_refresh=True)
            self.logger.info("Discovered %d GA4 properties across target accounts", len(all_props))

            # Persist to DB
            async with async_session_maker() as db:
                summary = await persist_discovered_properties(db)
                self._discovery_summary = summary
                self.logger.info("Persistence summary: %s", summary)

            # Phase 2: Extract data for enabled properties
            self.logger.info("GA4 Pipeline — Phase 2: Extracting data for enabled properties")
            combined = {"overview": [], "traffic_sources": [], "devices": []}

            # Get enabled properties from DB
            async with async_session_maker() as db:
                from app.services.ga4_discovery import get_properties_for_division
                enabled_props = []
                for div in ("cp", "sanitred", "ibos"):
                    div_props = await get_properties_for_division(db, div, enabled_only=True)
                    enabled_props.extend(div_props)

            self.logger.info("Extracting data for %d enabled properties", len(enabled_props))

            for prop in enabled_props:
                pid = prop["property_id"]
                try:
                    data = await self._extract_single_property(pid)
                    combined["overview"].extend(data.get("overview", []))
                    combined["traffic_sources"].extend(data.get("traffic_sources", []))
                    combined["devices"].extend(data.get("devices", []))
                    self.logger.info("Extracted data for property %s (%s)", pid, prop["display_name"])
                except Exception as e:
                    self.logger.warning("Failed to extract data for property %s: %s", pid, e)

            return combined

        except Exception as e:
            self.logger.error("Discovery mode failed: %s", e)
            # Fall back to returning discovery summary even if data extraction fails
            return {"overview": [], "traffic_sources": [], "devices": []}

    async def _extract_single_property(self, property_id: str) -> Dict[str, Any]:
        """Extract overview, traffic sources, and device data for one property."""
        self.logger.info(
            f"Extracting GA4 data for property {property_id} "
            f"from {self.start_date} to {self.end_date}"
        )

        overview_data = await self._get_daily_overview(property_id)
        traffic_data = await self._get_traffic_sources(property_id)
        device_data = await self._get_device_breakdown(property_id)

        self.logger.debug(
            f"Property {property_id}: {len(overview_data)} overview rows, "
            f"{len(traffic_data)} traffic rows, "
            f"{len(device_data)} device rows"
        )

        return {
            "overview": overview_data,
            "traffic_sources": traffic_data,
            "devices": device_data,
            "_property_id": property_id,
        }

    async def _get_daily_overview(self, property_id: str = None) -> List[Dict[str, Any]]:
        """Fetch daily overview metrics from GA4."""
        pid = property_id or self.property_id
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{pid}",
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
                    "_property_id": pid,
                })

        except Exception as e:
            self.logger.warning(f"Error fetching daily overview for {pid}: {str(e)}")

        return rows

    async def _get_traffic_sources(self, property_id: str = None) -> List[Dict[str, Any]]:
        """Fetch traffic source breakdown from GA4."""
        pid = property_id or self.property_id
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{pid}",
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
                    "_property_id": pid,
                })

        except Exception as e:
            self.logger.warning(f"Error fetching traffic sources for {pid}: {str(e)}")

        return rows

    async def _get_device_breakdown(self, property_id: str = None) -> List[Dict[str, Any]]:
        """Fetch device category breakdown from GA4."""
        pid = property_id or self.property_id
        rows = []
        try:
            request = RunReportRequest(
                property=f"properties/{pid}",
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
                    "_property_id": pid,
                })

        except Exception as e:
            self.logger.warning(f"Error fetching device breakdown for {pid}: {str(e)}")

        return rows

    async def transform(self, raw_data: Dict[str, Any]) -> List["GA4Metric"]:
        """
        Transform GA4 data into metric records.

        Merges daily overview with traffic source data to create
        GA4Metric instances with full analytics context.
        Now supports multi-property data via _property_id field.
        """
        try:
            records = []

            for row in raw_data.get("overview", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue
                    metric_date = self._parse_date(date_str)
                    if not metric_date:
                        continue

                    pid = row.get("_property_id") or self.property_id

                    record = GA4Metric(
                        date=metric_date,
                        property_id=pid,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("total_users", 0),
                        new_users=row.get("new_users", 0),
                        page_views=row.get("page_views", 0),
                        avg_session_duration=round(row.get("avg_session_duration", 0.0), 2),
                        bounce_rate=round(row.get("bounce_rate", 0.0) * 100, 2),
                        conversions=row.get("conversions", 0),
                        event_count=row.get("event_count", 0),
                        engaged_sessions=row.get("engaged_sessions", 0),
                        engagement_rate=round(row.get("engagement_rate", 0.0) * 100, 2),
                        channel="(all)",
                        source="(all)",
                        medium="(all)",
                        device="(all)",
                    )
                    records.append(record)
                except Exception as e:
                    self.logger.warning(f"Error processing GA4 overview row: {str(e)}")
                    continue

            for row in raw_data.get("traffic_sources", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue
                    metric_date = self._parse_date(date_str)
                    if not metric_date:
                        continue

                    pid = row.get("_property_id") or self.property_id

                    record = GA4Metric(
                        date=metric_date,
                        property_id=pid,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("users", 0),
                        new_users=0,
                        page_views=0,
                        avg_session_duration=0.0,
                        bounce_rate=round(row.get("bounce_rate", 0.0) * 100, 2),
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
                    self.logger.warning(f"Error processing traffic source row: {str(e)}")
                    continue

            for row in raw_data.get("devices", []):
                try:
                    date_str = row.get("date", "")
                    if not date_str:
                        continue
                    metric_date = self._parse_date(date_str)
                    if not metric_date:
                        continue

                    pid = row.get("_property_id") or self.property_id

                    record = GA4Metric(
                        date=metric_date,
                        property_id=pid,
                        sessions=row.get("sessions", 0),
                        total_users=row.get("users", 0),
                        new_users=0,
                        page_views=row.get("page_views", 0),
                        avg_session_duration=0.0,
                        bounce_rate=round(row.get("bounce_rate", 0.0) * 100, 2),
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
                    self.logger.warning(f"Error processing device row: {str(e)}")
                    continue

            self.logger.info(f"Transformed {len(records)} GA4 metric records")
            if self._discovery_summary:
                self.logger.info(
                    "Discovery summary: %d discovered, %d inserted, %d contractors created",
                    self._discovery_summary.get("discovered", 0),
                    self._discovery_summary.get("inserted", 0),
                    self._discovery_summary.get("contractors_created", 0),
                )
            return records

        except Exception as e:
            self.logger.error(f"Error transforming GA4 data: {str(e)}")
            raise

    @staticmethod
    def _parse_date(date_str: str):
        """Parse GA4 date string (YYYYMMDD or YYYY-MM-DD)."""
        try:
            return datetime.strptime(date_str, "%Y%m%d").date()
        except ValueError:
            try:
                return datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return None
