"""
User model for I-Dash Analytics Platform.

Defines the User entity with authentication, role-based access control,
and department assignment capabilities.
"""

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, Enum):
    """User role enumeration for access control."""

    ADMIN = "admin"
    DIRECTOR = "director"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER = "viewer"


class UserDepartment(str, Enum):
    """User department enumeration for data filtering."""

    MARKETING = "marketing"
    SALES = "sales"
    OPERATIONS = "operations"
    FINANCE = "finance"
    EXECUTIVE = "executive"
    ALL = "all"


class User(Base):
    """
    User model for authentication and authorization.

    Attributes:
        id: Primary key, auto-incrementing integer.
        email: Unique email address for login.
        full_name: User's full name for display.
        hashed_password: Securely hashed password.
        role: User's access level role.
        department: User's assigned department for data access.
        is_active: Whether the user account is active.
        created_at: Timestamp of user creation.
        updated_at: Timestamp of last update.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole),
        default=UserRole.VIEWER,
        nullable=False,
    )
    department: Mapped[UserDepartment] = mapped_column(
        SQLEnum(UserDepartment),
        default=UserDepartment.ALL,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of User."""
        return f"<User(id={self.id}, email={self.email}, role={self.role.value})>"
