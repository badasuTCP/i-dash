"""
HubSpot Owner Mapping Service.

Fetches and caches the /crm/v3/owners/ endpoint so every other service
can resolve owner IDs to human-readable names without repeated API calls.

Usage:
    owners = await get_hubspot_owners()       # dict  { "12345": {"id": "12345", "first": "Kathy", "last": "Smith", "email": "..."}, ... }
    name   = await resolve_owner_name("12345") # "Kathy Smith"
"""

import logging
import time
from typing import Any, Dict, Optional

from hubspot import Client

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── In-memory cache (TTL-based) ─────────────────────────────────────────────
_owner_cache: Dict[str, Dict[str, Any]] = {}
_cache_ts: float = 0
_CACHE_TTL: int = 600  # 10 minutes


async def get_hubspot_owners(force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Return a dict keyed by owner ID with name/email metadata.

    Hits HubSpot only if the cache is stale (>10 min) or empty.
    Handles pagination automatically.
    """
    global _owner_cache, _cache_ts

    if not force_refresh and _owner_cache and (time.time() - _cache_ts < _CACHE_TTL):
        return _owner_cache

    if not settings.HUBSPOT_API_KEY:
        logger.warning("HUBSPOT_API_KEY not set — cannot fetch owners")
        return _owner_cache or {}

    try:
        client = Client(access_token=settings.HUBSPOT_API_KEY)
        owners_map: Dict[str, Dict[str, Any]] = {}

        # get_all() auto-paginates through /crm/v3/owners/
        all_owners = client.crm.owners.get_all()
        for owner in all_owners:
            oid = str(owner.id)
            owners_map[oid] = {
                "id": oid,
                "first": owner.first_name or "",
                "last": owner.last_name or "",
                "email": owner.email or "",
            }

        _owner_cache = owners_map
        _cache_ts = time.time()
        logger.info("Refreshed HubSpot owner cache — %d owners", len(owners_map))
        return owners_map

    except Exception as exc:
        # Detect HubSpot 403 (missing scope) and re-raise so callers can surface it
        status_code = getattr(exc, "status", None) or getattr(exc, "status_code", None)
        if status_code == 403:
            logger.error("HubSpot 403 Forbidden — missing scope (likely crm.objects.owners.read): %s", exc)
            raise  # let the caller handle 403 specifically
        logger.error("Failed to fetch HubSpot owners: %s", exc)
        return _owner_cache or {}


async def resolve_owner_name(owner_id: Optional[str]) -> str:
    """
    Resolve an owner ID to 'First Last'.  Falls back to 'Unknown Rep'.
    """
    if not owner_id:
        return "Unassigned"
    owners = await get_hubspot_owners()
    owner = owners.get(str(owner_id))
    if owner:
        full = f"{owner['first']} {owner['last']}".strip()
        return full or owner.get("email", "Unknown Rep")
    return "Unknown Rep"


async def resolve_owner_avatar(owner_id: Optional[str]) -> str:
    """
    Return a two-letter avatar string (initials) for the owner.
    """
    if not owner_id:
        return "??"
    owners = await get_hubspot_owners()
    owner = owners.get(str(owner_id))
    if owner and owner["first"]:
        return (owner["first"][0] + (owner["last"][0] if owner["last"] else "")).upper()
    return "??"
