"""
Scheduler service for I-Dash Analytics Platform.

Registers one APScheduler job per pipeline, driven by rows in the
``pipeline_schedules`` table. Each job runs its pipeline at the cadence
selected in the Pipeline Control UI and persists a PipelineLog row so
the dashboard's "last sync" metric reflects scheduled runs too.

Leader election: with 2 gunicorn workers, only one should fire jobs.
We use a Postgres advisory lock acquired on a dedicated long-lived
connection. If the leader dies (worker recycle, crash), the lock is
released automatically and the other worker takes over on its next
reconcile tick (~60s).
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import settings
from app.core.database import async_session_maker, engine
from app.models.pipeline_log import PipelineLog, PipelineStatus
from app.models.pipeline_schedule import PipelineSchedule
from app.services.pipeline_service import PipelineService

logger = logging.getLogger(__name__)

# Postgres advisory lock key for scheduler leader election.
# Arbitrary 64-bit int — must be stable and unique to this subsystem.
_SCHEDULER_LOCK_KEY = 7410_4710_4710

# Default interval per pipeline (matches the FREQ_OPTIONS dropdown).
DEFAULT_INTERVALS: Dict[str, str] = {
    "hubspot":           "2hrs",
    "meta_ads":          "2hrs",
    "google_ads":        "4hrs",
    "google_analytics":  "4hrs",
    "google_sheets":     "6hrs",
    "woocommerce":       "2hrs",
    "shopify":           "2hrs",
    "snapshot":          "4hrs",
}

# How often the scheduler re-reads the DB to pick up schedule changes
# or retry leader election. Keep short so UI edits feel live.
_RECONCILE_INTERVAL_SECONDS = 60


def _interval_to_trigger_kwargs(value: str) -> Optional[Dict]:
    """Map a UI interval string to APScheduler trigger kwargs.

    Returns a dict with ``trigger`` + trigger-specific args, or None if
    the value is unrecognized.
    """
    value = (value or "").strip().lower()
    mapping = {
        "30min":  {"trigger": "interval", "minutes": 30},
        "1hr":    {"trigger": "interval", "hours": 1},
        "2hrs":   {"trigger": "interval", "hours": 2},
        "4hrs":   {"trigger": "interval", "hours": 4},
        "6hrs":   {"trigger": "interval", "hours": 6},
        "12hrs":  {"trigger": "interval", "hours": 12},
        "daily":  {"trigger": "cron", "hour": 0, "minute": 0},
    }
    return mapping.get(value)


class SchedulerService:
    """Per-pipeline APScheduler manager backed by ``pipeline_schedules``."""

    def __init__(self) -> None:
        self.logger = logging.getLogger(f"{__name__}.SchedulerService")

        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            self.scheduler = AsyncIOScheduler()
        except ImportError:
            self.logger.warning(
                "APScheduler not installed. Scheduling features disabled."
            )
            self.scheduler = None

        self.pipeline_service = PipelineService()
        self.is_running = False
        self.is_leader = False
        # Long-lived connection that holds the advisory lock. Closing it
        # releases the lock so a surviving worker can take over.
        self._lock_conn: Optional[AsyncConnection] = None
        # Snapshot of the schedule config currently reflected in APScheduler,
        # so we only touch jobs whose definition actually changed.
        self._applied: Dict[str, Dict] = {}

    # ── Lifecycle ──────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start APScheduler and kick off the reconcile loop.

        The reconcile loop acquires the leader lock (if free) on its first
        tick and keeps trying if it can't, so restarts and worker recycles
        self-heal without operator intervention.
        """
        if not self.scheduler:
            return

        await self._seed_defaults()

        try:
            self.scheduler.start()
            self.is_running = True
        except Exception as exc:
            self.logger.error("APScheduler failed to start: %s", exc)
            return

        # Reconcile is itself scheduled via APScheduler so it survives the
        # same lifecycle as the pipeline jobs.
        self.scheduler.add_job(
            self._reconcile,
            "interval",
            seconds=_RECONCILE_INTERVAL_SECONDS,
            id="_scheduler_reconcile",
            name="Scheduler Reconcile",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=30,
        )

        # Run one reconcile immediately so jobs are live before the first
        # interval tick.
        asyncio.create_task(self._reconcile())

        self.logger.info(
            "SchedulerService started (reconcile every %ss)",
            _RECONCILE_INTERVAL_SECONDS,
        )

    async def stop(self) -> None:
        if self.scheduler and self.is_running:
            try:
                self.scheduler.shutdown(wait=True)
            except Exception as exc:
                self.logger.error("Error stopping APScheduler: %s", exc)
        self.is_running = False
        await self._release_leader_lock()

    # ── Leader election ────────────────────────────────────────────────

    async def _try_acquire_leader(self) -> bool:
        """Non-blocking advisory lock acquisition on a dedicated connection.

        The lock auto-releases when ``self._lock_conn`` is closed (worker
        death, explicit stop), so the other gunicorn worker can take over
        on its next reconcile tick. We also ping the lock connection each
        time so a silently-dropped connection (idle timeout, network blip)
        causes this worker to drop leadership and re-attempt acquisition.
        """
        # If we think we're already leader, verify the underlying lock
        # connection is still alive. If not, drop leadership so we (or
        # someone) can re-acquire.
        if self.is_leader:
            from sqlalchemy import text
            try:
                await self._lock_conn.execute(text("SELECT 1"))
                return True
            except Exception as exc:
                self.logger.warning(
                    "Leader lock connection died (%s) — stepping down", exc
                )
                await self._release_leader_lock()

        try:
            conn = await engine.connect()
            result = await conn.execute(
                _advisory_lock_stmt(),
                {"k": _SCHEDULER_LOCK_KEY},
            )
            acquired = bool(result.scalar())
            if acquired:
                self._lock_conn = conn
                self.is_leader = True
                self.logger.info(
                    "Scheduler acquired leader lock (worker=%s)", id(self)
                )
                return True
            await conn.close()
            return False
        except Exception as exc:
            self.logger.warning(
                "Could not attempt leader lock acquisition: %s", exc
            )
            return False

    async def _release_leader_lock(self) -> None:
        if self._lock_conn is not None:
            try:
                await self._lock_conn.close()
            except Exception:
                pass
            finally:
                self._lock_conn = None
        self.is_leader = False

    # ── Seeding + reconciliation ───────────────────────────────────────

    async def _seed_defaults(self) -> None:
        """Ensure every pipeline has a row in ``pipeline_schedules``.

        Idempotent — only inserts rows for pipelines that don't already
        have a stored schedule. Runs its own CREATE TABLE IF NOT EXISTS
        first so we don't lose the seed to a race where init_db's DDL
        hasn't propagated to this session's connection yet.
        """
        try:
            async with async_session_maker() as session:
                # Belt-and-suspenders: refresh this session's view of the
                # schema before querying. Cheap; idempotent.
                from sqlalchemy import text as _text
                try:
                    await session.execute(_text(
                        """
                        CREATE TABLE IF NOT EXISTS pipeline_schedules (
                            id SERIAL PRIMARY KEY,
                            pipeline_name VARCHAR(64) NOT NULL UNIQUE,
                            interval_value VARCHAR(16) NOT NULL DEFAULT '4hrs',
                            enabled BOOLEAN NOT NULL DEFAULT TRUE,
                            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                        )
                        """
                    ))
                    await session.commit()
                except Exception as ddl_exc:
                    self.logger.warning(
                        "seed DDL refresh failed (ignored): %s", ddl_exc
                    )
                    try:
                        await session.rollback()
                    except Exception:
                        pass

                stmt = select(PipelineSchedule.pipeline_name)
                existing = {
                    row for row in (await session.execute(stmt)).scalars()
                }
                inserted = 0
                for name, interval in DEFAULT_INTERVALS.items():
                    if name in existing:
                        continue
                    session.add(PipelineSchedule(
                        pipeline_name=name,
                        interval_value=interval,
                        enabled=True,
                    ))
                    inserted += 1
                if inserted:
                    await session.commit()
                    self.logger.info(
                        "Seeded %d default pipeline schedule(s)", inserted
                    )
        except Exception as exc:
            self.logger.warning("Could not seed pipeline schedules: %s", exc)

    async def _load_schedules(self) -> List[PipelineSchedule]:
        try:
            async with async_session_maker() as session:
                result = await session.execute(select(PipelineSchedule))
                return list(result.scalars().all())
        except Exception as exc:
            self.logger.warning("Could not load pipeline schedules: %s", exc)
            return []

    async def _reconcile(self) -> None:
        """Bring APScheduler jobs in line with the current DB state.

        Tries to acquire leader lock first; if unsuccessful, removes any
        jobs this worker may have registered previously so only the leader
        fires pipelines.
        """
        if not self.scheduler:
            return

        is_leader = await self._try_acquire_leader()
        if not is_leader:
            # Make sure we're not holding stale jobs from a previous
            # leader-tenure that has since been lost.
            if self._applied:
                for job_id in list(self._applied.keys()):
                    try:
                        self.scheduler.remove_job(job_id)
                    except Exception:
                        pass
                self._applied.clear()
                self.logger.info("Stepped down — no longer scheduler leader")
            return

        schedules = await self._load_schedules()
        desired: Dict[str, Dict] = {}
        for sched in schedules:
            trigger_kwargs = _interval_to_trigger_kwargs(sched.interval_value)
            if not trigger_kwargs or not sched.enabled:
                continue
            desired[f"pipeline__{sched.pipeline_name}"] = {
                "pipeline_name": sched.pipeline_name,
                "interval_value": sched.interval_value,
                "trigger_kwargs": trigger_kwargs,
            }

        # Remove jobs that no longer exist or whose cadence changed.
        for job_id, applied in list(self._applied.items()):
            if (
                job_id not in desired
                or desired[job_id]["interval_value"] != applied["interval_value"]
            ):
                try:
                    self.scheduler.remove_job(job_id)
                except Exception:
                    pass
                self._applied.pop(job_id, None)

        # Add/replace jobs that need updating.
        for job_id, target in desired.items():
            if job_id in self._applied:
                continue  # already matches current cadence
            try:
                self.scheduler.add_job(
                    _run_pipeline_job,
                    id=job_id,
                    name=f"Run pipeline: {target['pipeline_name']}",
                    args=[target["pipeline_name"], self.pipeline_service],
                    replace_existing=True,
                    coalesce=True,
                    max_instances=1,
                    misfire_grace_time=300,
                    **target["trigger_kwargs"],
                )
                self._applied[job_id] = target
                self.logger.info(
                    "Scheduled %s every %s",
                    target["pipeline_name"], target["interval_value"],
                )
            except Exception as exc:
                self.logger.warning(
                    "Could not schedule %s: %s",
                    target["pipeline_name"], exc,
                )

    # ── Introspection ──────────────────────────────────────────────────

    async def get_status(self) -> dict:
        if not self.scheduler:
            return {
                "is_running": False, "is_leader": False,
                "jobs": [], "total_jobs": 0,
                "error": "Scheduler not available",
            }
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "trigger": str(job.trigger),
                "next_run": (
                    job.next_run_time.isoformat() if job.next_run_time else None
                ),
            })
        return {
            "is_running": self.is_running,
            "is_leader": self.is_leader,
            "jobs": jobs,
            "total_jobs": len(jobs),
        }

    async def reconcile_now(self) -> None:
        """Public hook so the API can force an immediate reconcile after a
        schedule update (avoids the up-to-60s delay of the periodic loop)."""
        await self._reconcile()


def _advisory_lock_stmt():
    """Return a parameterised ``SELECT pg_try_advisory_lock(:k)`` statement.

    Lazy-import to keep module import cheap and to avoid coupling SQLAlchemy
    text API version quirks to module load time.
    """
    from sqlalchemy import text
    return text("SELECT pg_try_advisory_lock(:k)")


async def _run_pipeline_job(name: str, pipeline_service: PipelineService) -> None:
    """Top-level async callable invoked by APScheduler for each pipeline.

    Wraps :meth:`PipelineService.run_pipeline` with PipelineLog persistence
    using the short name (``hubspot``) so the dashboard's last-sync timestamp
    matches what manual "Run Now" produces. Without this, BasePipeline only
    writes rows keyed by ``hubspot_pipeline``, which :meth:`get_pipeline_status`
    would miss and the UI would report stale data.
    """
    started_at = datetime.now(timezone.utc)
    logger.info("Scheduled pipeline tick: %s", name)
    try:
        result = await pipeline_service.run_pipeline(name)
        completed_at = datetime.now(timezone.utc)
        status_val = (
            PipelineStatus.SUCCESS
            if result.get("status") == "success"
            else PipelineStatus.FAILED
        )
        await _persist_scheduled_log(
            name, status_val,
            result.get("records_loaded", 0),
            started_at, completed_at,
            result.get("error"),
        )
    except Exception as exc:
        completed_at = datetime.now(timezone.utc)
        logger.exception("Scheduled pipeline '%s' crashed", name)
        await _persist_scheduled_log(
            name, PipelineStatus.FAILED, 0,
            started_at, completed_at,
            f"{type(exc).__name__}: {exc}",
        )


async def _persist_scheduled_log(
    name: str,
    status_val: PipelineStatus,
    records: int,
    started_at: datetime,
    completed_at: datetime,
    error_msg: Optional[str] = None,
) -> None:
    try:
        async with async_session_maker() as session:
            session.add(PipelineLog(
                pipeline_name=name,
                status=status_val,
                records_fetched=records,
                error_message=error_msg,
                started_at=started_at,
                completed_at=completed_at,
            ))
            await session.commit()
    except Exception as exc:
        logger.warning(
            "Could not persist scheduled PipelineLog for %s: %s", name, exc
        )
