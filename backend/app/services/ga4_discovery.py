"""
GA4 Property Auto-Discovery Service.

Uses the Google Analytics Admin API (`listAccountSummaries`) to discover
all GA4 properties the service account can access.  Then applies fuzzy
name matching to map each property to a business division (CP, Sani-Tred,
I-BOS) so the correct property ID is used for each dashboard.

Usage:
    properties = await discover_ga4_properties()
    mapping    = await match_properties_to_divisions()
"""

import json
import logging
import os
import re
import tempfile
import time
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── In-memory cache ────────────────────────────────────────────────────────────
_discovery_cache: List[Dict[str, Any]] = []
_cache_ts: float = 0
_CACHE_TTL: int = 600  # 10 minutes

# ── Division fuzzy-match patterns ──────────────────────────────────────────────
# Each division has a list of regex patterns that match property display names.
# Order matters — first match wins.
_DIVISION_PATTERNS = {
    "cp": [
        re.compile(r"concrete\s*protect", re.IGNORECASE),
        re.compile(r"\bCP\b"),
        re.compile(r"decorative\s*concrete", re.IGNORECASE),
        re.compile(r"theconcreteprotector", re.IGNORECASE),
    ],
    "sanitred": [
        re.compile(r"sani.?tred", re.IGNORECASE),
        re.compile(r"sanitred", re.IGNORECASE),
    ],
    "ibos": [
        re.compile(r"i.?bos", re.IGNORECASE),
        re.compile(r"ibos", re.IGNORECASE),
        re.compile(r"business\s*operating", re.IGNORECASE),
    ],
}


def _init_ga4_admin_client():
    """
    Initialize the GA4 Admin API client using the same credentials
    as the GA4 Data API pipeline.
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


async def discover_ga4_properties(
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    """
    Discover all GA4 properties the service account can access.

    Uses `listAccountSummaries()` from the GA4 Admin API, which returns
    every account + property the service-account credential has at least
    Viewer access to.

    Returns a list of dicts:
        [
          {
            "account": "accounts/12345",
            "account_name": "My Company",
            "property": "properties/67890",
            "property_id": "67890",
            "display_name": "CP - Main Site",
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
            acct_name = account_summary.display_name or account_summary.account
            for prop_summary in (account_summary.property_summaries or []):
                prop_resource = prop_summary.property  # "properties/12345"
                prop_id = prop_resource.split("/")[-1] if "/" in prop_resource else prop_resource
                properties.append({
                    "account": account_summary.account,
                    "account_name": acct_name,
                    "property": prop_resource,
                    "property_id": prop_id,
                    "display_name": prop_summary.display_name or prop_resource,
                })

        _discovery_cache = properties
        _cache_ts = time.time()
        logger.info("GA4 auto-discovery found %d properties", len(properties))
        return properties

    except Exception as exc:
        logger.error("GA4 auto-discovery failed: %s", exc)
        return _discovery_cache or []


async def match_properties_to_divisions() -> Dict[str, Optional[str]]:
    """
    Match discovered GA4 properties to divisions using fuzzy name matching.

    Returns:
        {
          "cp": "12345" or None,
          "sanitred": "67890" or None,
          "ibos": "11111" or None,
        }

    The matching first checks if division-specific env vars are set
    (GA4_PROPERTY_ID_CP, etc.) and uses those as overrides.  For any
    division without an explicit env var, it tries to match by property
    display name.
    """
    # Start with explicit env var overrides
    mapping: Dict[str, Optional[str]] = {
        "cp": settings.GA4_PROPERTY_ID_CP or None,
        "sanitred": settings.GA4_PROPERTY_ID_SANITRED or None,
        "ibos": settings.GA4_PROPERTY_ID_IBOS or None,
    }

    # If all three are already set, no need to auto-discover
    if all(mapping.values()):
        logger.info("All GA4 property IDs set via env vars — skipping auto-discovery")
        return mapping

    # Discover properties
    properties = await discover_ga4_properties()
    if not properties:
        # Fall back to shared GA4_PROPERTY_ID for unset divisions
        fallback = settings.GA4_PROPERTY_ID or None
        for div in mapping:
            if not mapping[div]:
                mapping[div] = fallback
        return mapping

    # For each unset division, try fuzzy matching
    for div, patterns in _DIVISION_PATTERNS.items():
        if mapping[div]:
            continue  # Already set by env var

        for prop in properties:
            name = prop.get("display_name", "")
            for pattern in patterns:
                if pattern.search(name):
                    mapping[div] = prop["property_id"]
                    logger.info(
                        "GA4 auto-discovery matched '%s' → %s (property %s)",
                        name, div, prop["property_id"],
                    )
                    break
            if mapping[div]:
                break

    # Final fallback for any still-unmatched divisions
    fallback = settings.GA4_PROPERTY_ID or None
    for div in mapping:
        if not mapping[div]:
            mapping[div] = fallback

    return mapping


async def get_discovery_status() -> Dict[str, Any]:
    """
    Return a status report for the GA4 auto-discovery system.

    Useful for the admin/integrations UI to show which properties
    are discovered and how they're mapped.
    """
    properties = await discover_ga4_properties()
    mapping = await match_properties_to_divisions()

    return {
        "total_properties": len(properties),
        "properties": properties,
        "division_mapping": mapping,
        "env_overrides": {
            "GA4_PROPERTY_ID": settings.GA4_PROPERTY_ID or "(not set)",
            "GA4_PROPERTY_ID_CP": settings.GA4_PROPERTY_ID_CP or "(not set)",
            "GA4_PROPERTY_ID_SANITRED": settings.GA4_PROPERTY_ID_SANITRED or "(not set)",
            "GA4_PROPERTY_ID_IBOS": settings.GA4_PROPERTY_ID_IBOS or "(not set)",
            "GA4_CREDENTIALS_JSON": "configured" if settings.GA4_CREDENTIALS_JSON else "(not set)",
        },
    }
