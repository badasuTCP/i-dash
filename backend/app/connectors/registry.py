"""
Connector Registry for I-Dash Analytics Platform.

Central registry that maps data source connectors to the three business
divisions: The Concrete Protector (CP), Sani-Tred, and I-BOS.

Each division can have independent data source configurations while
sharing the same pipeline infrastructure.
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class Division(str, Enum):
    """Business divisions."""
    CP = "cp"
    SANITRED = "sanitred"
    IBOS = "ibos"
    EXECUTIVE = "executive"  # Aggregated view across all divisions


class DataSourceType(str, Enum):
    """Available data source types."""
    META_ADS = "meta_ads"
    GOOGLE_ADS = "google_ads"
    GOOGLE_ANALYTICS = "google_analytics"
    HUBSPOT = "hubspot"
    GOOGLE_SHEETS = "google_sheets"


@dataclass
class DataSourceConfig:
    """Configuration for a single data source connection."""
    source_type: DataSourceType
    division: Division
    enabled: bool = False
    account_id: str = ""
    property_id: str = ""
    sheet_id: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_configured(self) -> bool:
        """Check if this data source has required credentials."""
        if self.source_type == DataSourceType.META_ADS:
            return bool(
                settings.META_ACCESS_TOKEN
                and (self.account_id or settings.META_APP_ID)
            )
        elif self.source_type == DataSourceType.GOOGLE_ADS:
            return bool(
                settings.GOOGLE_ADS_DEVELOPER_TOKEN
                and settings.GOOGLE_ADS_CLIENT_ID
                and (self.account_id or settings.GOOGLE_ADS_CUSTOMER_ID)
            )
        elif self.source_type == DataSourceType.GOOGLE_ANALYTICS:
            return bool(
                settings.GA4_CREDENTIALS_JSON
                and (self.property_id or settings.GA4_PROPERTY_ID)
            )
        elif self.source_type == DataSourceType.HUBSPOT:
            return bool(settings.HUBSPOT_API_KEY)
        elif self.source_type == DataSourceType.GOOGLE_SHEETS:
            return bool(
                settings.GOOGLE_SHEETS_CREDENTIALS_FILE and self.sheet_id
            )
        return False


class ConnectorRegistry:
    """
    Central registry for all data source connectors mapped to divisions.

    Provides:
    - Division-to-data-source mapping
    - Configuration validation
    - Pipeline instantiation per division
    - Status reporting across all connectors

    Usage:
        registry = ConnectorRegistry()
        registry.auto_configure()

        # Get all configured sources for a division
        cp_sources = registry.get_sources(Division.CP)

        # Run all pipelines for a division
        results = await registry.run_division(Division.CP)

        # Run all pipelines across all divisions
        results = await registry.run_all()
    """

    def __init__(self) -> None:
        """Initialize the connector registry."""
        self.sources: Dict[str, DataSourceConfig] = {}
        self.logger = logging.getLogger(f"{__name__}.ConnectorRegistry")

    def auto_configure(self) -> None:
        """
        Auto-configure data sources from environment variables.

        Reads division-specific and shared credentials from settings
        and creates DataSourceConfig entries for each valid combination.
        """
        self.logger.info("Auto-configuring data sources from environment...")

        # ----- META ADS -----
        for div, account_field in [
            (Division.CP, settings.META_AD_ACCOUNT_ID_CP),
            (Division.SANITRED, settings.META_AD_ACCOUNT_ID_SANITRED),
            (Division.IBOS, settings.META_AD_ACCOUNT_ID_IBOS),
        ]:
            config = DataSourceConfig(
                source_type=DataSourceType.META_ADS,
                division=div,
                account_id=account_field or settings.META_APP_ID,
                enabled=True,
            )
            if config.is_configured:
                key = f"meta_ads_{div.value}"
                self.sources[key] = config
                self.logger.info(f"  Configured: Meta Ads -> {div.value}")

        # ----- GOOGLE ADS -----
        for div, customer_field in [
            (Division.CP, settings.GOOGLE_ADS_CUSTOMER_ID_CP),
            (Division.SANITRED, settings.GOOGLE_ADS_CUSTOMER_ID_SANITRED),
            (Division.IBOS, settings.GOOGLE_ADS_CUSTOMER_ID_IBOS),
        ]:
            config = DataSourceConfig(
                source_type=DataSourceType.GOOGLE_ADS,
                division=div,
                account_id=customer_field or settings.GOOGLE_ADS_CUSTOMER_ID,
                enabled=True,
            )
            if config.is_configured:
                key = f"google_ads_{div.value}"
                self.sources[key] = config
                self.logger.info(f"  Configured: Google Ads -> {div.value}")

        # ----- GOOGLE ANALYTICS (GA4) -----
        for div, prop_field in [
            (Division.CP, settings.GA4_PROPERTY_ID_CP),
            (Division.SANITRED, settings.GA4_PROPERTY_ID_SANITRED),
            (Division.IBOS, settings.GA4_PROPERTY_ID_IBOS),
        ]:
            config = DataSourceConfig(
                source_type=DataSourceType.GOOGLE_ANALYTICS,
                division=div,
                property_id=prop_field or settings.GA4_PROPERTY_ID,
                enabled=True,
            )
            if config.is_configured:
                key = f"ga4_{div.value}"
                self.sources[key] = config
                self.logger.info(f"  Configured: GA4 -> {div.value}")

        # ----- HUBSPOT (shared across divisions) -----
        if settings.HUBSPOT_API_KEY:
            config = DataSourceConfig(
                source_type=DataSourceType.HUBSPOT,
                division=Division.EXECUTIVE,  # CRM is company-wide
                enabled=True,
            )
            if config.is_configured:
                self.sources["hubspot"] = config
                self.logger.info("  Configured: HubSpot -> executive")

        total = len(self.sources)
        configured = sum(1 for s in self.sources.values() if s.is_configured)
        self.logger.info(
            f"Auto-configuration complete: {configured}/{total} sources ready"
        )

    def register(
        self,
        key: str,
        source_type: DataSourceType,
        division: Division,
        **kwargs,
    ) -> None:
        """
        Manually register a data source connector.

        Args:
            key: Unique identifier for this connector.
            source_type: Type of data source.
            division: Business division this connector belongs to.
            **kwargs: Additional DataSourceConfig fields.
        """
        config = DataSourceConfig(
            source_type=source_type,
            division=division,
            enabled=True,
            **kwargs,
        )
        self.sources[key] = config
        self.logger.info(f"Registered: {key} ({source_type.value} -> {division.value})")

    def get_sources(
        self,
        division: Optional[Division] = None,
        source_type: Optional[DataSourceType] = None,
    ) -> Dict[str, DataSourceConfig]:
        """
        Get data sources filtered by division and/or type.

        Args:
            division: Filter by division (None = all divisions).
            source_type: Filter by source type (None = all types).

        Returns:
            Dictionary of matching DataSourceConfig entries.
        """
        results = {}
        for key, config in self.sources.items():
            if division and config.division != division:
                continue
            if source_type and config.source_type != source_type:
                continue
            if config.enabled:
                results[key] = config
        return results

    def get_status(self) -> Dict[str, Any]:
        """
        Get status report of all registered data sources.

        Returns:
            Dictionary with:
            - total: Total registered sources
            - configured: Sources with valid credentials
            - by_division: Breakdown per division
            - by_type: Breakdown per source type
            - sources: Detailed list of all sources
        """
        by_division = {}
        by_type = {}
        source_details = []

        for key, config in self.sources.items():
            div = config.division.value
            src_type = config.source_type.value

            by_division[div] = by_division.get(div, 0) + 1
            by_type[src_type] = by_type.get(src_type, 0) + 1

            source_details.append({
                "key": key,
                "type": src_type,
                "division": div,
                "enabled": config.enabled,
                "configured": config.is_configured,
            })

        return {
            "total": len(self.sources),
            "configured": sum(
                1 for s in self.sources.values() if s.is_configured
            ),
            "by_division": by_division,
            "by_type": by_type,
            "sources": source_details,
        }

    def create_pipeline(self, key: str, **kwargs):
        """
        Create a pipeline instance for a registered data source.

        Args:
            key: Key of the registered data source.
            **kwargs: Override parameters for the pipeline.

        Returns:
            Pipeline instance ready to run.

        Raises:
            KeyError: If key not found.
            ValueError: If source is not configured.
        """
        if key not in self.sources:
            raise KeyError(f"Data source '{key}' not registered")

        config = self.sources[key]
        if not config.is_configured:
            raise ValueError(
                f"Data source '{key}' is not configured "
                f"(missing credentials)"
            )

        if config.source_type == DataSourceType.META_ADS:
            from app.pipelines.meta_ads import MetaAdsPipeline
            return MetaAdsPipeline(**kwargs)

        elif config.source_type == DataSourceType.GOOGLE_ADS:
            from app.pipelines.google_ads import GoogleAdsPipeline
            return GoogleAdsPipeline(**kwargs)

        elif config.source_type == DataSourceType.GOOGLE_ANALYTICS:
            from app.pipelines.google_analytics import GoogleAnalyticsPipeline
            return GoogleAnalyticsPipeline(
                property_id=config.property_id, **kwargs
            )

        elif config.source_type == DataSourceType.HUBSPOT:
            from app.pipelines.hubspot import HubSpotPipeline
            return HubSpotPipeline(**kwargs)

        elif config.source_type == DataSourceType.GOOGLE_SHEETS:
            from app.pipelines.google_sheets import GoogleSheetsPipeline
            return GoogleSheetsPipeline(
                sheet_id=config.sheet_id, **kwargs
            )

        raise ValueError(f"Unknown source type: {config.source_type}")

    async def run_division(
        self, division: Division, **kwargs
    ) -> Dict[str, Any]:
        """
        Run all pipelines for a specific division.

        Args:
            division: Division to run pipelines for.
            **kwargs: Override parameters for pipelines.

        Returns:
            Dictionary with per-source results.
        """
        sources = self.get_sources(division=division)
        results = {}

        for key, config in sources.items():
            try:
                pipeline = self.create_pipeline(key, **kwargs)
                result = await pipeline.run()
                results[key] = result
            except Exception as e:
                self.logger.error(
                    f"Error running pipeline '{key}': {str(e)}"
                )
                results[key] = {
                    "status": "failed",
                    "error": str(e),
                }

        return results

    async def run_all(self, **kwargs) -> Dict[str, Any]:
        """
        Run all configured pipelines across all divisions.

        Args:
            **kwargs: Override parameters for pipelines.

        Returns:
            Dictionary with results grouped by division.
        """
        all_results = {}

        for division in Division:
            sources = self.get_sources(division=division)
            if sources:
                self.logger.info(
                    f"Running {len(sources)} pipelines for {division.value}"
                )
                results = await self.run_division(division, **kwargs)
                all_results[division.value] = results

        return all_results
