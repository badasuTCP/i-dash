"""
Phase 2 — Projection Engine.

Computes "Projected Month-End <Spend|Leads>" by division using the last
14 days of actuals as the daily run-rate. Output lands in the
``metrics_projections`` table; one row per (metric_type, division,
period_start). Idempotent — same run twice updates the same row.

Not wired to the frontend yet (Hard Freeze through demo). The only
public surface is :pyfunc:`run_projection_pass` and the v2 read API.

Run-rate methodology
--------------------
- as_of = yesterday (today is partial; including today understates rate)
- window = [as_of - 14, as_of - 1]  (14 full days)
- run_rate_daily = sum(window) / max(1, days_with_data_in_window)
- mtd_actual = sum from period_start through as_of
- projected_total = mtd_actual + run_rate_daily * days_remaining

Confidence is derived from how many of the 14 window-days actually
had data:
  - high   if >= 12 days observed
  - medium if 7-11 days observed
  - low    if < 7 days observed (run_rate is unreliable)

A "low" projection is still stored — the API marks it so callers can
warn before quoting it.
"""

from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import and_, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.metrics import GoogleAdMetric, MetaAdMetric
from app.models.projections import MetricsProjection

logger = logging.getLogger(__name__)


# Divisions we compute projections for. 'all' is the cross-division
# rollup. Each platform pipeline already tags rows with division at
# extract time (see _backfill_ad_metric_divisions).
DIVISIONS: List[str] = ["cp", "sanitred", "ibos", "all"]

# Metric types we project. Keep this small for v1 — easy to extend.
METRICS: List[str] = ["spend", "leads"]


@dataclass(frozen=True)
class ProjectionResult:
    """In-memory representation of one projection row before persistence."""

    metric_type: str
    division: str
    period_start: date
    period_end: date
    as_of: date
    mtd_actual: float
    run_rate_daily: float
    days_observed: int
    projected_total: float
    days_remaining: int
    confidence: str
    notes: Optional[str] = None


def _month_bounds(d: date) -> Tuple[date, date]:
    """Return (first_of_month, last_of_month) for the given date."""
    first = d.replace(day=1)
    last_day = calendar.monthrange(d.year, d.month)[1]
    last = d.replace(day=last_day)
    return first, last


def _confidence_label(days_observed: int) -> str:
    if days_observed >= 12:
        return "high"
    if days_observed >= 7:
        return "medium"
    return "low"


async def _sum_by_day(
    db: AsyncSession,
    *,
    metric_type: str,
    division: str,
    start: date,
    end: date,
) -> Dict[date, float]:
    """
    Sum the chosen metric by date over [start, end] (inclusive).

    For ``spend`` we sum Meta+Google ``spend``; for ``leads`` we sum
    Meta+Google ``conversions``. ``division == 'all'`` sums every row.
    Returns a dict so callers can count populated days vs sum.
    """
    if metric_type not in {"spend", "leads"}:
        raise ValueError(f"Unsupported metric_type: {metric_type}")

    column_map = {"spend": "spend", "leads": "conversions"}
    col = column_map[metric_type]

    out: Dict[date, float] = {}

    for model in (MetaAdMetric, GoogleAdMetric):
        stmt = (
            select(model.date, func.coalesce(func.sum(getattr(model, col)), 0))
            .where(and_(model.date >= start, model.date <= end))
            .group_by(model.date)
        )
        if division != "all":
            # Tolerate the historical 'i-bos' label too
            valid = {division, "ibos", "i-bos"} if division == "ibos" else {division}
            stmt = stmt.where(model.division.in_(list(valid)))
        rows = (await db.execute(stmt)).all()
        for d, v in rows:
            if d is None:
                continue
            out[d] = out.get(d, 0.0) + float(v or 0)

    return out


async def _project_one(
    db: AsyncSession,
    *,
    metric_type: str,
    division: str,
    today: date,
) -> Optional[ProjectionResult]:
    """Compute a single projection. Returns None when there's no signal."""
    as_of = today - timedelta(days=1)
    period_start, period_end = _month_bounds(today)

    # 14-day window, ending the day before today (today's data is partial)
    window_end = as_of
    window_start = as_of - timedelta(days=13)
    by_day = await _sum_by_day(
        db,
        metric_type=metric_type,
        division=division,
        start=window_start,
        end=window_end,
    )

    days_observed = sum(1 for v in by_day.values() if v > 0)
    window_total = sum(by_day.values())
    run_rate_daily = (window_total / days_observed) if days_observed else 0.0

    # Month-to-date actuals (period_start → as_of)
    mtd_by_day = await _sum_by_day(
        db,
        metric_type=metric_type,
        division=division,
        start=period_start,
        end=as_of,
    )
    mtd_actual = sum(mtd_by_day.values())

    days_remaining = max(0, (period_end - as_of).days)
    projected_total = mtd_actual + run_rate_daily * days_remaining
    confidence = _confidence_label(days_observed)

    notes_parts = [f"window={window_start.isoformat()}..{window_end.isoformat()}"]
    if confidence == "low":
        notes_parts.append("LOW_CONFIDENCE: <7 days of data in window")
    notes = " | ".join(notes_parts)

    return ProjectionResult(
        metric_type=metric_type,
        division=division,
        period_start=period_start,
        period_end=period_end,
        as_of=as_of,
        mtd_actual=round(mtd_actual, 2),
        run_rate_daily=round(run_rate_daily, 4),
        days_observed=days_observed,
        projected_total=round(projected_total, 2),
        days_remaining=days_remaining,
        confidence=confidence,
        notes=notes,
    )


async def _upsert(db: AsyncSession, results: Iterable[ProjectionResult]) -> int:
    """
    Idempotent UPSERT on (metric_type, division, period_start).

    Postgres ON CONFLICT DO UPDATE — same row each month, refreshed on
    every pass. Returns the number of rows touched.
    """
    rows: List[dict] = []
    now = datetime.now(timezone.utc)
    for r in results:
        rows.append({
            "metric_type": r.metric_type,
            "division": r.division,
            "period_start": r.period_start,
            "period_end": r.period_end,
            "as_of": r.as_of,
            "mtd_actual": r.mtd_actual,
            "run_rate_daily": r.run_rate_daily,
            "days_observed": r.days_observed,
            "projected_total": r.projected_total,
            "days_remaining": r.days_remaining,
            "confidence": r.confidence,
            "notes": r.notes,
            "last_updated": now,
        })

    if not rows:
        return 0

    stmt = pg_insert(MetricsProjection).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_metrics_projection_metric_div_period",
        set_={
            "period_end": stmt.excluded.period_end,
            "as_of": stmt.excluded.as_of,
            "mtd_actual": stmt.excluded.mtd_actual,
            "run_rate_daily": stmt.excluded.run_rate_daily,
            "days_observed": stmt.excluded.days_observed,
            "projected_total": stmt.excluded.projected_total,
            "days_remaining": stmt.excluded.days_remaining,
            "confidence": stmt.excluded.confidence,
            "notes": stmt.excluded.notes,
            "last_updated": stmt.excluded.last_updated,
        },
    )
    await db.execute(stmt)
    await db.commit()
    return len(rows)


async def run_projection_pass(today: Optional[date] = None) -> Dict[str, int]:
    """
    Public entry point — invoked by the scheduler and by /api/v2 admin
    triggers. Computes one row per (metric, division) and upserts.

    Returns a small summary dict the caller can log: number of rows
    written, number of metric/division combinations evaluated.
    """
    today = today or datetime.now(timezone.utc).date()
    rows: List[ProjectionResult] = []
    skipped = 0

    async with async_session_maker() as db:
        for metric in METRICS:
            for div in DIVISIONS:
                try:
                    res = await _project_one(
                        db, metric_type=metric, division=div, today=today,
                    )
                    if res is not None:
                        rows.append(res)
                except Exception as exc:
                    skipped += 1
                    logger.warning(
                        "forecasting: skipped %s/%s — %s", metric, div, exc,
                    )

        written = await _upsert(db, rows)

    logger.info(
        "forecasting: pass complete (rows=%d, skipped=%d, today=%s)",
        written, skipped, today.isoformat(),
    )
    return {
        "rows_written": written,
        "skipped": skipped,
        "evaluated_combinations": len(METRICS) * len(DIVISIONS),
        "as_of": (today - timedelta(days=1)).isoformat(),
    }
