"""
ONE-OFF DISCOVERY SCRIPT — does NOT modify any data.

Asks two questions:
  1. Does HubSpot have any custom property that looks like ATTENDANCE
     (vs the existing `training_class` which is the SIGNUP signal)?
  2. What categorical values are already in our local hubspot_contacts
     table for training_class / lifecycle_stage / recent_form? Some of
     those may encode attendance state already.

Outputs only metadata + categories — no PII (no names, emails, phones).

Run on Railway:
    railway run --service i-dash python -m scripts.discover_training_attendance

Or locally with creds set:
    HUBSPOT_ACCESS_TOKEN=... DATABASE_URL=... python -m scripts.discover_training_attendance

Safe to delete this file after we have what we need.
"""

import asyncio
import os
import sys
from pathlib import Path

# Make `app` importable when run via `python -m scripts.<name>`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hubspot import Client
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_maker


# Keywords that suggest a property is about attendance / completion / no-show
# (vs registration / signup which we already capture as `training_class`).
ATTENDANCE_KEYWORDS = (
    "attend", "attended", "attendance",
    "complete", "completed", "completion",
    "no_show", "no-show", "noshow", "no.show",
    "showed", "show_up",
    "training_status", "training_complete",
    "registered", "registration_status",
)


def _hubspot_client() -> Client:
    token = settings.HUBSPOT_ACCESS_TOKEN or settings.HUBSPOT_API_KEY
    if not token:
        raise RuntimeError(
            "No HubSpot token — set HUBSPOT_ACCESS_TOKEN or HUBSPOT_API_KEY"
        )
    return Client(access_token=token)


def discover_hubspot_properties() -> None:
    """List every custom property defined on Contacts and Deals in this
    HubSpot portal. Filter to ones that look attendance-related. Prints
    only property names + types — no contact data."""
    client = _hubspot_client()
    print("\n=== HubSpot Contact properties (filtered for attendance keywords) ===")
    try:
        contacts_resp = client.crm.properties.core_api.get_all(object_type="contacts")
        contact_props = contacts_resp.results or []
        candidates = [
            p for p in contact_props
            if any(
                kw in (p.name or "").lower() or kw in (p.label or "").lower()
                for kw in ATTENDANCE_KEYWORDS
            )
        ]
        if not candidates:
            print("(no contact properties matched attendance keywords)")
            print(f"\n  Total contact properties scanned: {len(contact_props)}")
        else:
            for p in candidates:
                print(f"  • {p.name}  |  label='{p.label}'  |  type={p.type}  |  fieldType={p.field_type}")
    except Exception as exc:
        print(f"  ERROR fetching contact properties: {exc}")

    print("\n=== HubSpot Deal properties (filtered for attendance keywords) ===")
    try:
        deals_resp = client.crm.properties.core_api.get_all(object_type="deals")
        deal_props = deals_resp.results or []
        candidates = [
            p for p in deal_props
            if any(
                kw in (p.name or "").lower() or kw in (p.label or "").lower()
                for kw in ATTENDANCE_KEYWORDS
            )
        ]
        if not candidates:
            print("(no deal properties matched attendance keywords)")
            print(f"\n  Total deal properties scanned: {len(deal_props)}")
        else:
            for p in candidates:
                print(f"  • {p.name}  |  label='{p.label}'  |  type={p.type}  |  fieldType={p.field_type}")
    except Exception as exc:
        print(f"  ERROR fetching deal properties: {exc}")

    # Also dump training-related properties so we know what's there
    print("\n=== Contact properties matching 'train' (signup-side context) ===")
    try:
        for p in contact_props:
            if "train" in (p.name or "").lower() or "train" in (p.label or "").lower():
                print(f"  • {p.name}  |  label='{p.label}'  |  type={p.type}")
    except Exception:
        pass


async def discover_local_data() -> None:
    """Read distinct categorical values from our hubspot_contacts table.
    Does not return PII — only category counts."""
    print("\n=== Local hubspot_contacts category counts ===")
    async with async_session_maker() as session:
        # 1. Total + training-flagged counts
        try:
            res = await session.execute(text("""
                SELECT COUNT(*) AS total,
                       COUNT(training_class) AS with_training_class,
                       SUM(CASE WHEN is_training_lead THEN 1 ELSE 0 END) AS is_training_lead_count
                FROM hubspot_contacts
            """))
            row = res.first()
            if row:
                print(f"  total={row[0]}  with_training_class={row[1]}  is_training_lead_count={row[2]}")
        except Exception as exc:
            print(f"  ERROR on count query: {exc}")

        # 2. Distinct training_class values
        try:
            res = await session.execute(text("""
                SELECT training_class, COUNT(*) AS c
                FROM hubspot_contacts
                WHERE training_class IS NOT NULL AND training_class != ''
                GROUP BY training_class
                ORDER BY c DESC
                LIMIT 50
            """))
            print("\n  -- distinct training_class (top 50) --")
            for tc, c in res.all():
                print(f"    [{c:>5}]  {tc!r}")
        except Exception as exc:
            print(f"  ERROR on training_class query: {exc}")

        # 3. Distinct lifecycle_stage values
        try:
            res = await session.execute(text("""
                SELECT lifecycle_stage, COUNT(*) AS c
                FROM hubspot_contacts
                WHERE lifecycle_stage IS NOT NULL AND lifecycle_stage != ''
                GROUP BY lifecycle_stage
                ORDER BY c DESC
                LIMIT 50
            """))
            print("\n  -- distinct lifecycle_stage (top 50) --")
            for ls, c in res.all():
                print(f"    [{c:>5}]  {ls!r}")
        except Exception as exc:
            print(f"  ERROR on lifecycle_stage query: {exc}")

        # 4. recent_form values matching attendance keywords
        try:
            res = await session.execute(text("""
                SELECT recent_form, COUNT(*) AS c
                FROM hubspot_contacts
                WHERE recent_form ILIKE ANY (ARRAY['%attend%', '%complete%', '%no.show%', '%no_show%', '%register%'])
                GROUP BY recent_form
                ORDER BY c DESC
                LIMIT 50
            """))
            print("\n  -- recent_form values matching attendance keywords --")
            rows = res.all()
            if not rows:
                print("    (none — recent_form does not appear to encode attendance)")
            for rf, c in rows:
                print(f"    [{c:>5}]  {rf!r}")
        except Exception as exc:
            print(f"  ERROR on recent_form query: {exc}")


def main() -> None:
    print("HubSpot training-attendance discovery (read-only)")
    print(f"Environment: {os.environ.get('ENVIRONMENT', 'unknown')}")
    discover_hubspot_properties()
    asyncio.run(discover_local_data())
    print("\nDone. No data modified.")


if __name__ == "__main__":
    main()
