"""
Meta (Facebook) Ads data pipeline for I-Dash Analytics Platform.

Extracts campaign-level advertising metrics from Meta Ads API and loads
into MetaAdMetric records with performance calculations.

Includes Auto-Discovery reconciliation: fetches all ad accounts visible
to the Meta Business token, compares against the contractors table, and
auto-inserts any new accounts with status='pending_admin' for Super Admin
review.
"""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.business import Business
from facebook_business.exceptions import FacebookRequestError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.contractor import Contractor
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
        Extract campaign performance data from ALL Meta Ad Accounts.

        Uses Business-level auto-discovery to find every ad account under
        META_BUSINESS_ID, then pulls insights from each one. Falls back to
        the single META_AD_ACCOUNT_ID if discovery fails.
        """
        try:
            self.logger.info(
                f"Extracting Meta Ads data from {self.start_date} to {self.end_date}"
            )

            # Discover all ad accounts under the Business portfolio
            accounts = await fetch_meta_ad_accounts()
            if not accounts:
                self.logger.warning("No Meta ad accounts discovered — nothing to extract")
                return {"campaigns": []}

            self.logger.info(
                f"Meta multi-account discovery: {len(accounts)} account(s) — "
                + ", ".join(f"{a['name']} ({a['id']})" for a in accounts[:10])
            )

            all_campaigns: List[Dict[str, Any]] = []
            for acct in accounts:
                try:
                    data = await self._get_account_insights(acct["id"])
                    if data:
                        # Tag each row with the account for traceability
                        for row in data:
                            row["_account_id"] = acct["id"]
                            row["_account_name"] = acct["name"]
                        all_campaigns.extend(data)
                        self.logger.info(
                            f"  {acct['name']} ({acct['id']}): {len(data)} insight rows"
                        )
                    else:
                        self.logger.debug(
                            f"  {acct['name']} ({acct['id']}): 0 rows (no spend in range)"
                        )
                except Exception as e:
                    self.logger.warning(
                        f"  {acct['name']} ({acct['id']}): error — {e}"
                    )

            self.logger.info(
                f"Meta Ads total: {len(all_campaigns)} insight rows across {len(accounts)} accounts"
            )
            return {"campaigns": all_campaigns}

        except Exception as e:
            self.logger.error(f"Error extracting Meta Ads data: {str(e)}")
            raise

    async def _get_account_insights(self, account_id: str) -> List[Dict[str, Any]]:
        """Fetch campaign insights for a single ad account."""
        if not account_id.startswith("act_"):
            account_id = f"act_{account_id}"

        ad_account = AdAccount(account_id)

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

        def _blocking_fetch() -> List[Dict[str, Any]]:
            """Run the synchronous Facebook SDK call in a worker thread."""
            insights = ad_account.get_insights(
                fields=fields,
                params={
                    "time_range": {
                        "since": self.start_date.isoformat(),
                        "until": self.end_date.isoformat(),
                    },
                    "level": "campaign",
                    "time_increment": 1,
                    "limit": 500,
                },
            )
            out: List[Dict[str, Any]] = []
            for insight in insights:
                insight_dict = dict(insight)
                if self.campaign_ids and insight_dict.get("campaign_id") not in self.campaign_ids:
                    continue
                out.append(insight_dict)
            return out

        try:
            return await asyncio.to_thread(_blocking_fetch)

        except FacebookRequestError as e:
            self.logger.warning(
                f"Meta API error for {account_id}: code={e.api_error_code()} "
                f"msg={e.api_error_message()}"
            )
            return []

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

                    # Extract conversion data — count leads AND purchases
                    conversions = 0.0
                    conversion_value = 0.0

                    actions = campaign_insight.get("actions", [])
                    if isinstance(actions, list):
                        for action in actions:
                            if isinstance(action, dict):
                                action_type = action.get("action_type", "")
                                action_count = float(
                                    action.get("value", 0) or 0
                                )
                                # Count lead + purchase actions as conversions
                                if action_type in [
                                    "lead",
                                    "offsite_conversion.fb_pixel_lead",
                                    "onsite_conversion.lead_grouped",
                                    "onsite_conversion.messaging_conversation_started_7d",
                                    "purchase",
                                    "omni_purchase",
                                    "checkout",
                                    "add_to_cart",
                                    "complete_registration",
                                    "contact_total",
                                    "submit_application",
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
                        account_id=campaign_insight.get("_account_id", ""),
                        account_name=campaign_insight.get("_account_name", ""),
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


# ── Meta Auto-Discovery: Reconciliation Service ────────────────────────

def _slugify(name: str) -> str:
    """
    Convert an ad-account name to a URL-safe slug for the contractor ID.

    Examples:
        "Beckley Concrete Decor" → "beckley-concrete-decor"
        "New Guy's Coatings LLC" → "new-guys-coatings-llc"
    """
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


async def fetch_meta_ad_accounts() -> List[Dict[str, str]]:
    """
    Fetch all ad-account IDs and names visible to the configured Meta token.

    Tries two strategies:
      1. Business API: list all owned/client ad accounts under BUSINESS_ID.
      2. Fallback: use the single META_AD_ACCOUNT_ID already configured.

    Returns:
        List of dicts with 'id' (e.g. 'act_123') and 'name'.
        Returns an empty list on any API error (safe for callers).
    """
    accounts: List[Dict[str, str]] = []

    if not settings.META_ACCESS_TOKEN:
        logger.warning("META_ACCESS_TOKEN not set — skipping Meta auto-discovery")
        return accounts

    def _blocking_discovery() -> List[Dict[str, str]]:
        """All Meta SDK calls are synchronous — run them on a worker thread."""
        discovered: List[Dict[str, str]] = []
        FacebookAdsApi.init(access_token=settings.META_ACCESS_TOKEN)

        # Strategy 1: Business-level enumeration (best coverage)
        business_id = getattr(settings, "META_BUSINESS_ID", None) or ""
        if business_id:
            try:
                biz = Business(business_id)
                owned = biz.get_owned_ad_accounts(
                    fields=["account_id", "name"],
                    params={"limit": 200},
                )
                for acct in owned:
                    acct_dict = dict(acct)
                    act_id = acct_dict.get("account_id", "")
                    if not act_id.startswith("act_"):
                        act_id = f"act_{act_id}"
                    discovered.append({
                        "id": act_id,
                        "name": acct_dict.get("name", act_id),
                    })

                # Also check client ad accounts
                try:
                    client_accounts = biz.get_client_ad_accounts(
                        fields=["account_id", "name"],
                        params={"limit": 200},
                    )
                    for acct in client_accounts:
                        acct_dict = dict(acct)
                        act_id = acct_dict.get("account_id", "")
                        if not act_id.startswith("act_"):
                            act_id = f"act_{act_id}"
                        existing_ids = {a["id"] for a in discovered}
                        if act_id not in existing_ids:
                            discovered.append({
                                "id": act_id,
                                "name": acct_dict.get("name", act_id),
                            })
                except Exception as e:
                    logger.debug(f"No client ad accounts or error: {e}")

                logger.info(
                    "Meta auto-discovery: found %d ad accounts via Business API",
                    len(discovered),
                )
                return discovered

            except FacebookRequestError as e:
                logger.warning(
                    "Business API enumeration failed (code %s): %s — "
                    "falling back to single-account mode",
                    e.api_error_code(),
                    e.api_error_message(),
                )

        # Strategy 2: Single-account fallback
        account_id = (
            settings.META_AD_ACCOUNT_ID
            or settings.META_AD_ACCOUNT_ID_CP
            or settings.META_APP_ID
        )
        if account_id:
            if not account_id.startswith("act_"):
                account_id = f"act_{account_id}"
            try:
                ad_account = AdAccount(account_id)
                acct_info = ad_account.api_get(fields=["account_id", "name"])
                acct_dict = dict(acct_info)
                discovered.append({
                    "id": account_id,
                    "name": acct_dict.get("name", account_id),
                })
            except Exception as e:
                logger.warning("Could not fetch account info for %s: %s", account_id, e)
                discovered.append({"id": account_id, "name": account_id})

        logger.info(
            "Meta auto-discovery (single-account mode): found %d account(s)",
            len(discovered),
        )
        return discovered

    try:
        accounts = await asyncio.to_thread(_blocking_discovery)
        return accounts
    except Exception as e:
        logger.error("Meta auto-discovery failed entirely: %s", e)
        return []


async def reconcile_meta_contractors() -> Dict[str, Any]:
    """
    Compare Meta ad-account list against the contractors DB table.

    For every Meta account NOT already in the DB, insert a new row with:
      - id: slugified account name
      - name: account name from Meta
      - active: False
      - status: 'pending_admin'
      - meta_account_id: the act_XXXXX string

    Safety guardrails:
      - Wrapped in try/except — never crashes the main pipeline.
      - Empty account list → no-op (protects existing 13 contractors).
      - Duplicate slugs get a numeric suffix to avoid PK collisions.

    Returns:
        Dict with 'discovered', 'new_contractors', 'errors' keys.
    """
    result: Dict[str, Any] = {
        "discovered": 0,
        "new_contractors": [],
        "errors": [],
    }

    try:
        # 1. Fetch accounts from Meta
        meta_accounts = await fetch_meta_ad_accounts()

        if not meta_accounts:
            logger.info("Meta reconciliation: no accounts returned — skipping")
            return result

        result["discovered"] = len(meta_accounts)

        # 2. Compare against DB and log to discovery_audit
        async with async_session_maker() as session:
            # Log every discovered account to the audit table
            try:
                from app.models.discovery_audit import DiscoveryAudit
                for acct in meta_accounts:
                    existing_audit = await session.execute(
                        select(DiscoveryAudit).where(
                            DiscoveryAudit.platform == "meta",
                            DiscoveryAudit.account_id == acct["id"],
                        )
                    )
                    if not existing_audit.scalar_one_or_none():
                        session.add(DiscoveryAudit(
                            platform="meta",
                            account_id=acct["id"],
                            account_name=acct["name"],
                            portfolio=acct.get("portfolio", ""),
                            status="discovered",
                        ))
                await session.flush()
            except Exception as e:
                logger.debug("Discovery audit logging skipped: %s", e)

            # Get all existing meta_account_ids
            db_result = await session.execute(select(Contractor))
            existing = db_result.scalars().all()

            existing_meta_ids: Set[str] = {
                c.meta_account_id for c in existing if c.meta_account_id
            }
            existing_slugs: Set[str] = {c.id for c in existing}

            # Build set of account_ids already approved/rejected in discovery_audit
            # — these must NEVER be re-inserted as pending
            already_decided: Set[str] = set()
            try:
                decided_result = await session.execute(
                    select(DiscoveryAudit.account_id).where(
                        DiscoveryAudit.status.in_(["approved", "rejected"])
                    )
                )
                already_decided = {row[0] for row in decided_result.fetchall()}
            except Exception:
                pass

            new_count = 0
            now = datetime.now(timezone.utc)

            for acct in meta_accounts:
                meta_id = acct["id"]
                meta_name = acct["name"]

                # Already tracked or already decided (approved/rejected)?
                if meta_id in existing_meta_ids or meta_id in already_decided:
                    continue

                # Generate a unique slug
                base_slug = _slugify(meta_name)
                if not base_slug:
                    base_slug = meta_id.replace("act_", "meta-")

                slug = base_slug
                suffix = 2
                while slug in existing_slugs:
                    slug = f"{base_slug}-{suffix}"
                    suffix += 1

                # Insert new pending contractor
                new_contractor = Contractor(
                    id=slug,
                    name=meta_name,
                    division="i-bos",
                    active=False,
                    status="pending_admin",
                    meta_account_id=meta_id,
                    updated_at=now,
                )
                session.add(new_contractor)
                existing_slugs.add(slug)
                existing_meta_ids.add(meta_id)
                new_count += 1

                result["new_contractors"].append({
                    "id": slug,
                    "name": meta_name,
                    "meta_account_id": meta_id,
                })
                logger.info(
                    "Meta auto-discovery: new contractor '%s' (%s) → pending_admin",
                    meta_name,
                    meta_id,
                )

            if new_count > 0:
                await session.commit()
                logger.info(
                    "Meta reconciliation complete: %d new contractor(s) pending approval",
                    new_count,
                )
            else:
                logger.info("Meta reconciliation complete: no new contractors found")

    except Exception as e:
        error_msg = f"Meta reconciliation error: {type(e).__name__}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)
        # Never re-raise — this must not crash the main pipeline

    return result
