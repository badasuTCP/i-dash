"""
Configuration management for I-Dash Analytics Platform.

This module provides centralized configuration using Pydantic settings,
supporting environment variable loading with proper validation.
"""

from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application metadata
    APP_NAME: str = "I-Dash Analytics"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database configuration
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/idash",
        description="Async PostgreSQL connection URL",
    )

    # Redis configuration
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for caching",
    )

    # Security settings
    SECRET_KEY: str = Field(
        default="your-secret-key-change-in-production",
        description="Secret key for JWT signing",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # CORS configuration
    CORS_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:8000",
        ],
        description="Allowed origins for CORS",
    )

    # HubSpot API configuration
    HUBSPOT_API_KEY: str = Field(
        default="",
        description="HubSpot private app access token",
    )

    # Meta (Facebook) API configuration
    META_APP_ID: str = Field(
        default="",
        description="Meta app ID for OAuth and API access",
    )
    META_APP_SECRET: str = Field(
        default="",
        description="Meta app secret for OAuth and API access",
    )
    META_ACCESS_TOKEN: str = Field(
        default="",
        description="Meta access token for API calls",
    )
    META_AD_ACCOUNT_ID: str = Field(
        default="",
        description="Meta Ads Ad Account ID (e.g. act_123456789)",
    )

    # Google Ads API configuration
    GOOGLE_ADS_DEVELOPER_TOKEN: str = Field(
        default="",
        description="Google Ads developer token",
    )
    GOOGLE_ADS_CLIENT_ID: str = Field(
        default="",
        description="Google Ads OAuth client ID",
    )
    GOOGLE_ADS_CLIENT_SECRET: str = Field(
        default="",
        description="Google Ads OAuth client secret",
    )
    GOOGLE_ADS_REFRESH_TOKEN: str = Field(
        default="",
        description="Google Ads OAuth refresh token",
    )
    GOOGLE_ADS_CUSTOMER_ID: str = Field(
        default="",
        description="Google Ads customer ID (typically with hyphens)",
    )

    # Google Analytics 4 configuration
    GA4_PROPERTY_ID: str = Field(
        default="",
        description="GA4 property ID (numeric, e.g. 123456789)",
    )
    GA4_CREDENTIALS_JSON: str = Field(
        default="",
        description="GA4 service account credentials (JSON string or file path)",
    )

    # Google Analytics 4 - per division (optional, for multi-property setups)
    GA4_PROPERTY_ID_CP: str = Field(
        default="",
        description="GA4 property ID for The Concrete Protector website",
    )
    GA4_PROPERTY_ID_SANITRED: str = Field(
        default="",
        description="GA4 property ID for Sani-Tred website",
    )
    GA4_PROPERTY_ID_IBOS: str = Field(
        default="",
        description="GA4 property ID for I-BOS website",
    )

    # Meta Ads - per division (optional ad account IDs)
    META_AD_ACCOUNT_ID_CP: str = Field(
        default="",
        description="Meta Ads account ID for CP campaigns",
    )
    META_AD_ACCOUNT_ID_SANITRED: str = Field(
        default="",
        description="Meta Ads account ID for Sani-Tred campaigns",
    )
    META_AD_ACCOUNT_ID_IBOS: str = Field(
        default="",
        description="Meta Ads account ID for I-BOS campaigns",
    )

    # Google Ads - per division (optional customer IDs)
    GOOGLE_ADS_CUSTOMER_ID_CP: str = Field(
        default="",
        description="Google Ads customer ID for CP campaigns",
    )
    GOOGLE_ADS_CUSTOMER_ID_SANITRED: str = Field(
        default="",
        description="Google Ads customer ID for Sani-Tred campaigns",
    )
    GOOGLE_ADS_CUSTOMER_ID_IBOS: str = Field(
        default="",
        description="Google Ads customer ID for I-BOS campaigns",
    )

    # Google Sheets configuration
    GOOGLE_SHEETS_CREDENTIALS_FILE: str = Field(
        default="",
        description="Google Sheets service account credentials (JSON string or file path)",
    )

    # Groq API configuration
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key for AI-powered insights (free, no expiration)",
    )

    # Data refresh configuration
    DATA_REFRESH_INTERVAL_HOURS: int = Field(
        default=4,
        description="Hours between automatic data refresh cycles",
    )

    class Config:
        """Pydantic configuration."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Global settings instance
settings = Settings()
