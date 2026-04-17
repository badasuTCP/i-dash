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

# ── Friday's canonical brand mapping ──────────────────────────────────────────
# Any ad account under META_BUSINESS_ID is I-BOS by default. The CP training
# account is the sole explicit CP override. Approved here = active immediately.
META_PORTFOLIO_BUSINESS_ID = "1785037011813074"
# CP training account — must NEVER appear as an I-BOS contractor.
# Excluded from reconcile_meta_contractors and from I-BOS brand queries.
META_CP_ACCOUNT_IDS = {"144305066", "act_144305066"}
META_SOURCE_PREFIX = "[META]"


def _with_meta_prefix(name: str) -> str:
    """Ensure a Meta-discovered account name is prefixed with [META]."""
    if not name:
        return META_SOURCE_PREFIX
    name = name.strip()
    return name if name.startswith(META_SOURCE_PREFIX) else f"{META_SOURCE_PREFIX} {name}"


def _parse_meta_account_status(raw_status) -> str:
    """Convert Meta's numeric account_status to a human-readable label.

    Meta API account_status values:
      1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED,
      7 = PENDING_RISK_REVIEW, 9 = PENDING_SETTLEMENT,
      100 = IN_GRACE_PERIOD, 101 = PENDING_CLOSURE,
      201 = ANY_ACTIVE, 202 = ANY_CLOSED.
    """
    STATUS_MAP = {
        1: "active",
        2: "disabled",
        3: "unsettled",
        7: "pending_review",
        9: "pending_settlement",
        100: "grace_period",
        101: "closed",
        201: "active",
        202: "closed",
    }
    if raw_status is None:
        return "unknown"
    try:
        return STATUS_MAP.get(int(raw_status), f"status_{raw_status}")
    except (ValueError, TypeError):
        return str(raw_status)


def _division_for_meta_account(meta_id: str) -> str:
    """Friday's rule: CP only for the training account, else I-BOS."""
    bare = (meta_id or "").replace("act_", "")
    return "cp" if bare in {a.replace("act_", "") for a in META_CP_ACCOUNT_IDS} else "ibos"


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

            # Supplement with known accounts that the API didn't return
            # (e.g. disabled/payment-hold accounts). Check both brand_assets
            # and contractors tables so we never miss historical spend data.
            try:
                from app.core.database import async_session_maker
                from app.models.brand_asset import BrandAsset
                from app.models.contractor import Contractor
                from sqlalchemy import select
                async with async_session_maker() as db:
                    discovered_ids = {a["id"] for a in accounts}
                    # From brand_assets
                    ba_rows = await db.execute(
                        select(BrandAsset.account_id, BrandAsset.account_name)
                        .where(BrandAsset.platform == "meta")
                    )
                    for acct_id, acct_name in ba_rows.all():
                        if acct_id and acct_id not in discovered_ids:
                            accounts.append({
                                "id": acct_id,
                                "name": acct_name,
                                "account_status": "disabled",
                            })
                            discovered_ids.add(acct_id)
                            self.logger.info(
                                f"Supplemented from brand_assets: {acct_name} ({acct_id})"
                            )
                    # From contractors table (meta_account_id field)
                    c_rows = await db.execute(
                        select(Contractor.meta_account_id, Contractor.name)
                        .where(Contractor.meta_account_id.isnot(None))
                    )
                    for acct_id, cname in c_rows.all():
                        if acct_id and acct_id not in discovered_ids:
                            accounts.append({
                                "id": acct_id,
                                "name": cname,
                                "account_status": "disabled",
                            })
                            discovered_ids.add(acct_id)
                            self.logger.info(
                                f"Supplemented from contractors: {cname} ({acct_id})"
                            )
            except Exception as e:
                self.logger.debug(f"Account supplement skipped: {e}")

            self.logger.info(
                f"Meta multi-account discovery: {len(accounts)} account(s) — "
                + ", ".join(f"{a['name']} ({a['id']})" for a in accounts[:15])
            )

            all_campaigns: List[Dict[str, Any]] = []
            # account_reach_map[(account_id, date_iso)] = dedup'd daily reach
            # (account-level insight — one row per account per day).
            account_reach_map: Dict[tuple, int] = {}

            # Per-account work runs in parallel — fire campaign-insights and
            # account-reach for every account concurrently so the two calls
            # per account don't serialize and the slowest account doesn't
            # block the others.
            async def _fetch_one(acct: Dict[str, Any]) -> None:
                try:
                    # Resolve the campaign-ID whitelist once per account so
                    # both the campaign-insights and account-reach calls use
                    # the exact same set (archived/deleted campaigns excluded
                    # to match Meta Ads Manager's default "All ads" view).
                    visible_ids = await asyncio.wait_for(
                        self._get_visible_campaign_ids(acct["id"]),
                        timeout=60,
                    )
                    # Both API calls for this account run in parallel; a 90s
                    # timeout per call prevents a single slow/throttled
                    # account from hanging the whole pipeline.
                    insights_task = asyncio.wait_for(
                        self._get_account_insights_with_filter(
                            acct["id"], visible_ids
                        ),
                        timeout=90,
                    )
                    reach_task = asyncio.wait_for(
                        self._get_account_daily_reach(
                            acct["id"], visible_campaign_ids=visible_ids
                        ),
                        timeout=90,
                    )
                    data, acct_rows = await asyncio.gather(
                        insights_task, reach_task, return_exceptions=True
                    )

                    if isinstance(data, Exception):
                        self.logger.warning(
                            f"  {acct['name']} ({acct['id']}): insights error — {data}"
                        )
                    elif data:
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

                    if isinstance(acct_rows, Exception):
                        self.logger.debug(
                            f"  {acct['name']} ({acct['id']}): account reach fetch failed — {acct_rows}"
                        )
                    elif acct_rows:
                        for row in acct_rows:
                            d = row.get("date_start")
                            r = int(row.get("reach", 0) or 0)
                            if d:
                                account_reach_map[(acct["id"], d)] = r
                except Exception as e:
                    self.logger.warning(
                        f"  {acct['name']} ({acct['id']}): error — {e}"
                    )

            # Cap concurrency so we don't slam the Meta API and get throttled.
            sem = asyncio.Semaphore(5)

            async def _bounded(acct: Dict[str, Any]) -> None:
                async with sem:
                    await _fetch_one(acct)

            await asyncio.gather(*[_bounded(a) for a in accounts])

            # Stamp the deduped account reach onto every campaign row for the
            # same (account_id, date). The transform() step reads this field.
            for row in all_campaigns:
                key = (row.get("_account_id"), row.get("date_start"))
                if key in account_reach_map:
                    row["_account_reach"] = account_reach_map[key]

            self.logger.info(
                f"Meta Ads total: {len(all_campaigns)} insight rows across {len(accounts)} accounts"
                f" · account-reach map covers {len(account_reach_map)} account-days"
            )
            return {"campaigns": all_campaigns}

        except Exception as e:
            self.logger.error(f"Error extracting Meta Ads data: {str(e)}")
            raise

    # Statuses Meta Ads Manager's default "All ads" tab HIDES. Anything not
    # in this set is included by default in the UI and should be in our data.
    _HIDDEN_CAMPAIGN_STATUSES = frozenset({"ARCHIVED", "DELETED"})

    async def _get_visible_campaign_ids(self, account_id: str) -> Optional[set]:
        """Fetch the set of campaign IDs Meta Ads Manager shows by default.

        Returns None when we couldn't determine the list (API error, no
        campaigns returned) — callers should treat that as "no filter".
        """
        if not account_id.startswith("act_"):
            account_id = f"act_{account_id}"
        ad_account = AdAccount(account_id)

        def _blocking_fetch() -> Optional[set]:
            campaigns = ad_account.get_campaigns(
                fields=["id", "effective_status"],
                params={"limit": 500},
            )
            ids: set = set()
            any_rows = False
            for c in campaigns:
                any_rows = True
                status = c.get("effective_status") or ""
                if status in self._HIDDEN_CAMPAIGN_STATUSES:
                    continue
                cid = c.get("id")
                if cid:
                    ids.add(str(cid))
            return ids if any_rows else None

        try:
            return await asyncio.to_thread(_blocking_fetch)
        except FacebookRequestError as e:
            self.logger.warning(
                f"Meta campaigns list error for {account_id}: "
                f"code={e.api_error_code()} msg={e.api_error_message()}"
            )
            return None

    async def _get_account_insights_with_filter(
        self,
        account_id: str,
        visible_ids: Optional[set],
    ) -> List[Dict[str, Any]]:
        """Fetch campaign insights for a single ad account, restricted to
        the campaign-ID whitelist so totals match Meta Ads Manager's
        default "All ads" view (archived/deleted campaigns excluded).

        When visible_ids is None we fall back to fetching everything —
        better to over-count than to lose data entirely.
        """
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
                cid = str(insight_dict.get("campaign_id") or "")
                # Apply the visible-campaign whitelist (match Meta UI default).
                if visible_ids is not None and cid not in visible_ids:
                    continue
                # Honor any caller-provided campaign restriction.
                if self.campaign_ids and cid not in self.campaign_ids:
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

    async def _get_account_daily_reach(
        self,
        account_id: str,
        visible_campaign_ids: Optional[set] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch account-level daily reach (deduplicated across campaigns).

        The per-campaign insights call overcounts reach because a person who
        saw 3 campaigns is counted 3 times. Meta Ads Manager shows the
        account-level deduped number. We fetch that here — restricted to the
        same campaign-ID whitelist used for the campaign insights call so
        totals reconcile — and stamp it onto each campaign row before the
        transform step.
        """
        if not account_id.startswith("act_"):
            account_id = f"act_{account_id}"

        ad_account = AdAccount(account_id)

        params: Dict[str, Any] = {
            "time_range": {
                "since": self.start_date.isoformat(),
                "until": self.end_date.isoformat(),
            },
            "level": "account",
            "time_increment": 1,
            "limit": 500,
        }
        if visible_campaign_ids:
            params["filtering"] = [{
                "field": "campaign.id",
                "operator": "IN",
                "value": list(visible_campaign_ids),
            }]

        def _blocking_fetch() -> List[Dict[str, Any]]:
            insights = ad_account.get_insights(
                fields=["date_start", "reach", "impressions"],
                params=params,
            )
            return [dict(i) for i in insights]

        try:
            return await asyncio.to_thread(_blocking_fetch)
        except FacebookRequestError as e:
            self.logger.debug(
                f"Meta account-reach API error for {account_id}: "
                f"code={e.api_error_code()} msg={e.api_error_message()}"
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
                    _acct_id_raw = campaign_insight.get("_account_id", "") or ""
                    account_reach = int(
                        campaign_insight.get("_account_reach", 0) or 0
                    )
                    record = MetaAdMetric(
                        account_id=_acct_id_raw,
                        account_name=_with_meta_prefix(
                            campaign_insight.get("_account_name", "")
                        ),
                        # Canonical brand tag applied at write time so
                        # queries never need to join brand_assets to
                        # figure out which division a row belongs to.
                        division=_division_for_meta_account(_acct_id_raw),
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
                        account_reach=account_reach,
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
                    fields=["account_id", "name", "account_status"],
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
                        "account_status": _parse_meta_account_status(
                            acct_dict.get("account_status")
                        ),
                    })

                # Also check client ad accounts
                try:
                    client_accounts = biz.get_client_ad_accounts(
                        fields=["account_id", "name", "account_status"],
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
                                "account_status": _parse_meta_account_status(
                                    acct_dict.get("account_status")
                                ),
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
                            account_name=_with_meta_prefix(acct["name"]),
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

            # Friday's canonical rule: any account under META_BUSINESS_ID
            # is auto-approved; the CP training account is the sole CP override.
            portfolio_business_id = (
                getattr(settings, "META_BUSINESS_ID", "") or META_PORTFOLIO_BUSINESS_ID
            )

            for acct in meta_accounts:
                meta_id = acct["id"]
                raw_name = acct["name"]
                meta_name = _with_meta_prefix(raw_name)

                # Skip the CP Internal Training account — it must NEVER
                # appear as an I-BOS contractor. It is tracked under CP only.
                bare_id = meta_id.replace("act_", "")
                if bare_id in {a.replace("act_", "") for a in META_CP_ACCOUNT_IDS}:
                    continue

                # Already tracked or already decided (approved/rejected)?
                if meta_id in existing_meta_ids or meta_id in already_decided:
                    # Update the ad status on existing contractors so the UI
                    # always reflects the latest account health.
                    acct_status = _parse_meta_account_status(acct.get("account_status"))
                    if meta_id in existing_meta_ids:
                        try:
                            existing_c = await session.execute(
                                select(Contractor).where(
                                    Contractor.meta_account_id == meta_id
                                )
                            )
                            for ec in existing_c.scalars().all():
                                if ec.meta_account_status != acct_status:
                                    ec.meta_account_status = acct_status
                                    ec.updated_at = now
                        except Exception:
                            pass
                    continue

                # ── Dedup: try to LINK to an existing contractor by name ─
                # before creating a duplicate. Many seed contractors exist
                # with short names like "Floor Warriors" — when Meta
                # discovers "Floor Warriors" or similar, we should attach
                # the meta_account_id to that row instead of creating a
                # new "[META] Floor Warriors" duplicate.
                def _norm(n: str) -> str:
                    if not n:
                        return ""
                    n = n.lower().replace("[meta]", "").replace("[ga4]", "")
                    for tok in (" - ga4", "(greg haber)", " llc", " inc.", " inc"):
                        n = n.replace(tok, "")
                    return "".join(ch for ch in n if ch.isalnum())

                raw_norm = _norm(raw_name)
                acct_status = _parse_meta_account_status(acct.get("account_status"))
                merged_into_existing = False
                if raw_norm:
                    try:
                        all_existing = await session.execute(
                            select(Contractor).where(Contractor.division.in_(["ibos", "i-bos"]))
                        )
                        for ec in all_existing.scalars().all():
                            if ec.meta_account_id:
                                continue  # already has a Meta link
                            ec_norm = _norm(ec.name)
                            if not ec_norm:
                                continue
                            # Match if normalized names are equal or one contains the other
                            if (
                                ec_norm == raw_norm
                                or ec_norm in raw_norm
                                or raw_norm in ec_norm
                            ):
                                ec.meta_account_id = meta_id
                                ec.meta_account_status = acct_status
                                ec.updated_at = now
                                existing_meta_ids.add(meta_id)
                                merged_into_existing = True
                                logger.info(
                                    "Meta auto-discovery: linked '%s' (%s) → existing contractor '%s'",
                                    raw_name, meta_id, ec.id,
                                )
                                break
                    except Exception as merge_exc:
                        logger.debug("Meta dedup merge skipped: %s", merge_exc)
                if merged_into_existing:
                    continue

                # Brand + status assignment (Friday's logic)
                division = _division_for_meta_account(meta_id)
                under_portfolio = (
                    portfolio_business_id == META_PORTFOLIO_BUSINESS_ID
                    or acct.get("business_id") == portfolio_business_id
                )
                # Accounts under our known Business portfolio are pre-approved —
                # no manual admin gating required.
                auto_active = bool(under_portfolio)
                new_status = "active" if auto_active else "pending_admin"

                # Generate a unique slug (based on raw name so slugs stay clean)
                base_slug = _slugify(raw_name)
                if not base_slug:
                    base_slug = meta_id.replace("act_", "meta-")

                slug = base_slug
                suffix = 2
                while slug in existing_slugs:
                    slug = f"{base_slug}-{suffix}"
                    suffix += 1

                new_contractor = Contractor(
                    id=slug,
                    name=meta_name,
                    division=division,
                    active=auto_active,
                    status=new_status,
                    meta_account_id=meta_id,
                    meta_account_status=_parse_meta_account_status(acct.get("account_status")),
                    updated_at=now,
                )
                session.add(new_contractor)
                existing_slugs.add(slug)
                existing_meta_ids.add(meta_id)
                new_count += 1

                result["new_contractors"].append({
                    "id": slug,
                    "name": meta_name,
                    "division": division,
                    "status": new_status,
                    "meta_account_id": meta_id,
                })
                logger.info(
                    "Meta auto-discovery: %s '%s' (%s) → %s/%s",
                    "auto-approved" if auto_active else "pending_admin",
                    meta_name,
                    meta_id,
                    division,
                    new_status,
                )

            # Always commit — even when no new contractors found, the loop
            # may have updated meta_account_status on existing contractors.
            await session.commit()
            if new_count > 0:
                logger.info(
                    "Meta reconciliation complete: %d new contractor(s) pending approval",
                    new_count,
                )
            else:
                logger.info(
                    "Meta reconciliation complete: 0 new, status updates committed for existing contractors"
                )

    except Exception as e:
        error_msg = f"Meta reconciliation error: {type(e).__name__}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)
        # Never re-raise — this must not crash the main pipeline

    return result
