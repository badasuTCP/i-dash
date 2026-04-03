"""
User-related Pydantic schemas for I-Dash Analytics Platform.

Provides request/response schemas for user authentication, creation,
and management operations.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserDepartment, UserRole


class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: EmailStr = Field(..., description="User email address")
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    role: UserRole = Field(default=UserRole.VIEWER)
    department: UserDepartment = Field(default=UserDepartment.ALL)

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "email": "analyst@company.com",
                "full_name": "John Analyst",
                "password": "SecurePassword123!",
                "role": "analyst",
                "department": "marketing",
            }
        }


class UserUpdate(BaseModel):
    """Schema for updating user information."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[UserRole] = None
    department: Optional[UserDepartment] = None
    is_active: Optional[bool] = None

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "full_name": "John Updated",
                "role": "manager",
                "department": "sales",
                "is_active": True,
            }
        }


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    full_name: str
    role: UserRole
    department: UserDepartment
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        """Pydantic configuration."""

        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "email": "analyst@company.com",
                "full_name": "John Analyst",
                "role": "analyst",
                "department": "marketing",
                "is_active": True,
                "created_at": "2024-03-24T10:30:00Z",
                "updated_at": "2024-03-24T10:30:00Z",
            }
        }


class UserLogin(BaseModel):
    """Schema for user login request."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "email": "analyst@company.com",
                "password": "SecurePassword123!",
            }
        }


class Token(BaseModel):
    """Schema for JWT token response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(
        ...,
        description="Token expiration time in seconds",
    )

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 28800,
            }
        }


class TokenData(BaseModel):
    """Schema for JWT token claims."""

    sub: str = Field(..., description="User ID from token")
    exp: int = Field(..., description="Expiration time (unix timestamp)")
    iat: Optional[int] = Field(None, description="Issued at time (unix timestamp)")

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "sub": "1",
                "exp": 1711270200,
                "iat": 1711242600,
            }
        }
