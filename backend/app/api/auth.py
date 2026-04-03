"""
Authentication API router for I-Dash Analytics Platform.

Handles user login, registration, profile management, and password changes.
All endpoints use JWT token-based authentication via HTTP Bearer scheme.
"""

import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (admin only)",
    responses={
        201: {
            "description": "User created successfully",
            "model": UserResponse,
        },
        400: {"description": "Email already exists or invalid data"},
        403: {"description": "Insufficient permissions to register users"},
        500: {"description": "Internal server error"},
    },
)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """
    Register a new user.

    Only users with 'admin' role can create new users.

    Args:
        user_data: User registration data including email, password, and role.
        db: Database session.
        current_user: Current authenticated user (must be admin).

    Returns:
        UserResponse: The created user object.

    Raises:
        HTTPException: If user is not admin, email exists, or validation fails.
    """
    # Check admin role
    if current_user.role.value != "admin":
        logger.warning(
            f"Non-admin user {current_user.id} attempted to register new user"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can register new users",
        )

    # Check if email already exists
    stmt = select(User).where(User.email == user_data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none() is not None:
        logger.warning(f"Registration attempt with existing email: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user
    hashed_password = hash_password(user_data.password)
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        role=user_data.role,
        department=user_data.department,
        is_active=True,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info(f"New user registered: {new_user.email} (role: {new_user.role.value})")

    return UserResponse.model_validate(new_user)


@router.post(
    "/login",
    response_model=Token,
    summary="Login with email and password",
    responses={
        200: {
            "description": "Login successful, returns JWT token",
            "model": Token,
        },
        401: {"description": "Invalid email or password"},
        500: {"description": "Internal server error"},
    },
)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    Authenticate user and return JWT token.

    Args:
        credentials: Email and password credentials.
        db: Database session.

    Returns:
        Token: JWT access token with expiration details.

    Raises:
        HTTPException: If credentials are invalid.
    """
    # Find user by email
    stmt = select(User).where(User.email == credentials.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        logger.warning(f"Login attempt for non-existent or inactive user: {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        logger.warning(f"Failed login attempt for user: {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create access token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    logger.info(f"User logged in: {user.email}")

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
    responses={
        200: {
            "description": "Current user information",
            "model": UserResponse,
        },
        401: {"description": "Unauthorized"},
    },
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """
    Get the current authenticated user's profile.

    Args:
        current_user: Current authenticated user from JWT token.

    Returns:
        UserResponse: Current user information.
    """
    return UserResponse.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
    responses={
        200: {
            "description": "Profile updated successfully",
            "model": UserResponse,
        },
        401: {"description": "Unauthorized"},
        400: {"description": "Invalid update data"},
    },
)
async def update_current_user_profile(
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """
    Update the current user's profile.

    Users can update their own full_name, role (if admin), department, or active status.
    Non-admin users can only update their own full_name.

    Args:
        user_update: Fields to update.
        db: Database session.
        current_user: Current authenticated user.

    Returns:
        UserResponse: Updated user information.

    Raises:
        HTTPException: If user lacks permission to update specific fields.
    """
    # Non-admin users can only update their own full_name
    if current_user.role.value != "admin":
        if (
            user_update.role is not None
            or user_update.department is not None
            or user_update.is_active is not None
        ):
            logger.warning(
                f"Non-admin user {current_user.id} attempted to update protected fields"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your full name",
            )

    # Update allowed fields
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name

    if current_user.role.value == "admin":
        if user_update.role is not None:
            current_user.role = user_update.role
        if user_update.department is not None:
            current_user.department = user_update.department
        if user_update.is_active is not None:
            current_user.is_active = user_update.is_active

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    logger.info(f"User profile updated: {current_user.email}")

    return UserResponse.model_validate(current_user)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change current user's password",
    responses={
        204: {"description": "Password changed successfully"},
        401: {"description": "Unauthorized or invalid current password"},
        400: {"description": "Invalid password format"},
    },
)
async def change_password(
    old_password: str,
    new_password: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Change the current user's password.

    Args:
        old_password: Current password for verification.
        new_password: New password (must be at least 8 characters).
        db: Database session.
        current_user: Current authenticated user.

    Raises:
        HTTPException: If old password is incorrect or new password is invalid.
    """
    # Validate new password length
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long",
        )

    # Verify old password
    if not verify_password(old_password, current_user.hashed_password):
        logger.warning(f"Failed password change attempt for user: {current_user.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Update password
    current_user.hashed_password = hash_password(new_password)
    db.add(current_user)
    await db.commit()

    logger.info(f"Password changed for user: {current_user.email}")
