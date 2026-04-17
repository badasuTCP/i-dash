"""
Base pipeline abstract class for I-Dash Analytics Platform.

Provides the foundation for all data extraction, transformation, and loading pipelines
with built-in retry logic, error handling, and comprehensive logging.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, List, TypeVar

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.pipeline_log import PipelineLog, PipelineStatus

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BasePipeline(ABC):
    """
    Abstract base class for all data pipelines.

    Provides common functionality for extract, transform, and load operations
    with automatic retry logic, error handling, and pipeline execution logging.

    Attributes:
        name: Identifier for the pipeline.
        max_retries: Maximum number of retry attempts.
        retry_delay: Initial delay in seconds for exponential backoff.
    """

    def __init__(
        self,
        name: str,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        """
        Initialize the pipeline.

        Args:
            name: Unique identifier for this pipeline.
            max_retries: Maximum retry attempts for failed operations.
            retry_delay: Initial delay in seconds (increases exponentially).
        """
        self.name = name
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.logger = logging.getLogger(f"{__name__}.{name}")

    @abstractmethod
    async def extract(self) -> Any:
        """
        Extract raw data from the source API or system.

        Must be implemented by subclasses. Should handle API authentication,
        pagination, and rate limiting.

        Returns:
            Raw data in any format suitable for the transform step.

        Raises:
            Exception: Any errors during extraction should be raised.
        """
        pass

    @abstractmethod
    async def transform(self, raw_data: Any) -> List[T]:
        """
        Transform raw data into model instances.

        Must be implemented by subclasses. Should validate data, calculate
        derived metrics, and instantiate database models.

        Args:
            raw_data: Raw data from extract() method.

        Returns:
            List of ORM model instances ready for database insertion.

        Raises:
            ValueError: If data validation fails.
        """
        pass

    async def load(self, records: List[T]) -> int:
        """
        Load records into the database with upsert semantics.

        Deletes existing records for the same dates/identifiers and inserts
        new ones atomically. Provides transactional safety.

        Args:
            records: List of ORM model instances to load.

        Returns:
            Number of records successfully inserted.

        Raises:
            Exception: If database operation fails.
        """
        if not records:
            self.logger.info("No records to load")
            return 0

        async with async_session_maker() as session:
            try:
                # Get the model class from the first record
                model_class = type(records[0])

                # For date-based tables, delete existing records scoped by
                # (date, account_id, campaign_id) when those columns exist.
                # A plain date-only delete would wipe rows from other
                # accounts' pipeline runs that share the same date.
                if hasattr(records[0], "date"):
                    first = records[0]
                    has_acct = hasattr(first, "account_id")
                    has_campaign = hasattr(first, "campaign_id")

                    if has_acct and has_campaign:
                        # For per-account date-based models, wipe the FULL
                        # pipeline window for each account being refreshed,
                        # not just the dates that happen to appear in the
                        # new records. Deleted-campaign rows often linger on
                        # dates where no currently-active campaign ran,
                        # which a records-only delete would miss.
                        accts = set(r.account_id for r in records)
                        p_start = getattr(self, "start_date", None)
                        p_end = getattr(self, "end_date", None)

                        if p_start and p_end:
                            self.logger.debug(
                                f"Deleting {model_class.__name__} rows for "
                                f"{len(accts)} account(s) across {p_start}..{p_end}"
                            )
                            for aid in accts:
                                stmt = delete(model_class).where(and_(
                                    model_class.account_id == aid,
                                    model_class.date >= p_start,
                                    model_class.date <= p_end,
                                ))
                                await session.execute(stmt)
                        else:
                            # No pipeline date window set — fall back to
                            # per-(date, account_id) delete.
                            acct_dates = set(
                                (r.date, r.account_id) for r in records
                            )
                            self.logger.debug(
                                f"Deleting existing records for "
                                f"{len(acct_dates)} (date, account) pairs"
                            )
                            for d, aid in acct_dates:
                                stmt = delete(model_class).where(and_(
                                    model_class.date == d,
                                    model_class.account_id == aid,
                                ))
                                await session.execute(stmt)
                    else:
                        dates_to_delete = set(r.date for r in records)
                        self.logger.debug(
                            f"Deleting existing records for {len(dates_to_delete)} dates"
                        )
                        for date_val in dates_to_delete:
                            stmt = delete(model_class).where(
                                model_class.date == date_val
                            )
                            await session.execute(stmt)

                # Add all new records
                session.add_all(records)
                await session.commit()

                self.logger.info(f"Successfully loaded {len(records)} records")
                return len(records)

            except Exception as e:
                await session.rollback()
                self.logger.error(f"Error loading records: {str(e)}")
                raise

    async def _retry_with_backoff(
        self,
        coro_factory,
        operation_name: str,
    ) -> Any:
        """
        Execute a coroutine with exponential backoff retry logic.

        Args:
            coro_factory: A **zero-arg callable** that returns a fresh
                coroutine on each invocation. A coroutine object can only be
                awaited once — passing one directly would raise
                ``RuntimeError: cannot reuse already awaited coroutine`` on
                the second retry attempt. Wrap your call in a lambda:
                ``await self._retry_with_backoff(lambda: self.extract(), ...)``.

                For backwards compatibility, if a bare coroutine is passed in
                it is awaited once on the first attempt only; any retry will
                be suppressed with a logged warning.
            operation_name: Description of the operation (for logging).

        Returns:
            Result from the successful coroutine execution.

        Raises:
            Exception: The last exception if all retries fail.
        """
        last_exception = None
        delay = self.retry_delay

        # Backwards-compat guard: if we were handed a bare coroutine, only
        # try it once. Log the misuse so it can be fixed at the caller.
        is_bare_coro = asyncio.iscoroutine(coro_factory)
        if is_bare_coro:
            self.logger.warning(
                "%s: received bare coroutine instead of factory — retries disabled "
                "for this call to avoid 'cannot reuse already awaited coroutine'",
                operation_name,
            )

        for attempt in range(self.max_retries):
            try:
                self.logger.debug(f"{operation_name} - attempt {attempt + 1}")
                if is_bare_coro:
                    return await coro_factory
                return await coro_factory()
            except Exception as e:
                last_exception = e
                # A bare coroutine can't be retried — exit immediately.
                if is_bare_coro:
                    self.logger.error(
                        "%s failed on single attempt (bare coroutine, no retry): %s",
                        operation_name, e,
                    )
                    break
                if attempt < self.max_retries - 1:
                    self.logger.warning(
                        f"{operation_name} failed: {str(e)}. "
                        f"Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                    delay *= 2  # Exponential backoff
                else:
                    self.logger.error(
                        f"{operation_name} failed after {self.max_retries} attempts"
                    )

        raise last_exception

    async def _log_pipeline_execution(
        self,
        status: PipelineStatus,
        records_fetched: int = 0,
        error_message: str = None,
    ) -> None:
        """
        Log pipeline execution details to the database.

        Args:
            status: The status of pipeline execution.
            records_fetched: Number of records processed.
            error_message: Error message if execution failed.
        """
        async with async_session_maker() as session:
            try:
                log_entry = PipelineLog(
                    pipeline_name=self.name,
                    status=status,
                    records_fetched=records_fetched,
                    error_message=error_message,
                    started_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                )
                session.add(log_entry)
                await session.commit()
                self.logger.debug(
                    f"Logged pipeline execution: {status.value} "
                    f"({records_fetched} records)"
                )
            except Exception as e:
                self.logger.error(f"Failed to log pipeline execution: {str(e)}")

    async def run(self) -> dict:
        """
        Execute the complete pipeline: extract, transform, and load.

        Orchestrates the three main pipeline stages with proper error handling,
        retry logic, and logging. Ensures all errors are caught and logged even
        if they occur.

        Returns:
            Dictionary with execution summary:
                - status: Success or failure status
                - records_loaded: Number of records loaded
                - error: Error message if failed
                - duration_seconds: Execution time

        Example:
            result = await pipeline.run()
            if result['status'] == 'success':
                print(f"Loaded {result['records_loaded']} records")
            else:
                print(f"Failed: {result['error']}")
        """
        start_time = datetime.now(timezone.utc)
        records_fetched = 0

        try:
            self.logger.info(f"Starting pipeline: {self.name}")

            # Extract with retry — pass a factory so each retry creates a
            # fresh coroutine (a coroutine object can only be awaited once).
            self.logger.debug("Extract phase started")
            raw_data = await self._retry_with_backoff(
                lambda: self.extract(),
                operation_name=f"{self.name} - extract",
            )
            self.logger.debug("Extract phase completed")

            # Transform with retry
            self.logger.debug("Transform phase started")
            records = await self._retry_with_backoff(
                lambda: self.transform(raw_data),
                operation_name=f"{self.name} - transform",
            )
            records_fetched = len(records)
            self.logger.debug(f"Transform phase completed: {records_fetched} records")

            # Load with retry
            self.logger.debug("Load phase started")
            loaded_count = await self._retry_with_backoff(
                lambda: self.load(records),
                operation_name=f"{self.name} - load",
            )
            self.logger.debug(f"Load phase completed: {loaded_count} records loaded")

            # Log success
            await self._log_pipeline_execution(
                status=PipelineStatus.SUCCESS,
                records_fetched=records_fetched,
            )

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            self.logger.info(
                f"Pipeline {self.name} completed successfully "
                f"({records_fetched} records in {duration:.2f}s)"
            )

            return {
                "status": "success",
                "pipeline": self.name,
                "records_loaded": loaded_count,
                "duration_seconds": duration,
            }

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.logger.error(f"Pipeline {self.name} failed: {error_msg}")

            # Log failure
            await self._log_pipeline_execution(
                status=PipelineStatus.FAILED,
                records_fetched=records_fetched,
                error_message=error_msg,
            )

            duration = (datetime.now(timezone.utc) - start_time).total_seconds()

            return {
                "status": "failed",
                "pipeline": self.name,
                "records_loaded": 0,
                "error": error_msg,
                "duration_seconds": duration,
            }
