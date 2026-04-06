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
    """Body for approving a pending contractor (sets status → active)."""
    active: bool = True
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
    """Return every contractor and its current visibility flag."""
    await _ensure_seeded(db)
    result = await db.execute(select(Contractor).order_by(Contractor.name))
    return [ContractorResponse.model_validate(row) for row in result.scalars().all()]


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
    Return contractors discovered by the Meta pipeline that have not yet
    been reviewed by a Super Admin (status == 'pending_admin').
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view pending contractors.",
        )

    await _ensure_seeded(db)
    result = await db.execute(
        select(Contractor)
        .where(Contractor.status == "pending_admin")
        .order_by(Contractor.updated_at.desc())
    )
    return [ContractorResponse.model_validate(row) for row in result.scalars().all()]


@router.get(
    "/pending/count",
    summary="Count of pending contractors (for badge / notification)",
)
async def pending_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """Quick count for the admin notification badge."""
    if current_user.role != UserRole.ADMIN:
        return {"count": 0}

    await _ensure_seeded(db)
    result = await db.execute(
        select(Contractor).where(Contractor.status == "pending_admin")
    )
    return {"count": len(result.scalars().all())}


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

    contractor.active = body.active
    contractor.status = "active" if body.active else "inactive"
    if body.name:
        contractor.name = body.name
    contractor.division = body.division
    contractor.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(contractor)

    logger.info(
        "User %s approved contractor %s (active=%s, status=%s)",
        current_user.email,
        contractor_id,
        body.active,
        contractor.status,
    )
    return ContractorResponse.model_validate(contractor)
