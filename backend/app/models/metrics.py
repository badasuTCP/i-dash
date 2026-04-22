"""
Metrics models for I-Dash Analytics Platform.

Defines data models for storing metrics from various data sources:
HubSpot, Meta (Facebook), Google Ads, Google Sheets, and aggregated dashboards.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSecret(Base):
    """Key/value store for runtime secrets that must survive pod restarts.

    Used as the persistence layer for Shopify / WooCommerce credentials that
    Railway's Variables UI doesn't inject into the container. Writes go
    through POST /api/shopify/prime; reads are cached in-memory + /tmp after
    startup so hot-path pipeline code doesn't hit the DB.
    """

    __tablename__ = "system_secrets"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class HubSpotMetric(Base):
    """
    HubSpot metrics aggregated by date.

    Attributes:
        id: Primary key.
        date: Date of the metrics.
        contacts_created: Number of new contacts created.
        deals_created: Number of new deals created.
        deals_won: Number of deals closed won.
        deals_lost: Number of deals closed lost.
        revenue_won: Total revenue from closed-won deals.
        pipeline_value: Total value of open pipeline.
        meetings_booked: Number of meetings scheduled.
        emails_sent: Number of emails sent.
        tasks_completed: Number of tasks completed.
        fetched_at: Timestamp when data was fetched.
    """

    __tablename__ = "hubspot_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    contacts_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deals_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deals_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deals_lost: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revenue_won: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pipeline_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    meetings_booked: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of HubSpotMetric."""
        return f"<HubSpotMetric(date={self.date}, revenue_won={self.revenue_won})>"


class HubSpotContact(Base):
    """Individual contact record for form/training attribution."""

    __tablename__ = "hubspot_contacts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    contact_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    owner_id: Mapped[str] = mapped_column(String(64), index=True, nullable=True)
    lifecycle_stage: Mapped[str] = mapped_column(String(64), nullable=True)
    recent_form: Mapped[str] = mapped_column(String(256), nullable=True)
    num_forms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    training_class: Mapped[str] = mapped_column(String(128), nullable=True)
    is_training_lead: Mapped[bool] = mapped_column(Integer, default=False, nullable=False)
    created_date: Mapped[datetime] = mapped_column(Date, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class HubSpotDeal(Base):
    """Individual deal record for per-rep aggregation."""

    __tablename__ = "hubspot_deals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    deal_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    owner_id: Mapped[str] = mapped_column(String(64), index=True, nullable=True)
    stage: Mapped[str] = mapped_column(String(64), nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    deal_name: Mapped[str] = mapped_column(String(256), nullable=True)
    created_date: Mapped[datetime] = mapped_column(Date, nullable=True)
    close_date: Mapped[datetime] = mapped_column(Date, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class MetaAdMetric(Base):
    """
    Meta (Facebook) Ads metrics by campaign and date.

    Attributes:
        id: Primary key.
        date: Date of the metrics.
        campaign_id: Meta campaign ID.
        campaign_name: Name of the campaign.
        ad_set_name: Name of the ad set.
        impressions: Number of impressions.
        clicks: Number of clicks.
        spend: Amount spent in currency.
        conversions: Number of conversions.
        conversion_value: Monetary value of conversions.
        ctr: Click-through rate percentage.
        cpc: Cost per click.
        cpm: Cost per mille (1000 impressions).
        roas: Return on ad spend ratio.
        reach: Number of unique people reached.
        frequency: Average frequency per person.
        fetched_at: Timestamp when data was fetched.
    """

    __tablename__ = "meta_ad_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    account_id: Mapped[Optional[str]] = mapped_column(String(128), index=True, nullable=True)
    account_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    # Brand/division tag applied at extract time. 'cp' for act_144305066,
    # 'ibos' for every other Meta account in our portfolio, 'sanitred' never.
    division: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    campaign_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    campaign_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ad_set_name: Mapped[str] = mapped_column(String(255), nullable=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    spend: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    conversions: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    conversion_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ctr: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cpc: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cpm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    roas: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    reach: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Deduplicated account-level daily reach. Same value replicated across every
    # campaign row for the same (account_id, date). Lets the dashboard report
    # reach without summing campaign-level reach (which double-counts people
    # who saw multiple campaigns). Falls back to 0 when the account-level
    # insights call failed; callers should treat 0 as "use campaign reach".
    account_reach: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    frequency: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of MetaAdMetric."""
        return (
            f"<MetaAdMetric(date={self.date}, "
            f"campaign={self.campaign_name}, spend={self.spend})>"
        )


class MetaPeriodReach(Base):
    """Pre-computed period-unique reach per Meta ad account for common
    dashboard date windows. Written by the Meta pipeline at the end of
    every scheduled run — the dashboard reads from this table and never
    calls Meta at request time.

    Period-unique reach is the Meta "Accounts Center accounts" number:
    the count of distinct humans who saw any non-archived ad from this
    account during the window, deduplicated across campaigns AND days.
    It cannot be computed from daily campaign rows (summing overcounts
    by cross-day overlap), so we materialize it from a Meta insights
    call at level=account with no time_increment.

    One row per (account_id, preset_key). Pipeline upserts each run so
    the numbers stay within the scheduler's refresh cadence.
    """

    __tablename__ = "meta_period_reach"
    __table_args__ = (
        UniqueConstraint("account_id", "preset_key", name="uq_period_reach_acct_preset"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    account_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    # One of: "this_month", "last_month", "last_7", "last_30", "ytd"
    preset_key: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    date_from: Mapped[datetime] = mapped_column(Date, nullable=False)
    date_to: Mapped[datetime] = mapped_column(Date, nullable=False)
    reach: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class GoogleAdMetric(Base):
    """
    Google Ads metrics by campaign and date.

    Attributes:
        id: Primary key.
        date: Date of the metrics.
        campaign_id: Google Ads campaign ID.
        campaign_name: Name of the campaign.
        ad_group_name: Name of the ad group.
        impressions: Number of impressions.
        clicks: Number of clicks.
        spend: Amount spent in currency.
        conversions: Number of conversions.
        conversion_value: Monetary value of conversions.
        ctr: Click-through rate percentage.
        cpc: Cost per click.
        cpm: Cost per mille (1000 impressions).
        roas: Return on ad spend ratio.
        search_impression_share: Percentage of eligible impressions shown.
        fetched_at: Timestamp when data was fetched.
    """

    __tablename__ = "google_ad_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    # Brand/division tag applied at extract time. CID 2823564937 = 'sanitred',
    # I-BOS customer IDs = 'ibos'. CP must never carry Google Ads data.
    division: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    campaign_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    campaign_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ad_group_name: Mapped[str] = mapped_column(String(255), nullable=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    spend: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    conversions: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    conversion_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ctr: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cpc: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cpm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    roas: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    search_impression_share: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of GoogleAdMetric."""
        return (
            f"<GoogleAdMetric(date={self.date}, "
            f"campaign={self.campaign_name}, spend={self.spend})>"
        )


class GoogleSheetMetric(Base):
    """
    Custom metrics from Google Sheets.

    Attributes:
        id: Primary key.
        sheet_name: Name of the Google Sheet.
        date: Date of the metric.
        metric_name: Name of the metric.
        metric_value: Value of the metric.
        category: Category for grouping metrics.
        fetched_at: Timestamp when data was fetched.
    """

    __tablename__ = "google_sheet_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sheet_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    metric_name: Mapped[str] = mapped_column(String(255), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of GoogleSheetMetric."""
        return (
            f"<GoogleSheetMetric(sheet={self.sheet_name}, "
            f"metric={self.metric_name}, date={self.date})>"
        )


class GA4Metric(Base):
    """
    Google Analytics 4 web metrics by date and dimensions.

    Attributes:
        id: Primary key.
        date: Date of the metrics.
        property_id: GA4 property ID.
        sessions: Number of sessions.
        total_users: Total unique users.
        new_users: New users.
        page_views: Total page views.
        avg_session_duration: Avg session duration in seconds.
        bounce_rate: Bounce rate percentage.
        conversions: Number of conversions.
        event_count: Total event count.
        engaged_sessions: Sessions with engagement.
        engagement_rate: Engagement rate percentage.
        channel: Default channel group (e.g. 'Organic Search', 'Direct').
        source: Traffic source (e.g. 'google', '(direct)').
        medium: Traffic medium (e.g. 'organic', 'cpc').
        device: Device category (e.g. 'desktop', 'mobile', 'tablet').
        fetched_at: Timestamp when data was fetched.
    """

    __tablename__ = "ga4_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    property_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_session_duration: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    bounce_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    conversions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engaged_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    channel: Mapped[str] = mapped_column(String(255), default="(all)", nullable=False)
    source: Mapped[str] = mapped_column(String(255), default="(all)", nullable=False)
    medium: Mapped[str] = mapped_column(String(255), default="(all)", nullable=False)
    device: Mapped[str] = mapped_column(String(255), default="(all)", nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of GA4Metric."""
        return (
            f"<GA4Metric(date={self.date}, sessions={self.sessions}, "
            f"channel={self.channel}, device={self.device})>"
        )


class DashboardSnapshot(Base):
    """
    Aggregated snapshot of all metrics for dashboard display.

    Attributes:
        id: Primary key.
        date: Date of the snapshot.
        total_revenue: Total revenue across all sources.
        total_ad_spend: Total advertising spend.
        total_leads: Total leads generated.
        total_deals_won: Total deals closed won.
        blended_roas: Blended return on ad spend across channels.
        cost_per_lead: Average cost per lead.
        lead_to_deal_rate: Percentage of leads that become deals.
        created_at: Timestamp when snapshot was created.
    """

    __tablename__ = "dashboard_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    date: Mapped[datetime] = mapped_column(Date, index=True, nullable=False)
    total_revenue: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_ad_spend: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_leads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_deals_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    blended_roas: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cost_per_lead: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    lead_to_deal_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        """String representation of DashboardSnapshot."""
        return (
            f"<DashboardSnapshot(date={self.date}, "
            f"revenue={self.total_revenue}, roas={self.blended_roas})>"
        )


class WCOrder(Base):
    """
    WooCommerce order from Sani-Tred retail store.

    One row per order. Line-item detail is stored in WCOrderItem.
    """

    __tablename__ = "wc_orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    order_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tax: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    shipping: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    payment_method: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    billing_state: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    billing_country: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    items_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    date_created: Mapped[Optional[datetime]] = mapped_column(Date, index=True, nullable=True)
    date_completed: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="sanitred")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class WCProduct(Base):
    """
    WooCommerce product snapshot from Sani-Tred retail store.

    Full product catalog refreshed on each pipeline run.
    """

    __tablename__ = "wc_products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    regular_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sale_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stock_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    total_sales: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    categories: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="sanitred")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ShopifyOrder(Base):
    """
    Shopify order from The Concrete Protector retail store (CP brand).

    One row per order. Mirrors the WCOrder shape so the Executive Summary
    and CP brand overview can combine retail revenue from both stores.
    """

    __tablename__ = "shopify_orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    order_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="paid")
    financial_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    fulfillment_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tax: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    shipping: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    discount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")
    payment_method: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    billing_state: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    billing_country: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    items_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    date_created: Mapped[Optional[datetime]] = mapped_column(Date, index=True, nullable=True)
    date_completed: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="cp")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ShopifyProduct(Base):
    """
    Shopify product snapshot — full catalog refreshed on every run.
    """

    __tablename__ = "shopify_products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    compare_at_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stock_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stock_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    product_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="cp")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ShopifyCustomer(Base):
    """
    Shopify customer snapshot — unique customers with lifetime totals.
    """

    __tablename__ = "shopify_customers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    orders_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_spent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    state: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at_remote: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    division: Mapped[str] = mapped_column(String(32), nullable=False, default="cp")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
