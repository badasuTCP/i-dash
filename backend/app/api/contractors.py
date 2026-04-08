"""
Contractor visibility API for I-Dash Analytics Platform.

Provides CRUD-like endpoints for managing contractor visibility state,
persisted in the database so toggles survive logout / session changes.

Supports Meta Auto-Discovery: the Meta pipeline can insert new contractors
with status='pending_admin'.  The /pending endpoint surfaces these for
Super Admin review.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.contractor import Contractor
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contractors", tags=["Contractors"])

# ── Seed data (source of truth for contractor names / defaults) ──────────
CONTRACTOR_DEFAULTS = [
    {"id": "beckley",      "name": "Beckley Concrete Decor",      "division": "i-bos", "active": True,  "status": "active"},
    {"id": "tailored",     "name": "Tailored Concrete Coatings",  "division": "i-bos", "active": True,  "status": "active"},
    {"id": "slg",          "name": "SLG Concrete Coatings",       "division": "i-bos", "active": True,  "status": "active"},
    {"id": "columbus",     "name": "Columbus Concrete Coatings",  "division": "i-bos", "active": True,  "status": "active"},
    {"id": "tvs",          "name": "TVS Coatings",                "division": "i-bos", "active": False, "status": "inactive"},
    {"id": "eminence",     "name": "Eminence",                    "division": "i-bos", "active": False, "status": "inactive"},
    {"id": "permasurface", "name": "PermaSurface",                "division": "i-bos", "active": False, "status": "inactive"},
    {"id": "diamond",      "name": "Diamond Topcoat",             "division": "i-bos", "active": False, "status": "inactive"},
    {"id": "floorwarriors","name": "Floor Warriors",              "division": "i-bos", "active": True,  "status": "active"},
    {"id": "graber",       "name": "Graber Design Coatings",      "division": "i-bos", "active": True,  "status": "active"},
    {"id": "decorative",   "name": "Decorative Concrete Idaho",   "division": "i-bos", "active": False, "status": "inactive"},
    {"id": "reeves",       "name": "Reeves Concrete Solutions",   "division": "i-bos", "active": True,  "status": "active"},
    {"id": "elitepool",    "name": "Elite Pool Coatings",         "division": "i-bos", "active": True,  "status": "active"},
]


# ── Pydantic schemas ────────────────────────────────────────────────────
class ContractorResponse(BaseModel):
    id: str
    name: str
    division: str
    active: bool
    status: str = "active"
    meta_account_id: Optional[str] = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class VisibilityUpdate(BaseModel):
    active: bool


class BulkVisibilityUpdate(BaseModel):
    active: bool


class ApproveContractorUpdate(BaseModel):
    """Body for approving or rejecting a pending contractor."""
    active: bool = True
    reject: bool = False  # Set True to reject instead of approve
    name: Optional[str] = None  # Allow admin to rename on approval
    division: str = "i-bos"


# ── Helper: ensure rows exist (auto-seed on first call) ─────────────────
async def _ensure_seeded(db: AsyncSession) -> None:
    """Insert default contractors if the table is empty."""
    result = await db.execute(select(Contractor).limit(1))
    if result.scalar_one_or_none() is not None:
        return  # already seeded

    now = datetime.now(timezone.utc)
    for c in CONTRACTOR_DEFAULTS:
        db.add(Contractor(
            id=c["id"],
            name=c["name"],
            division=c["division"],
            active=c["active"],
            status=c.get("status", "active"),
            updated_at=now,
        ))
    await db.commit()
    logger.info("Seeded %d contractors into database", len(CONTRACTOR_DEFAULTS))


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=List[ContractorResponse],
    summary="List all contractors with visibility status",
)
async def list_contractors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ContractorResponse]:
    """
    Return every contractor and its current visibility flag.

    Merges two sources:
      1. The ``contractors`` table (seed data + Meta-discovered)
      2. The ``ga4_properties`` table (GA4-discovered, where contractor_id is set)

    GA4-discovered properties that are not yet in the contractors table are
    included as pending_admin entries so they appear in the Admin Controls UI.
    """
    await _ensure_seeded(db)

    # 1. All contractors from the dedicated table
    result = await db.execute(select(Contractor).order_by(Contractor.name))
    contractors = result.scalars().all()
    seen_ids = {c.id for c in contractors}

    # 2. Merge GA4-discovered contractor properties not yet in contractors table
    try:
        from app.models.ga4_property import GA4Property

        ga4_result = await db.execute(
            select(GA4Property)
            .where(
                GA4Property.contractor_id.isnot(None),
                GA4Property.division == "ibos",
            )
            .order_by(GA4Property.display_name)
        )
        ga4_props = ga4_result.scalars().all()

        for prop in ga4_props:
            if prop.contractor_id not in seen_ids:
                # Synthesize a ContractorResponse from the GA4 property
                contractors.append(
                    _ga4_prop_to_contractor(prop)
                )
                seen_ids.add(prop.contractor_id)
    except Exception as exc:
        logger.warning("Could not merge GA4 properties into contractor list: %s", exc)

    # Sort combined list by name
    contractors.sort(key=lambda c: getattr(c, 'name', '') or '')

    return [ContractorResponse.model_validate(c) for c in contractors]


def _ga4_prop_to_contractor(prop):
    """
    Create a lightweight Contractor-compatible object from a GA4Property row.
    Used to surface GA4-discovered contractors in the Admin Controls UI.
    """
    from datetime import datetime, timezone

    class _FakeContractor:
        """Minimal object that ContractorResponse.model_validate can handle."""
        def __init__(self, p):
            self.id = p.contractor_id
            self.name = p.display_name
            self.division = "ibos"
            self.active = p.enabled
            self.status = p.status or "pending_admin"
            self.meta_account_id = None
            self.updated_at = p.updated_at

    return _FakeContractor(prop)


@router.put(
    "/{contractor_id}/visibility",
    response_model=ContractorResponse,
    summary="Toggle a single contractor's dashboard visibility",
)
async def update_visibility(
    contractor_id: str,
    body: VisibilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContractorResponse:
    """Set a contractor visible or hidden on all dashboards."""
    # Only admins can change visibility
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change contractor visibility.",
        )

    await _ensure_seeded(db)

    result = await db.execute(
        select(Contractor).where(Contractor.id == contractor_id)
    )
    contractor = result.scalar_one_or_none()

    if contractor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contractor '{contractor_id}' not found.",
        )

    contractor.active = body.active
    # Keep status in sync — if admin toggles visibility, clear pending state
    if contractor.status == "pending_admin":
        contractor.status = "active" if body.active else "inactive"
    else:
        contractor.status = "active" if body.active else "inactive"
    contractor.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(contractor)

    logger.info(
        "User %s set contractor %s active=%s status=%s",
        current_user.email,
        contractor_id,
        body.active,
        contractor.status,
    )
    return ContractorResponse.model_validate(contractor)


@router.put(
    "/bulk-visibility",
    response_model=List[ContractorResponse],
    summary="Set all contractors visible or hidden at once",
)
async def bulk_update_visibility(
    body: BulkVisibilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ContractorResponse]:
    """Enable All / Disable All — bulk toggle."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change contractor visibility.",
        )

    await _ensure_seeded(db)

    now = datetime.now(timezone.utc)
    result = await db.execute(select(Contractor))
    contractors = result.scalars().all()

    for c in contractors:
        c.active = body.active
        c.updated_at = now

    await db.commit()

    # Re-fetch to return refreshed state
    result = await db.execute(select(Contractor).order_by(Contractor.name))
    updated = result.scalars().all()

    logger.info(
        "User %s bulk-set all contractors active=%s",
        current_user.email,
        body.active,
    )
    return [ContractorResponse.model_validate(c) for c in updated]


# ── Pending / Auto-Discovery endpoints ──────────────────────────────────

@router.get(
    "/pending",
    response_model=List[ContractorResponse],
    summary="List contractors awaiting admin approval",
)
async def list_pending_contractors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ContractorResponse]:
    """
    Return contractors discovered by Meta or GA4 pipelines that have not yet
    been reviewed by a Super Admin (status == 'pending_admin').

    Merges both ``contractors`` and ``ga4_properties`` tables.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view pending contractors.",
        )

    await _ensure_seeded(db)

    # From contractors table — only truly pending ones
    result = await db.execute(
        select(Contractor)
        .where(Contractor.status == "pending_admin")
        .order_by(Contractor.updated_at.desc())
    )
    pending = list(result.scalars().all())
    seen_ids = {c.id for c in pending}

    # Build set of contractor IDs that have already been reviewed
    # (approved, rejected, active, inactive) — these must NOT reappear
    reviewed_result = await db.execute(
        select(Contractor.id).where(
            Contractor.status.in_(["active", "inactive", "rejected"])
        )
    )
    reviewed_ids = {row[0] for row in reviewed_result.fetchall()}

    # From ga4_properties table — exclude already-reviewed contractors
    try:
        from app.models.ga4_property import GA4Property

        ga4_result = await db.execute(
            select(GA4Property)
            .where(
                GA4Property.contractor_id.isnot(None),
                GA4Property.status == "pending_admin",
            )
            .order_by(GA4Property.display_name)
        )
        for prop in ga4_result.scalars().all():
            cid = prop.contractor_id
            if cid not in seen_ids and cid not in reviewed_ids:
                pending.append(_ga4_prop_to_contractor(prop))
                seen_ids.add(cid)
    except Exception as exc:
        logger.warning("Could not merge GA4 pending properties: %s", exc)

    return [ContractorResponse.model_validate(row) for row in pending]


@router.get(
    "/pending/count",
    summary="Count of pending contractors (for badge / notification)",
)
async def pending_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """Quick count for the admin notification badge (contractors + GA4 properties)."""
    if current_user.role != UserRole.ADMIN:
        return {"count": 0}

    await _ensure_seeded(db)

    # Count from contractors table
    result = await db.execute(
        select(Contractor).where(Contractor.status == "pending_admin")
    )
    contractor_ids = {c.id for c in result.scalars().all()}
    count = len(contractor_ids)

    # Already-reviewed contractors must never reappear as pending
    reviewed_result = await db.execute(
        select(Contractor.id).where(
            Contractor.status.in_(["active", "inactive", "rejected"])
        )
    )
    reviewed_ids = {row[0] for row in reviewed_result.fetchall()}

    # Count from ga4_properties table (exclude reviewed)
    try:
        from app.models.ga4_property import GA4Property

        ga4_result = await db.execute(
            select(GA4Property)
            .where(
                GA4Property.contractor_id.isnot(None),
                GA4Property.status == "pending_admin",
            )
        )
        for prop in ga4_result.scalars().all():
            cid = prop.contractor_id
            if cid not in contractor_ids and cid not in reviewed_ids:
                count += 1
                contractor_ids.add(cid)
    except Exception:
        pass

    return {"count": count}


@router.get(
    "/rejected",
    response_model=List[ContractorResponse],
    summary="List rejected contractors (audit trail)",
)
async def list_rejected_contractors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ContractorResponse]:
    """
    Return contractors that were rejected by an admin.
    These are never deleted — kept for audit and recovery.
    An admin can re-approve a rejected contractor via the /approve endpoint.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view rejected contractors.",
        )

    await _ensure_seeded(db)

    result = await db.execute(
        select(Contractor)
        .where(Contractor.status == "rejected")
        .order_by(Contractor.updated_at.desc())
    )
    rejected = list(result.scalars().all())
    return [ContractorResponse.model_validate(row) for row in rejected]


@router.put(
    "/{contractor_id}/approve",
    response_model=ContractorResponse,
    summary="Approve a pending contractor discovered by Meta pipeline",
)
async def approve_contractor(
    contractor_id: str,
    body: ApproveContractorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContractorResponse:
    """
    Approve (or reject) a contractor that was auto-discovered by the Meta
    pipeline.  Sets status → 'active' (or 'inactive') and optionally
    updates the display name and division.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can approve contractors.",
        )

    await _ensure_seeded(db)

    result = await db.execute(
        select(Contractor).where(Contractor.id == contractor_id)
    )
    contractor = result.scalar_one_or_none()

    if contractor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contractor '{contractor_id}' not found.",
        )

    if body.reject:
        # Reject: keep the record for audit, mark as rejected
        contractor.active = False
        contractor.status = "rejected"
    else:
        contractor.active = body.active
        contractor.status = "active" if body.active else "inactive"

    if body.name:
        contractor.name = body.name
    contractor.division = body.division
    contractor.updated_at = datetime.now(timezone.utc)

    # Sync GA4 property status so it doesn't keep appearing as pending
    try:
        from app.models.ga4_property import GA4Property
        ga4_props = await db.execute(
            select(GA4Property).where(GA4Property.contractor_id == contractor_id)
        )
        for prop in ga4_props.scalars().all():
            prop.status = contractor.status
            prop.updated_at = datetime.now(timezone.utc)
    except Exception as e:
        logger.debug("Could not sync GA4 property status: %s", e)

    # Persist decision to discovery_audit for permanent audit trail
    try:
        from app.models.discovery_audit import DiscoveryAudit
        audit_status = "rejected" if body.reject else "approved"
        # Check if entry exists
        existing = await db.execute(
            select(DiscoveryAudit).where(
                DiscoveryAudit.account_id == (contractor.meta_account_id or contractor_id),
            )
        )
        audit_row = existing.scalar_one_or_none()
        if audit_row:
            audit_row.status = audit_status
            audit_row.updated_at = datetime.now(timezone.utc)
        else:
            db.add(DiscoveryAudit(
                platform="meta" if contractor.meta_account_id else "ga4",
                account_id=contractor.meta_account_id or contractor_id,
                account_name=contractor.name,
                division=contractor.division,
                status=audit_status,
                contractor_id=contractor_id,
            ))
    except Exception as e:
        logger.debug("Could not write discovery audit: %s", e)

    await db.commit()
    await db.refresh(contractor)

    logger.info(
        "User %s %s contractor %s (status=%s)",
        current_user.email,
        "rejected" if body.reject else "approved",
        contractor_id,
        contractor.status,
    )
    return ContractorResponse.model_validate(contractor)
