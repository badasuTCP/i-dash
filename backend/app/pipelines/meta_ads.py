"""
Meta (Facebook) Ads data pipeline for I-Dash Analytics Platform.

Extracts campaign-level advertising metrics from Meta Ads API and loads
into MetaAdMetric records with performance calculations.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.exceptions import FacebookRequestError

from app.core.config import settings
from app.models.metrics import MetaAdMetric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class MetaAdsPipeline(BasePipeline):
    """
    Extract and load Meta (Facebook) Ads metrics.

    Connects to Meta Ads API and extracts campaign-level performance data:
    - Impressions
    - Clicks
    - Spend
    - Conversions
    - Conversion value
    - Calculated metrics (CTR, CPC, CPM, ROAS)
    - Reach
    - Frequency

    Data can be filtered by date range and specific campaigns.
    """

    def __init__(
        self,
        start_date: datetime = None,
        end_date: datetime = None,
        campaign_ids: List[str] = None,
        **kwargs,
    ) -> None:
        """
        Initialize Meta Ads pipeline.

        Args:
            start_date: Start of date range to fetch (default: 30 days ago).
            end_date: End of date range to fetch (default: today).
            campaign_ids: List of campaign IDs to fetch (default: all).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="meta_ads_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date
        self.campaign_ids = campaign_ids

        # Validate configuration
        if not settings.META_APP_ID or not settings.META_ACCESS_TOKEN:
            raise ValueError("META_APP_ID and META_ACCESS_TOKEN must be configured")

        # Initialize Facebook API
        FacebookAdsApi.init(
            access_token=settings.META_ACCESS_TOKEN,
        )

    async def extract(self) -> Dict[str, Any]:
        """
        Extract campaign performance data from Meta Ads API.

        Fetches insights for campaigns within the date range using the Insights API
        with proper field selection and aggregation.

        Returns:
            Dictionary with campaign data:
                - campaigns: List of campaign insight records
        """
        try:
            self.logger.info(
                f"Extracting Meta Ads data from {self.start_date} to {self.end_date}"
            )

            campaigns_data = await self._get_campaigns()
            self.logger.debug(f"Fetched {len(campaigns_data)} campaign records")

            return {"campaigns": campaigns_data}

        except FacebookRequestError as e:
            self.logger.error(f"Meta Ads API error: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Error extracting Meta Ads data: {str(e)}")
            raise

    async def _get_campaigns(self) -> List[Dict[str, Any]]:
        """Fetch campaign insights from Meta Ads API."""
        campaigns = []

        try:
            # Get the ad account
            account_id = settings.META_APP_ID
            if not account_id.startswith("act_"):
                account_id = f"act_{account_id}"

            ad_account = AdAccount(account_id)

            # Define fields to fetch
            fields = [
                "campaign_id",
                "campaign_name",
                "adset_id",
                "adset_name",
                "date_start",
                "impressions",
                "clicks",
                "spend",
                "actions",
                "action_values",
                "reach",
                "frequency",
                "cpp",
                "cpc",
                "cpm",
                "ctr",
            ]

            # Get campaign insights
            insights = ad_account.get_insights(
                fields=fields,
                params={
                    "date_preset": "custom",
                    "time_range": {
                        "since": self.start_date.isoformat(),
                        "until": self.end_date.isoformat(),
                    },
                    "level": "adset",
                    "limit": 100,
                },
            )

            # Handle pagination
            for insight in insights:
                insight_dict = dict(insight)

                # Filter by campaign IDs if specified
                if self.campaign_ids:
                    campaign_id = insight_dict.get("campaign_id")
                    if campaign_id not in self.campaign_ids:
                        continue

                campaigns.append(insight_dict)

        except FacebookRequestError as e:
            self.logger.warning(f"Error fetching campaign insights: {str(e)}")
        except Exception as e:
            self.logger.warning(f"Error fetching campaigns: {str(e)}")

        return campaigns

    async def transform(self, raw_data: Dict[str, Any]) -> List[MetaAdMetric]:
        """
        Transform Meta Ads data into metric records.

        Calculates derived metrics (CTR, CPC, CPM, ROAS) from raw API data
        and creates MetaAdMetric instances.

        Args:
            raw_data: Dictionary with campaign insights.

        Returns:
            List of MetaAdMetric instances.
        """
        try:
            records = []

            for campaign_insight in raw_data.get("campaigns", []):
                try:
                    # Extract basic fields
                    campaign_id = campaign_insight.get("campaign_id", "")
                    campaign_name = campaign_insight.get("campaign_name", "")
                    ad_set_name = campaign_insight.get("adset_name", "")
                    date_str = campaign_insight.get("date_start")

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
                    impressions = int(
                        campaign_insight.get("impressions", 0) or 0
                    )
                    clicks = int(campaign_insight.get("clicks", 0) or 0)
                    spend = float(campaign_insight.get("spend", 0) or 0)
                    reach = int(campaign_insight.get("reach", 0) or 0)
                    frequency = float(
                        campaign_insight.get("frequency", 0) or 0
                    )

                    # Extract conversion data
                    conversions = 0.0
                    conversion_value = 0.0

                    actions = campaign_insight.get("actions", [])
                    if isinstance(actions, list):
                        for action in actions:
                            if isinstance(action, dict):
                                action_type = action.get("action_type")
                                action_count = float(
                                    action.get("value", 0) or 0
                                )
                                # Count purchase-type actions as conversions
                                if action_type in [
                                    "purchase",
                                    "omni_purchase",
                                    "checkout",
                                    "add_to_cart",
                                ]:
                                    conversions += action_count

                    action_values = campaign_insight.get(
                        "action_values", []
                    )
                    if isinstance(action_values, list):
                        for action_val in action_values:
                            if isinstance(action_val, dict):
                                action_type = action_val.get("action_type")
                                value = float(
                                    action_val.get("value", 0) or 0
                                )
                                # Use purchase values
                                if action_type in [
                                    "purchase",
                                    "omni_purchase",
                                ]:
                                    conversion_value += value

                    # Calculate metrics
                    ctr = (clicks / impressions * 100) if impressions > 0 else 0.0
                    cpc = (spend / clicks) if clicks > 0 else 0.0
                    cpm = (spend / impressions * 1000) if impressions > 0 else 0.0
                    roas = (
                        (conversion_value / spend)
                        if spend > 0
                        else 0.0
                    )

                    # Create record
                    record = MetaAdMetric(
                        date=metric_date,
                        campaign_id=campaign_id,
                        campaign_name=campaign_name,
                        ad_set_name=ad_set_name,
                        impressions=impressions,
                        clicks=clicks,
                        spend=spend,
                        conversions=conversions,
                        conversion_value=conversion_value,
                        ctr=round(ctr, 2),
                        cpc=round(cpc, 4),
                        cpm=round(cpm, 2),
                        roas=round(roas, 2),
                        reach=reach,
                        frequency=round(frequency, 2),
                    )
                    records.append(record)

                except Exception as e:
                    self.logger.warning(
                        f"Error processing campaign insight: {str(e)}"
                    )
                    continue

            self.logger.info(f"Transformed {len(records)} Meta Ad metric records")
            return records

        except Exception as e:
            self.logger.error(f"Error transforming Meta Ads data: {str(e)}")
            raise
