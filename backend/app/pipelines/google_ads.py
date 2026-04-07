"""
Google Ads data pipeline for I-Dash Analytics Platform.

Extracts campaign and ad group level metrics from Google Ads API using GAQL
and loads into GoogleAdMetric records with performance calculations.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from app.core.config import settings
from app.models.metrics import GoogleAdMetric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class GoogleAdsPipeline(BasePipeline):
    """
    Extract and load Google Ads metrics.

    Connects to Google Ads API and extracts campaign and ad group level
    performance data:
    - Impressions
    - Clicks
    - Cost
    - Conversions
    - Conversion value
    - Calculated metrics (CTR, CPC, CPM, ROAS)
    - Search impression share

    Uses GAQL queries for flexible data retrieval.
    """

    def __init__(
        self,
        start_date: datetime = None,
        end_date: datetime = None,
        campaign_ids: List[str] = None,
        **kwargs,
    ) -> None:
        """
        Initialize Google Ads pipeline.

        Args:
            start_date: Start of date range to fetch (default: 30 days ago).
            end_date: End of date range to fetch (default: today).
            campaign_ids: List of campaign IDs to fetch (default: all).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="google_ads_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date
        self.campaign_ids = campaign_ids

        # Validate configuration
        required_fields = [
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "GOOGLE_ADS_CLIENT_ID",
            "GOOGLE_ADS_CLIENT_SECRET",
            "GOOGLE_ADS_REFRESH_TOKEN",
            "GOOGLE_ADS_CUSTOMER_ID",
        ]

        for field in required_fields:
            if not getattr(settings, field):
                raise ValueError(f"{field} must be configured")

        # MCC (manager) login_customer_id — required when querying
        # sub-accounts under a manager account
        client_config = {
            "developer_token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
            "client_id": settings.GOOGLE_ADS_CLIENT_ID,
            "client_secret": settings.GOOGLE_ADS_CLIENT_SECRET,
            "refresh_token": settings.GOOGLE_ADS_REFRESH_TOKEN,
            "use_proto_plus": True,
        }
        manager_id = getattr(settings, "GOOGLE_ADS_MANAGER_CUSTOMER_ID", "")
        if manager_id:
            client_config["login_customer_id"] = manager_id.replace("-", "")

        self.client = GoogleAdsClient.load_from_dict(client_config)

        # Build the list of customer IDs to iterate
        self.customer_ids = self._build_customer_id_list()
        # Legacy single customer_id (first in list)
        self.customer_id = self.customer_ids[0] if self.customer_ids else settings.GOOGLE_ADS_CUSTOMER_ID.replace("-", "")

    def _build_customer_id_list(self) -> List[str]:
        """
        Build a deduplicated list of Google Ads customer IDs from config.

        Sources (in order):
            1. GOOGLE_ADS_CUSTOMER_ID_SANITRED
            2. GOOGLE_ADS_CUSTOMER_ID_IBOS (comma-separated for multiple)
            3. GOOGLE_ADS_CUSTOMER_ID (legacy fallback)
        """
        ids: List[str] = []

        for field in (
            "GOOGLE_ADS_CUSTOMER_ID_SANITRED",
            "GOOGLE_ADS_CUSTOMER_ID_IBOS",
            "GOOGLE_ADS_CUSTOMER_ID_CP",
        ):
            val = getattr(settings, field, "")
            if val:
                for cid in val.split(","):
                    cid = cid.strip().replace("-", "")
                    if cid and cid not in ids:
                        ids.append(cid)

        # Legacy fallback
        legacy = settings.GOOGLE_ADS_CUSTOMER_ID.replace("-", "")
        if legacy and legacy not in ids:
            ids.append(legacy)

        return ids

    async def extract(self) -> Dict[str, Any]:
        """
        Extract metrics from Google Ads API using GAQL queries.

        Iterates over all configured customer IDs (Sani-Tred, I-BOS, etc.)
        and aggregates campaign/ad group level data.

        Returns:
            Dictionary with campaign and ad group data:
                - campaigns: List of campaign records
        """
        try:
            self.logger.info(
                f"Extracting Google Ads data from {self.start_date} "
                f"to {self.end_date} for {len(self.customer_ids)} customer(s): "
                f"{', '.join(self.customer_ids)}"
            )

            all_campaigns: List[Dict[str, Any]] = []
            for cid in self.customer_ids:
                try:
                    data = await self._get_campaigns_by_adgroup(customer_id=cid)
                    self.logger.info(
                        f"Customer {cid}: fetched {len(data)} ad group records"
                    )
                    all_campaigns.extend(data)
                except GoogleAdsException as e:
                    self.logger.warning(f"Google Ads error for customer {cid}: {e}")
                except Exception as e:
                    self.logger.warning(f"Error fetching customer {cid}: {e}")

            self.logger.info(f"Total Google Ads records across all customers: {len(all_campaigns)}")
            return {"campaigns": all_campaigns}

        except Exception as e:
            self.logger.error(f"Error extracting Google Ads data: {str(e)}")
            raise

    async def _get_campaigns_by_adgroup(self, customer_id: str = None) -> List[Dict[str, Any]]:
        """Fetch campaign and ad group metrics using GAQL."""
        cid = customer_id or self.customer_id
        campaigns = []

        try:
            ga_service = self.client.get_service("GoogleAdsService")

            # Build GAQL query
            query = f"""
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversion_value,
                metrics.ctr,
                metrics.avg_cpc,
                metrics.cpm,
                metrics.search_impression_share
            FROM ad_group_ad_legacy_combined
            WHERE segments.date BETWEEN '{self.start_date}' AND '{self.end_date}'
            """

            # Add campaign filter if specified
            if self.campaign_ids:
                campaign_filter = ", ".join(
                    f'"{c}"' for c in self.campaign_ids
                )
                query += f" AND campaign.id IN ({campaign_filter})"

            query += " ORDER BY segments.date DESC"

            # Execute query
            search_request = {
                "customer_id": cid,
                "query": query,
            }

            results = ga_service.search(search_request)

            # Process results
            for row in results:
                campaign_data = {
                    "campaign_id": str(row.campaign.id),
                    "campaign_name": row.campaign.name,
                    "ad_group_name": row.ad_group.name,
                    "date": row.segments.date.strftime("%Y-%m-%d"),
                    "impressions": int(row.metrics.impressions),
                    "clicks": int(row.metrics.clicks),
                    "cost_micros": int(row.metrics.cost_micros),
                    "conversions": float(row.metrics.conversions),
                    "conversion_value": float(row.metrics.conversion_value),
                    "ctr": float(row.metrics.ctr),
                    "cpc": float(row.metrics.avg_cpc) / 1_000_000,
                    "cpm": float(row.metrics.cpm),
                    "search_impression_share": (
                        float(row.metrics.search_impression_share) * 100
                    )
                    if row.metrics.search_impression_share
                    else 0.0,
                }
                campaigns.append(campaign_data)

        except GoogleAdsException as e:
            self.logger.warning(
                f"Error fetching ad group metrics: {str(e)}"
            )
        except Exception as e:
            self.logger.warning(f"Error fetching campaigns: {str(e)}")

        return campaigns

    async def transform(self, raw_data: Dict[str, Any]) -> List[GoogleAdMetric]:
        """
        Transform Google Ads data into metric records.

        Calculates derived metrics and validates data before creating
        GoogleAdMetric instances.

        Args:
            raw_data: Dictionary with campaign/ad group insights.

        Returns:
            List of GoogleAdMetric instances.
        """
        try:
            records = []

            for campaign in raw_data.get("campaigns", []):
                try:
                    # Extract basic fields
                    campaign_id = campaign.get("campaign_id", "")
                    campaign_name = campaign.get("campaign_name", "")
                    ad_group_name = campaign.get("ad_group_name", "")
                    date_str = campaign.get("date")

                    if not date_str:
                        self.logger.debug("Skipping record without date")
                        continue

                    try:
                        metric_date = datetime.strptime(
                            date_str, "%Y-%m-%d"
                        ).date()
                    except ValueError:
                        self.logger.debug(f"Invalid date format: {date_str}")
                        continue

                    # Extract metrics
                    impressions = campaign.get("impressions", 0)
                    clicks = campaign.get("clicks", 0)
                    cost_micros = campaign.get("cost_micros", 0)
                    spend = cost_micros / 1_000_000

                    conversions = campaign.get("conversions", 0.0)
                    conversion_value = campaign.get(
                        "conversion_value", 0.0
                    )

                    # Get pre-calculated metrics or calculate
                    ctr = campaign.get("ctr", 0.0)
                    if ctr == 0.0 and impressions > 0:
                        ctr = (clicks / impressions) * 100

                    cpc = campaign.get("cpc", 0.0)
                    if cpc == 0.0 and clicks > 0:
                        cpc = spend / clicks

                    cpm = campaign.get("cpm", 0.0)
                    if cpm == 0.0 and impressions > 0:
                        cpm = (spend / impressions) * 1000

                    roas = (
                        (conversion_value / spend)
                        if spend > 0
                        else 0.0
                    )

                    search_impression_share = campaign.get(
                        "search_impression_share", 0.0
                    )

                    # Create record
                    record = GoogleAdMetric(
                        date=metric_date,
                        campaign_id=campaign_id,
                        campaign_name=campaign_name,
                        ad_group_name=ad_group_name,
                        impressions=impressions,
                        clicks=clicks,
                        spend=round(spend, 2),
                        conversions=conversions,
                        conversion_value=conversion_value,
                        ctr=round(ctr, 2),
                        cpc=round(cpc, 4),
                        cpm=round(cpm, 2),
                        roas=round(roas, 2),
                        search_impression_share=round(
                            search_impression_share, 2
                        ),
                    )
                    records.append(record)

                except Exception as e:
                    self.logger.warning(
                        f"Error processing campaign: {str(e)}"
                    )
                    continue

            self.logger.info(
                f"Transformed {len(records)} Google Ad metric records"
            )
            return records

        except Exception as e:
            self.logger.error(f"Error transforming Google Ads data: {str(e)}")
            raise
