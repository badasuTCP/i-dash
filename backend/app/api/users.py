"""
User management API router for I-Dash Analytics Platform.

Admin-only endpoints for managing users, roles, departments, and active status.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, role_required
from app.models.user import User, UserDepartment, UserRole
from app.schemas.user import UserResponse, UserUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get(
    "",
    response_model=List[UserResponse],
    summary="List all users (admin only)",
    responses={
        200: {
            "description": "List of users",
            "model": List[UserResponse],
        },
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
    },
)
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
    role: Optional[str] = Query(None, description="Filter by role"),
    department: Optional[str] = Query(None, description="Filter by department"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
) -> List[UserResponse]:
    """
    List all users with optional filtering.

    Args:
        db: Database session.
        current_user: Current authenticated user (must be admin).
        role: Optional role filter.
        department: Optional department filter.
        is_active: Optional active status filter.

    Returns:
        List[UserResponse]: List of matching users.
    """
    stmt = select(User)

    # Apply filters
    if role:
        try:
            role_enum = UserRole(role)
            stmt = stmt.where(User.role == role_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role}",
            )

    if department:
        try:
            dept_enum = UserDepartment(department)
            stmt = stmt.where(User.department == dept_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid department: {department}",
            )

    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)

    result = await db.execute(stmt)
    users = result.scalars().all()

    logger.info(
        f"Admin {current_user.id} listed users "
        f"(role={role}, dept={department}, active={is_active})"
    )

    return [UserResponse.model_validate(user) for user in users]


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID (admin only)",
    responses={
        200: {
            "description": "User information",
            "model": UserResponse,
        },
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "User not found"},
    },
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> UserResponse:
    """
    Get a specific user by ID.

    Args:
        user_id: The user ID to retrieve.
        db: Database session.
        current_user: Current authenticated user (must be admin).

    Returns:
        UserResponse: The requested user.

    Raises:
        HTTPException: If user is not found.
    """
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning(f"Admin {current_user.id} attempted to access non-existent user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    logger.info(f"Admin {current_user.id} retrieved user {user_id}")

    return UserResponse.model_validate(user)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user (admin only)",
    responses={
        200: {
            "description": "User updated successfully",
            "model": UserResponse,
        },
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "User not found"},
        400: {"description": "Invalid update data"},
    },
)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> UserResponse:
    """
    Update a user's information.

    Args:
        user_id: The user ID to update.
        user_update: Fields to update.
        db: Database session.
        current_user: Current authenticated user (must be admin).

    Returns:
        UserResponse: The updated user.

    Raises:
        HTTPException: If user is not found or validation fails.
    """
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning(f"Admin {current_user.id} attempted to update non-existent user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    # Prevent self-deactivation
    if user_id == current_user.id and user_update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    # Update fields
    if user_update.full_name is not None:
        user.full_name = user_update.full_name

    if user_update.role is not None:
        user.role = user_update.role

    if user_update.department is not None:
        user.department = user_update.department

    if user_update.is_active is not None:
        user.is_active = user_update.is_active

    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"Admin {current_user.id} updated user {user_id}")

    return UserResponse.model_validate(user)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate user (admin only)",
    responses={
        204: {"description": "User deactivated successfully"},
        401: {"description": "Unauthorized"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "User not found"},
        400: {"description": "Cannot deactivate own account"},
    },
)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(role_required(["admin"])),
) -> None:
    """
    Deactivate a user (soft delete).

    Note: Users are deactivated rather than deleted to maintain data integrity.

    Args:
        user_id: The user ID to deactivate.
        db: Database session.
        current_user: Current authenticated user (must be admin).

    Raises:
        HTTPException: If user is not found or is the current user.
    """
    # Prevent self-deletion
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning(f"Admin {current_user.id} attempted to delete non-existent user {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    # Soft delete by marking inactive
    user.is_active = False
    db.add(user)
    await db.commit()

    logger.info(f"Admin {current_user.id} deactivated user {user_id}")
