"""
Scheduler service for I-Dash Analytics Platform.

Uses APScheduler to schedule and manage recurring data refresh pipelines
and snapshot generation jobs.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.services.pipeline_service import PipelineService

logger = logging.getLogger(__name__)


class SchedulerService:
    """
    Manage scheduled tasks using APScheduler.

    Schedules:
    - Pipeline runs at configurable intervals (default: every N hours)
    - Daily snapshot generation at specified time
    - Provides lifecycle management (start, stop, status)
    """

    def __init__(self) -> None:
        """Initialize scheduler service with APScheduler."""
        self.logger = logging.getLogger(f"{__name__}.SchedulerService")

        # Import scheduler lazily to avoid hard dependency
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            self.scheduler = AsyncIOScheduler()
        except ImportError:
            self.logger.warning(
                "APScheduler not installed. Scheduling features disabled. "
                "Install with: pip install apscheduler"
            )
            self.scheduler = None

        self.pipeline_service = PipelineService()
        self.is_running = False

    async def start(self) -> None:
        """
        Start the scheduler and register all jobs.

        Schedules:
        - Pipeline runs every N hours (configurable via DATA_REFRESH_INTERVAL_HOURS)
        - Daily snapshots at 00:00 UTC
        """
        if not self.scheduler:
            self.logger.warning("Scheduler not available, skipping startup")
            return

        try:
            # Register pipeline job
            self.scheduler.add_job(
                self._run_pipelines_job,
                "interval",
                hours=settings.DATA_REFRESH_INTERVAL_HOURS,
                id="run_all_pipelines",
                name="Run All Data Pipelines",
                replace_existing=True,
                coalesce=True,
                misfire_grace_time=300,  # 5 minute grace period
            )

            # Register daily snapshot job
            self.scheduler.add_job(
                self._run_snapshot_job,
                "cron",
                hour=0,
                minute=0,
                id="daily_snapshot",
                name="Generate Daily Snapshot",
                replace_existing=True,
                coalesce=True,
                misfire_grace_time=300,
            )

            self.scheduler.start()
            self.is_running = True

            self.logger.info(
                f"Scheduler started with {len(self.scheduler.get_jobs())} jobs"
            )

        except Exception as e:
            self.logger.error(f"Error starting scheduler: {str(e)}")
            raise

    async def stop(self) -> None:
        """
        Stop the scheduler and cancel all jobs.

        Waits for currently executing jobs to complete before shutting down.
        """
        if not self.scheduler or not self.is_running:
            return

        try:
            self.scheduler.shutdown(wait=True)
            self.is_running = False

            self.logger.info("Scheduler stopped")

        except Exception as e:
            self.logger.error(f"Error stopping scheduler: {str(e)}")
            raise

    async def get_status(self) -> dict:
        """
        Get current scheduler status and job information.

        Returns:
            Dictionary with:
            - is_running: Whether scheduler is active
            - jobs: List of scheduled job details
            - total_jobs: Number of scheduled jobs
        """
        if not self.scheduler:
            return {
                "is_running": False,
                "jobs": [],
                "total_jobs": 0,
                "error": "Scheduler not available",
            }

        jobs = []
        for job in self.scheduler.get_jobs():
            next_run = job.next_run_time.isoformat() if job.next_run_time else None
            jobs.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "trigger": str(job.trigger),
                    "next_run": next_run,
                    "func": job.func_ref,
                }
            )

        return {
            "is_running": self.is_running,
            "jobs": jobs,
            "total_jobs": len(jobs),
        }

    async def trigger_now(self, job_id: str) -> dict:
        """
        Manually trigger a scheduled job.

        Args:
            job_id: ID of the job to trigger ('run_all_pipelines' or 'daily_snapshot').

        Returns:
            Dictionary with job execution status.

        Raises:
            ValueError: If job ID is invalid.
        """
        if not self.scheduler:
            raise RuntimeError("Scheduler not available")

        job = self.scheduler.get_job(job_id)
        if not job:
            raise ValueError(f"Job '{job_id}' not found")

        try:
            # Execute job function directly
            if job_id == "run_all_pipelines":
                await self._run_pipelines_job()
            elif job_id == "daily_snapshot":
                await self._run_snapshot_job()

            self.logger.info(f"Job {job_id} triggered manually")

            return {
                "job_id": job_id,
                "status": "triggered",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            self.logger.error(f"Error triggering job {job_id}: {str(e)}")
            raise

    async def _run_pipelines_job(self) -> None:
        """
        Internal job to run all data pipelines.

        Called by scheduler at configured intervals.
        """
        try:
            self.logger.info("Running scheduled pipeline job")
            result = await self.pipeline_service.run_all_pipelines()

            self.logger.info(
                f"Pipeline job completed. "
                f"Success: {result['total_success']}, "
                f"Failed: {result['total_failed']}"
            )

        except Exception as e:
            self.logger.error(f"Error in pipeline job: {str(e)}")

    async def _run_snapshot_job(self) -> None:
        """
        Internal job to run snapshot pipeline.

        Called by scheduler daily at 00:00 UTC.
        """
        try:
            self.logger.info("Running scheduled snapshot job")
            result = await self.pipeline_service.run_pipeline("snapshot")

            if result["status"] == "success":
                self.logger.info(
                    f"Snapshot job completed. "
                    f"Records loaded: {result['records_loaded']}"
                )
            else:
                self.logger.error(
                    f"Snapshot job failed: {result.get('error', 'Unknown error')}"
                )

        except Exception as e:
            self.logger.error(f"Error in snapshot job: {str(e)}")

    def add_job(
        self,
        func,
        trigger: str,
        job_id: str,
        name: str,
        **trigger_args,
    ) -> Optional[str]:
        """
        Add a custom scheduled job.

        Args:
            func: Async function to execute.
            trigger: Trigger type ('interval', 'cron', 'date', etc.).
            job_id: Unique job identifier.
            name: Human-readable job name.
            **trigger_args: Trigger-specific arguments.

        Returns:
            Job ID if successful, None otherwise.
        """
        if not self.scheduler:
            self.logger.warning("Cannot add job, scheduler not available")
            return None

        try:
            self.scheduler.add_job(
                func,
                trigger,
                id=job_id,
                name=name,
                replace_existing=True,
                coalesce=True,
                **trigger_args,
            )

            self.logger.info(f"Job added: {job_id} ({name})")

            return job_id

        except Exception as e:
            self.logger.error(f"Error adding job {job_id}: {str(e)}")
            return None

    def remove_job(self, job_id: str) -> bool:
        """
        Remove a scheduled job.

        Args:
            job_id: ID of job to remove.

        Returns:
            True if successful, False otherwise.
        """
        if not self.scheduler:
            return False

        try:
            self.scheduler.remove_job(job_id)

            self.logger.info(f"Job removed: {job_id}")

            return True

        except Exception as e:
            self.logger.error(f"Error removing job {job_id}: {str(e)}")
            return False

    def pause_job(self, job_id: str) -> bool:
        """
        Pause a scheduled job.

        Args:
            job_id: ID of job to pause.

        Returns:
            True if successful, False otherwise.
        """
        if not self.scheduler:
            return False

        try:
            self.scheduler.pause_job(job_id)

            self.logger.info(f"Job paused: {job_id}")

            return True

        except Exception as e:
            self.logger.error(f"Error pausing job {job_id}: {str(e)}")
            return False

    def resume_job(self, job_id: str) -> bool:
        """
        Resume a paused job.

        Args:
            job_id: ID of job to resume.

        Returns:
            True if successful, False otherwise.
        """
        if not self.scheduler:
            return False

        try:
            self.scheduler.resume_job(job_id)

            self.logger.info(f"Job resumed: {job_id}")

            return True

        except Exception as e:
            self.logger.error(f"Error resuming job {job_id}: {str(e)}")
            return False
