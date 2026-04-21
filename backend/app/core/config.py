"""
Configuration management for I-Dash Analytics Platform.

This module provides centralized configuration using Pydantic settings,
supporting environment variable loading with proper validation.
"""

from typing import List, Union

from pydantic import Field, field_validator
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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # CORS configuration
    CORS_ORIGINS: Union[str, List[str]] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:8000",
            "https://strong-vitality-production-371a.up.railway.app",
            "https://dash.theconcreteprotector.com",
        ],
        description="Allowed origins for CORS",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Accept both comma-separated string and list, always include production origins."""
        if isinstance(v, str):
            origins = [origin.strip() for origin in v.split(",") if origin.strip()]
        else:
            origins = list(v) if v else []
        # Guarantee production domains are never accidentally excluded
        for required in (
            "https://dash.theconcreteprotector.com",
            "https://strong-vitality-production-371a.up.railway.app",
        ):
            if required not in origins:
                origins.append(required)
        return origins

    # HubSpot API configuration
    HUBSPOT_API_KEY: str = Field(
        default="",
        description="HubSpot private app access token",
    )
    HUBSPOT_ACCESS_TOKEN: str = Field(
        default="",
        description="HubSpot private app access token (alias)",
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
    META_BUSINESS_ID: str = Field(
        default="",
        description="Meta Business Manager ID for auto-discovering ad accounts",
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
    GA4_PROPERTY_ID_IBOS_SLG: str = Field(
        default="",
        description="GA4 property ID for I-BOS SLG contractor website",
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

    # Google Ads - Manager (MCC) account + per-division customer IDs
    GOOGLE_ADS_MANAGER_CUSTOMER_ID: str = Field(
        default="",
        description="Google Ads MCC (manager) customer ID for login_customer_id",
    )
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
        description="Google Ads customer ID for I-BOS campaigns (comma-separated for multiple)",
    )
    GOOGLE_ADS_CUSTOMER_ID_IBOS_2: str = Field(
        default="2957400868",
        description="Google Ads second customer ID for I-BOS campaigns (CID 2957400868)",
    )

    # Google Sheets configuration
    GOOGLE_SHEETS_CREDENTIALS_FILE: str = Field(
        default="",
        description="Google Sheets service account credentials (JSON string or file path)",
    )
    SHEET_ID_A: str = Field(
        default="",
        description="Google Sheets ID for Sheet A (retail/contractor heuristic pipeline)",
    )
    SHEET_ID_B: str = Field(
        default="",
        description="Google Sheets ID for Sheet B (retail/contractor heuristic pipeline)",
    )

    # WooCommerce (Sani-Tred retail)
    WC_STORE_URL: str = Field(
        default="",
        description="WooCommerce store URL (e.g. https://sanitred.com)",
    )
    WC_CONSUMER_KEY: str = Field(
        default="",
        description="WooCommerce REST API consumer key (read-only)",
    )
    WC_CONSUMER_SECRET: str = Field(
        default="",
        description="WooCommerce REST API consumer secret",
    )

    # Shopify (CP retail store — The Concrete Protector Store)
    SHOPIFY_SHOP_DOMAIN: str = Field(
        default="",
        description="Shopify shop domain (e.g. theconcreteprotector.myshopify.com)",
    )
    SHOPIFY_ADMIN_TOKEN: str = Field(
        default="",
        description="Shopify Admin API access token (starts with shpat_)",
    )
    SHOPIFY_API_KEY: str = Field(
        default="",
        description="Shopify custom app API key (public client id)",
    )
    SHOPIFY_API_SECRET: str = Field(
        default="",
        description="Shopify custom app API secret (starts with shpss_, for webhook HMAC)",
    )
    SHOPIFY_API_VERSION: str = Field(
        default="2026-04",
        description="Shopify Admin API version",
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
