"""
GA4 Account-Level Discovery Service.

Iterates through a known set of GA4 Account IDs using the Admin API's
``listAccountSummaries`` endpoint, discovers every underlying property,
and maps each to an I-Dash division.

The service account ``idash-sheets@big-query-485015.iam.gserviceaccount.com``
has Viewer access at the Account Level for all five accounts.

Account → Division mapping (source of truth):
    115324581  → sanitred     (Sani-Tred primary retail)
    178431870  → cp           (CP eStore)
    108635203  → cp           (CP Websites — 13 properties)
    174590625  → ibos         (I-BOS contractor websites — 16 properties)
    175160117  → ibos         (DCKN Lead Gen — 48 properties, managed under I-BOS)

DCKN is NOT a top-level brand.  All properties from Account 175160117
are mapped to the ``ibos`` division and appear in Contractor Management
as Pending/Inactive for admin approval.

Usage:
    properties = await discover_all_ga4_properties()
    await persist_discovered_properties(db)
"""

import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

GA4_SOURCE_PREFIX = "[GA4]"


def _with_ga4_prefix(name: str) -> str:
    """Ensure a GA4-discovered property / contractor name is prefixed with [GA4]."""
    if not name:
        return GA4_SOURCE_PREFIX
    name = name.strip()
    return name if name.startswith(GA4_SOURCE_PREFIX) else f"{GA4_SOURCE_PREFIX} {name}"

# ── Account-to-Division mapping ──────────────────────────────────────────────
ACCOUNT_DIVISION_MAP: Dict[str, str] = {
    "115324581": "sanitred",   # Sani-Tred (Primary Retail)
    "178431870": "cp",         # CP eStore
    "108635203": "cp",         # CP Websites (13 properties)
    "174590625": "ibos",       # I-BOS (16 contractor websites)
    "175160117": "ibos",       # DCKN Lead Gen (48 properties — managed under I-BOS)
}

# Accounts whose properties auto-create contractor records as pending_admin
CONTRACTOR_ACCOUNT_IDS = {"174590625", "175160117"}

# Accounts we explicitly iterate (order preserved for logging)
TARGET_ACCOUNT_IDS = list(ACCOUNT_DIVISION_MAP.keys())

# ── In-memory cache ──────────────────────────────────────────────────────────
_discovery_cache: List[Dict[str, Any]] = []
_cache_ts: float = 0
_CACHE_TTL: int = 600  # 10 minutes


def _init_ga4_admin_client():
    """
    Initialize the GA4 Admin API client using the service-account
    credentials from GA4_CREDENTIALS_JSON.
    """
    try:
        from google.analytics.admin_v1beta import AnalyticsAdminServiceClient
    except ImportError:
        try:
            from google.analytics.admin import AnalyticsAdminServiceClient
        except ImportError:
            logger.warning(
                "google-analytics-admin SDK not installed — "
                "GA4 auto-discovery unavailable. "
                "Install with: pip install google-analytics-admin"
            )
            return None

    cred_value = (settings.GA4_CREDENTIALS_JSON or "").strip()
    if not cred_value:
        logger.warning("GA4_CREDENTIALS_JSON not set — cannot discover properties")
        return None

    if cred_value.startswith("{"):
        _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        _tmp.write(cred_value)
        _tmp.close()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmp.name
    else:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_value

    return AnalyticsAdminServiceClient()


async def discover_all_ga4_properties(
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    """
    Discover every GA4 property under our five target accounts.

    Calls ``listAccountSummaries()`` once (which returns ALL accounts the
    service account can see), then filters to only our target accounts.
    Each property is tagged with its division based on the account mapping.

    Returns:
        [
          {
            "account_id": "115324581",
            "account_name": "Sani-Tred",
            "property_id": "67890",
            "display_name": "Sani-Tred Main Site",
            "division": "sanitred",
          },
          ...
        ]
    """
    global _discovery_cache, _cache_ts

    if not force_refresh and _discovery_cache and (time.time() - _cache_ts < _CACHE_TTL):
        return _discovery_cache

    client = _init_ga4_admin_client()
    if not client:
        return _discovery_cache or []

    try:
        properties: List[Dict[str, Any]] = []
        summaries = client.list_account_summaries()

        for account_summary in summaries:
            # Extract numeric account ID from "accounts/115324581"
            acct_resource = account_summary.account or ""
            acct_id = acct_resource.split("/")[-1] if "/" in acct_resource else acct_resource
            acct_name = account_summary.display_name or acct_resource

            # Only process our target accounts
            if acct_id not in ACCOUNT_DIVISION_MAP:
                logger.debug("Skipping non-target account %s (%s)", acct_id, acct_name)
                continue

            division = ACCOUNT_DIVISION_MAP[acct_id]

            for prop_summary in (account_summary.property_summaries or []):
                prop_resource = prop_summary.property  # "properties/12345"
                prop_id = (
                    prop_resource.split("/")[-1]
                    if "/" in prop_resource
                    else prop_resource
                )
                properties.append({
                    "account_id": acct_id,
                    "account_name": acct_name,
                    "property_id": prop_id,
                    "display_name": prop_summary.display_name or prop_resource,
                    "division": division,
                })

        _discovery_cache = properties
        _cache_ts = time.time()

        # Log summary per account
        from collections import Counter
        div_counts = Counter(p["division"] for p in properties)
        logger.info(
            "GA4 account-level discovery found %d total properties: %s",
            len(properties),
            ", ".join(f"{d}={c}" for d, c in sorted(div_counts.items())),
        )
        return properties

    except Exception as exc:
        logger.error("GA4 account-level discovery failed: %s", exc)
        return _discovery_cache or []


async def persist_discovered_properties(db) -> Dict[str, Any]:
    """
    Discover all GA4 properties and upsert them into the ``ga4_properties``
    table.  Also auto-creates contractors for DCKN properties.

    Returns a summary dict with counts.
    """
    from sqlalchemy import select
    from app.models.ga4_property import GA4Property
    from app.models.contractor import Contractor

    properties = await discover_all_ga4_properties(force_refresh=True)
    if not properties:
        return {"discovered": 0, "inserted": 0, "updated": 0, "contractors_created": 0}

    now = datetime.now(timezone.utc)
    inserted = 0
    updated = 0
    contractors_created = 0

    for prop in properties:
        # Check if property already exists
        result = await db.execute(
            select(GA4Property).where(GA4Property.property_id == prop["property_id"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update display name / account name if changed, but NEVER
            # overwrite admin-controlled fields (enabled, status)
            changed = False
            if existing.display_name != prop["display_name"]:
                existing.display_name = prop["display_name"]
                changed = True
            if existing.account_name != prop["account_name"]:
                existing.account_name = prop["account_name"]
                changed = True
            if changed:
                existing.updated_at = now
                updated += 1
        else:
            # New property — determine initial status
            acct_id = prop["account_id"]
            division = prop["division"]

            # Properties from contractor accounts (I-BOS + DCKN) start pending
            is_contractor_acct = acct_id in CONTRACTOR_ACCOUNT_IDS
            initial_enabled = division in ("cp", "sanitred") and not is_contractor_acct
            initial_status = "pending_admin" if is_contractor_acct else "active"

            # Generate a contractor slug for all I-BOS division properties
            contractor_slug = None
            if division == "ibos":
                contractor_slug = _make_contractor_slug(prop["display_name"], prop["property_id"])

            ga4_prop = GA4Property(
                property_id=prop["property_id"],
                account_id=prop["account_id"],
                account_name=prop["account_name"],
                display_name=prop["display_name"],
                division=division,
                enabled=initial_enabled,
                status=initial_status,
                contractor_id=contractor_slug,
                discovered_at=now,
                updated_at=now,
            )
            db.add(ga4_prop)
            inserted += 1

            # Auto-create contractor record for contractor-account properties
            if is_contractor_acct and contractor_slug:
                existing_contractor = await db.execute(
                    select(Contractor).where(Contractor.id == contractor_slug)
                )
                if not existing_contractor.scalar_one_or_none():
                    db.add(Contractor(
                        id=contractor_slug,
                        name=_with_ga4_prefix(prop["display_name"]),
                        division="ibos",
                        active=False,
                        status="pending_admin",
                        updated_at=now,
                    ))
                    contractors_created += 1
                    logger.info(
                        "Auto-created contractor '%s' for GA4 property %s (account %s)",
                        contractor_slug, prop["property_id"], acct_id,
                    )

    await db.commit()

    summary = {
        "discovered": len(properties),
        "inserted": inserted,
        "updated": updated,
        "contractors_created": contractors_created,
    }
    logger.info("GA4 property persistence complete: %s", summary)
    return summary


def _make_contractor_slug(display_name: str, property_id: str) -> str:
    """
    Generate a URL-safe contractor slug from a property display name.

    Examples:
        "Columbus Concrete Coatings" → "columbus-concrete-coatings"
        "GA4 Property 12345"         → "ga4-prop-12345"
    """
    import re
    slug = display_name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    if not slug or len(slug) < 3:
        slug = f"ga4-prop-{property_id}"
    # Cap length
    return slug[:64]


async def get_properties_for_division(
    db,
    division: str,
    enabled_only: bool = True,
) -> List[Dict[str, Any]]:
    """
    Return all GA4 properties for a division from the database.

    Used by the Property Switcher dropdown and the web-analytics endpoint
    to resolve which property_id(s) to query.
    """
    from sqlalchemy import select
    from app.models.ga4_property import GA4Property

    stmt = select(GA4Property).where(GA4Property.division == division)
    if enabled_only:
        stmt = stmt.where(GA4Property.enabled == True)  # noqa: E712
    stmt = stmt.order_by(GA4Property.display_name)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "property_id": row.property_id,
            "display_name": row.display_name,
            "account_name": row.account_name,
            "account_id": row.account_id,
            "division": row.division,
            "enabled": row.enabled,
            "status": row.status,
            "contractor_id": row.contractor_id,
        }
        for row in rows
    ]


async def resolve_primary_property(db, division: str) -> Optional[str]:
    """
    Resolve the single 'primary' GA4 property ID for a division.

    For CP / Sani-Tred — returns the first enabled property.
    For I-BOS / DCKN — returns the first enabled property (default view);
    the Property Switcher lets the user select a specific one.

    Falls back to env vars if no DB properties exist.
    """
    from sqlalchemy import select
    from app.models.ga4_property import GA4Property

    stmt = (
        select(GA4Property.property_id)
        .where(
            GA4Property.division == division,
            GA4Property.enabled == True,  # noqa: E712
        )
        .order_by(GA4Property.discovered_at)
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row:
        return row

    # Fallback to env vars
    env_map = {
        "cp": settings.GA4_PROPERTY_ID_CP,
        "sanitred": settings.GA4_PROPERTY_ID_SANITRED,
        "ibos": settings.GA4_PROPERTY_ID_IBOS,
    }
    if env_map.get(division):
        return env_map[division]

    return settings.GA4_PROPERTY_ID or None


async def get_discovery_status(db=None) -> Dict[str, Any]:
    """
    Return a status report for the GA4 discovery system.
    """
    properties = await discover_all_ga4_properties()

    # Group by division
    from collections import defaultdict
    by_division = defaultdict(list)
    for p in properties:
        by_division[p["division"]].append(p)

    # Also run raw diagnostic to show what the API actually returns
    raw_accounts = await _raw_list_accounts()

    return {
        "total_properties": len(properties),
        "by_division": {
            div: {"count": len(props), "properties": props}
            for div, props in sorted(by_division.items())
        },
        "target_accounts": ACCOUNT_DIVISION_MAP,
        "raw_accounts_visible": raw_accounts,
        "env_overrides": {
            "GA4_PROPERTY_ID": settings.GA4_PROPERTY_ID or "(not set)",
            "GA4_PROPERTY_ID_CP": settings.GA4_PROPERTY_ID_CP or "(not set)",
            "GA4_PROPERTY_ID_SANITRED": settings.GA4_PROPERTY_ID_SANITRED or "(not set)",
            "GA4_PROPERTY_ID_IBOS": settings.GA4_PROPERTY_ID_IBOS or "(not set)",
            "GA4_CREDENTIALS_JSON": "configured" if settings.GA4_CREDENTIALS_JSON else "(not set)",
        },
    }


async def _raw_list_accounts() -> List[Dict[str, Any]]:
    """
    Diagnostic: list ALL accounts and properties visible to the
    service account, with NO filtering.  Used to debug mismatched
    account IDs.
    """
    client = _init_ga4_admin_client()
    if not client:
        return [{"error": "Admin API client could not be initialized"}]

    try:
        results = []
        summaries = client.list_account_summaries()
        for acct in summaries:
            acct_resource = acct.account or ""
            acct_id = acct_resource.split("/")[-1] if "/" in acct_resource else acct_resource
            props = []
            for p in (acct.property_summaries or []):
                prop_resource = p.property
                pid = prop_resource.split("/")[-1] if "/" in prop_resource else prop_resource
                props.append({"property_id": pid, "display_name": p.display_name})
            results.append({
                "account_id": acct_id,
                "account_resource": acct_resource,
                "account_name": acct.display_name,
                "property_count": len(props),
                "properties": props[:5],  # First 5 only to keep response small
                "properties_total": len(props),
            })
        return results
    except Exception as exc:
        return [{"error": str(exc)}]
