"""
Pipeline orchestration service for I-Dash Analytics Platform.

Manages execution of all pipelines with error isolation, status tracking,
and execution history retrieval.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.pipelines.base import BasePipeline
from app.pipelines.google_ads import GoogleAdsPipeline
from app.pipelines.google_analytics import GoogleAnalyticsPipeline
from app.pipelines.google_sheets import GoogleSheetsPipeline
from app.pipelines.hubspot import HubSpotPipeline
from app.pipelines.meta_ads import MetaAdsPipeline, reconcile_meta_contractors
from app.pipelines.snapshot import SnapshotPipeline
from app.pipelines.shopify import ShopifyPipeline
from app.pipelines.woocommerce import WooCommercePipeline

logger = logging.getLogger(__name__)


class PipelineService:
    """
    Orchestrate and manage data pipeline execution.

    Provides methods to:
    - Run all pipelines in sequence
    - Run individual pipelines
    - Get pipeline execution status
    - Retrieve pipeline execution history

    Implements error isolation so that failures in one pipeline don't
    prevent execution of others.
    """

    def __init__(self) -> None:
        """Initialize the pipeline service."""
        self.logger = logging.getLogger(f"{__name__}.PipelineService")
        self.pipelines: Dict[str, BasePipeline] = {}
        # Track ALL expected pipelines (even those that fail to init)
        self.all_pipeline_names: List[str] = []
        # Track which pipelines failed to initialize and why
        self.init_errors: Dict[str, str] = {}
        self._initialize_pipelines()

    def _initialize_pipelines(self) -> None:
        """Initialize all available pipelines with per-pipeline error isolation."""
        pipeline_factories = [
            ("hubspot", lambda: HubSpotPipeline()),
            ("meta_ads", lambda: MetaAdsPipeline()),
            ("google_ads", lambda: GoogleAdsPipeline()),
            ("google_analytics", lambda: GoogleAnalyticsPipeline()),
            ("google_sheets", lambda: GoogleSheetsPipeline()),
            ("woocommerce", lambda: WooCommercePipeline()),
            ("shopify", lambda: ShopifyPipeline()),
            ("snapshot", lambda: SnapshotPipeline()),
        ]

        self.all_pipeline_names = [name for name, _ in pipeline_factories]

        for name, factory in pipeline_factories:
            try:
                self.pipelines[name] = factory()
            except Exception as e:
                self.init_errors[name] = str(e)
                self.logger.warning(
                    f"Pipeline '{name}' failed to initialize: {e}"
                )

        self.logger.info(
            f"Initialized {len(self.pipelines)}/{len(pipeline_factories)} pipelines"
        )

    async def run_all_pipelines(self) -> Dict[str, Any]:
        """
        Execute all pipelines in sequence with error isolation.

        Each pipeline is run independently so that failures don't cascade.
        Snapshots are always run last to ensure fresh data.

        Returns:
            Dictionary with execution results:
                - results: List of individual pipeline results
                - total_success: Total successful pipelines
                - total_failed: Total failed pipelines
                - duration_seconds: Total execution time
                - started_at: Start timestamp
                - completed_at: End timestamp

        Example:
            result = await pipeline_service.run_all_pipelines()
            print(f"Succeeded: {result['total_success']}, "
                  f"Failed: {result['total_failed']}")
        """
        start_time = datetime.now(timezone.utc)
        self.logger.info("Starting all pipelines")

        results = []
        successful = 0
        failed = 0

        # Define pipeline execution order (snapshot last)
        pipeline_order = [
            "hubspot",
            "meta_ads",
            "google_ads",
            "google_analytics",
            "google_sheets",
            "snapshot",
        ]

        for pipeline_name in pipeline_order:
            if pipeline_name not in self.pipelines:
                self.logger.debug(f"Pipeline '{pipeline_name}' not configured")
                continue

            result = await self.run_pipeline(pipeline_name)
            results.append(result)

            if result["status"] == "success":
                successful += 1
            else:
                failed += 1

            # After meta_ads completes, run contractor auto-discovery
            if pipeline_name == "meta_ads":
                try:
                    recon = await reconcile_meta_contractors()
                    if recon.get("new_contractors"):
                        self.logger.info(
                            "Meta auto-discovery found %d new contractor(s): %s",
                            len(recon["new_contractors"]),
                            ", ".join(c["name"] for c in recon["new_contractors"]),
                        )
                except Exception as e:
                    self.logger.warning(
                        "Meta contractor reconciliation skipped: %s", e
                    )

        duration = (datetime.now(timezone.utc) - start_time).total_seconds()

        summary = {
            "results": results,
            "total_success": successful,
            "total_failed": failed,
            "total_pipelines": len(results),
            "duration_seconds": duration,
            "started_at": start_time.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        if failed == 0:
            self.logger.info(
                f"All pipelines completed successfully "
                f"({successful} pipelines in {duration:.2f}s)"
            )
        else:
            self.logger.warning(
                f"Pipeline execution completed with errors "
                f"({successful} succeeded, {failed} failed)"
            )

        return summary

    async def run_pipeline(self, pipeline_name: str) -> Dict[str, Any]:
        """
        Execute a specific pipeline by name.

        Handles all errors internally and ensures logging occurs regardless
        of pipeline state.

        Args:
            pipeline_name: Name of the pipeline to execute (e.g., 'hubspot').

        Returns:
            Dictionary with execution result:
                - status: 'success' or 'failed'
                - pipeline: Pipeline name
                - records_loaded: Number of records loaded (0 if failed)
                - duration_seconds: Execution time
                - error: Error message if failed

        Raises:
            ValueError: If pipeline name is not found.

        Example:
            result = await pipeline_service.run_pipeline('hubspot')
            if result['status'] == 'success':
                print(f"Loaded {result['records_loaded']} records")
        """
        if pipeline_name not in self.pipelines:
            # Distinguish "not configured" from truly unknown
            if pipeline_name in self.init_errors:
                error_msg = (
                    f"Pipeline '{pipeline_name}' is not configured: "
                    f"{self.init_errors[pipeline_name]}"
                )
            else:
                error_msg = (
                    f"Pipeline '{pipeline_name}' not found. "
                    f"Available: {list(self.all_pipeline_names)}"
                )
            self.logger.error(error_msg)
            raise ValueError(error_msg)

        pipeline = self.pipelines[pipeline_name]

        try:
            self.logger.info(f"Running pipeline: {pipeline_name}")
            result = await pipeline.run()

            self.logger.debug(f"Pipeline result: {result}")
            return result

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.logger.error(
                f"Unexpected error running pipeline '{pipeline_name}': "
                f"{error_msg}"
            )

            return {
                "status": "failed",
                "pipeline": pipeline_name,
                "records_loaded": 0,
                "error": error_msg,
                "duration_seconds": 0.0,
            }

    async def get_pipeline_status(self) -> Dict[str, Any]:
        """
        Get current status of all pipelines based on recent executions.

        Queries the PipelineLog table to find the most recent execution
        for each pipeline.

        Returns:
            Dictionary with pipeline statuses:
                - pipelines: List of pipeline status objects
                - last_updated: Timestamp of most recent execution

        Example:
            status = await pipeline_service.get_pipeline_status()
            for pipeline in status['pipelines']:
                print(f"{pipeline['name']}: {pipeline['status']}")
        """
        try:
            async with async_session_maker() as session:
                pipelines_status = []

                # Iterate ALL expected pipelines, not just initialized ones
                for pipeline_name in self.all_pipeline_names:
                    # Check if this pipeline failed to initialize
                    if pipeline_name in self.init_errors:
                        pipelines_status.append({
                            "name": pipeline_name,
                            "status": "not_configured",
                            "last_run": None,
                            "completed_at": None,
                            "records_fetched": 0,
                            "duration_seconds": 0.0,
                            "error": self.init_errors[pipeline_name],
                        })
                        continue

                    # Get most recent log entry
                    stmt = (
                        select(PipelineLog)
                        .where(
                            PipelineLog.pipeline_name == pipeline_name
                        )
                        .order_by(desc(PipelineLog.started_at))
                        .limit(1)
                    )

                    result = await session.execute(stmt)
                    log_entry = result.scalar_one_or_none()

                    if log_entry:
                        pipeline_status = {
                            "name": pipeline_name,
                            "status": log_entry.status.value,
                            "last_run": log_entry.started_at.isoformat(),
                            "completed_at": (
                                log_entry.completed_at.isoformat()
                                if log_entry.completed_at
                                else None
                            ),
                            "records_fetched": log_entry.records_fetched,
                            "duration_seconds": log_entry.duration_seconds,
                            "error": log_entry.error_message,
                        }
                    else:
                        pipeline_status = {
                            "name": pipeline_name,
                            "status": "never_run",
                            "last_run": None,
                            "completed_at": None,
                            "records_fetched": 0,
                            "duration_seconds": 0.0,
                            "error": None,
                        }

                    pipelines_status.append(pipeline_status)

                # Get overall last updated
                stmt = (
                    select(PipelineLog)
                    .order_by(desc(PipelineLog.started_at))
                    .limit(1)
                )
                result = await session.execute(stmt)
                last_log = result.scalar_one_or_none()

                last_updated = (
                    last_log.started_at.isoformat()
                    if last_log
                    else None
                )

                return {
                    "pipelines": pipelines_status,
                    "last_updated": last_updated,
                    "total_pipelines": len(self.pipelines),
                }

        except Exception as e:
            self.logger.error(f"Error getting pipeline status: {str(e)}")
            raise

    async def get_pipeline_history(
        self,
        pipeline_name: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve execution history for a specific pipeline.

        Args:
            pipeline_name: Name of the pipeline.
            limit: Maximum number of records to return (default: 20).

        Returns:
            List of execution log entries, most recent first:
                - started_at: Execution start time
                - completed_at: Execution end time
                - status: Execution status
                - records_fetched: Records processed
                - duration_seconds: Execution duration
                - error_message: Error details if failed

        Raises:
            ValueError: If pipeline name is not found.

        Example:
            history = await pipeline_service.get_pipeline_history('hubspot')
            for entry in history:
                print(f"{entry['started_at']}: {entry['status']}")
        """
        if pipeline_name not in self.all_pipeline_names:
            raise ValueError(f"Pipeline '{pipeline_name}' not found")

        try:
            async with async_session_maker() as session:
                stmt = (
                    select(PipelineLog)
                    .where(
                        PipelineLog.pipeline_name == pipeline_name
                    )
                    .order_by(desc(PipelineLog.started_at))
                    .limit(limit)
                )

                result = await session.execute(stmt)
                logs = result.scalars().all()

                return [
                    {
                        "started_at": log.started_at.isoformat(),
                        "completed_at": (
                            log.completed_at.isoformat()
                            if log.completed_at
                            else None
                        ),
                        "status": log.status.value,
                        "records_fetched": log.records_fetched,
                        "duration_seconds": log.duration_seconds,
                        "error_message": log.error_message,
                    }
                    for log in logs
                ]

        except Exception as e:
            self.logger.error(
                f"Error getting pipeline history for "
                f"'{pipeline_name}': {str(e)}"
            )
            raise

    async def get_pipeline_list(self) -> List[str]:
        """
        Get list of ALL expected pipelines (including unconfigured ones).

        Also opportunistically retries initialization of any pipeline still
        in init_errors — so pipelines whose creds landed via a runtime
        mechanism (e.g. POST /api/shopify/prime writing to /tmp) recover
        without needing a pod restart, even on workers that didn't receive
        the prime call directly.

        Returns:
            List of pipeline names.
        """
        self._retry_failed_inits()
        return list(self.all_pipeline_names)

    def _retry_failed_inits(self) -> None:
        """Retry initialization for any pipeline currently in init_errors.
        Cheap enough to call on every list — factories are idempotent and
        only fail if creds still aren't available."""
        if not self.init_errors:
            return
        # Lazy import to avoid cycles; only the factories referenced by
        # pipelines currently in init_errors are needed.
        factories = {
            "hubspot": lambda: HubSpotPipeline(),
            "meta_ads": lambda: MetaAdsPipeline(),
            "google_ads": lambda: GoogleAdsPipeline(),
            "google_analytics": lambda: GoogleAnalyticsPipeline(),
            "google_sheets": lambda: GoogleSheetsPipeline(),
            "woocommerce": lambda: WooCommercePipeline(),
            "shopify": lambda: ShopifyPipeline(),
            "snapshot": lambda: SnapshotPipeline(),
        }
        recovered = []
        for name in list(self.init_errors.keys()):
            factory = factories.get(name)
            if not factory:
                continue
            try:
                self.pipelines[name] = factory()
                self.init_errors.pop(name, None)
                recovered.append(name)
            except Exception as exc:
                # Still failing — leave the error in place and move on.
                self.init_errors[name] = str(exc)
        if recovered:
            self.logger.info("Pipelines recovered on retry: %s", recovered)

    async def configure_google_sheets(
        self,
        sheet_id: str,
        worksheet_names: Optional[List[str]] = None,
    ) -> None:
        """
        Configure or update the Google Sheets pipeline.

        Args:
            sheet_id: Google Sheets ID.
            worksheet_names: List of worksheet names to fetch.

        Raises:
            ValueError: If configuration fails.
        """
        try:
            self.pipelines["google_sheets"] = GoogleSheetsPipeline(
                sheet_id=sheet_id,
                worksheet_names=worksheet_names,
            )
            self.logger.info("Google Sheets pipeline configured")
        except Exception as e:
            self.logger.error(
                f"Error configuring Google Sheets pipeline: {str(e)}"
            )
            raise
