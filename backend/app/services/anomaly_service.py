"""
Phase 2 — Anomaly Guard.

Background monitor that flags any contractor or retail source where
the last 24h CPL or Revenue deviates by >40% from its 7-day rolling
average. Emits one row per (source, metric, detection time) into the
``anomalies`` table. Each detection is an immutable event — the same
underlying spike on consecutive runs creates multiple rows so an
operator can see persistence vs flapping.

Detection rules
---------------
For every (source_type, source_id, metric):
    last24h = sum/avg over [now-24h, now]
    baseline_7d_avg = mean of the 7 most recent full days BEFORE the
                      24h window (so the baseline doesn't include the
                      anomaly itself)
    deviation_pct = (last24h - baseline_7d_avg) / max(|baseline|, eps)

Flag if |deviation_pct| > 0.40, where eps = 0.01 to avoid divide-by-zero
(a baseline of $0 with new spend is a real signal — flagged as 'critical').

Severity:
    |dev| >= 1.00  → 'critical'
    |dev| >= 0.40  → 'warning'

Sources
-------
- Contractor (per Meta account_id)         metrics: spend, leads, cpl
- CP Store (Shopify aggregate)             metric:  revenue
- Sani-Tred Store (WooCommerce aggregate)  metric:  revenue

CPL = spend / leads. Skipped when leads == 0 in either window
(undefined). Auto-cleared anomalies (deviation drops back inside the
threshold on a subsequent run) are NOT marked here — that's a separate
reconciliation pass to add later.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.anomalies import Anomaly
from app.models.metrics import (
    GoogleAdMetric, MetaAdMetric, ShopifyOrder, WCOrder,
)

logger = logging.getLogger(__name__)


THRESHOLD = 0.40        # 40% deviation flags
CRITICAL = 1.00         # 100%+ is critical
EPS = 0.01              # divide-by-zero guard
MIN_BASELINE_DAYS = 3   # don't flag against thin baselines


@dataclass(frozen=True)
class Candidate:
    """A single detection candidate before threshold filtering."""

    source_type: str
    source_id: str
    source_label: Optional[str]
    metric: str
    last24h_value: float
    baseline_7d_avg: float
    deviation_pct: float
    notes: Optional[str] = None


def _classify_severity(deviation_pct: float) -> Optional[str]:
    """Return 'critical' / 'warning' / None depending on magnitude."""
    abs_d = abs(deviation_pct)
    if abs_d >= CRITICAL:
        return "critical"
    if abs_d >= THRESHOLD:
        return "warning"
    return None


def _safe_pct(curr: float, baseline: float) -> float:
    """Signed deviation from baseline. Eps guard for $0 baselines."""
    denom = max(abs(baseline), EPS)
    return (curr - baseline) / denom


# ──────────────────────────────────────────────────────────────────────
# Per-source detectors
# ──────────────────────────────────────────────────────────────────────

async def _contractor_candidates(
    db: AsyncSession, *, now: datetime,
) -> List[Candidate]:
    """
    Per-Meta-account spend + leads + CPL deviation.

    A "contractor" here is any Meta ad account — the i-bos division
    spans many accounts (Beckley, Tailored, SLG, etc.) and each gets
    its own flag. CP and Sani-Tred accounts are also evaluated; tag
    by division so the UI later can group them.
    """
    today = now.date()
    last24h_start = now - timedelta(hours=24)
    baseline_end = today - timedelta(days=1)        # exclusive of last24h window
    baseline_start = baseline_end - timedelta(days=6)  # 7 full days

    # Pull totals for both windows in one query per platform
    last24h_q = await db.execute(
        select(
            MetaAdMetric.account_id,
            MetaAdMetric.account_name,
            MetaAdMetric.division,
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
        )
        .where(MetaAdMetric.date >= last24h_start.date())
        .group_by(MetaAdMetric.account_id, MetaAdMetric.account_name, MetaAdMetric.division)
    )
    last24h_rows = {
        (r[0] or "?"): {
            "name": r[1] or r[0],
            "division": r[2],
            "spend": float(r[3] or 0),
            "leads": float(r[4] or 0),
        }
        for r in last24h_q.all()
    }

    baseline_q = await db.execute(
        select(
            MetaAdMetric.account_id,
            MetaAdMetric.account_name,
            MetaAdMetric.division,
            func.coalesce(func.sum(MetaAdMetric.spend), 0),
            func.coalesce(func.sum(MetaAdMetric.conversions), 0),
            func.count(func.distinct(MetaAdMetric.date)),
        )
        .where(and_(
            MetaAdMetric.date >= baseline_start,
            MetaAdMetric.date <= baseline_end,
        ))
        .group_by(MetaAdMetric.account_id, MetaAdMetric.account_name, MetaAdMetric.division)
    )
    baseline_rows = {
        (r[0] or "?"): {
            "name": r[1] or r[0],
            "division": r[2],
            "spend": float(r[3] or 0),
            "leads": float(r[4] or 0),
            "days": int(r[5] or 0),
        }
        for r in baseline_q.all()
    }

    candidates: List[Candidate] = []
    seen_ids = set(last24h_rows) | set(baseline_rows)

    for acct_id in seen_ids:
        cur = last24h_rows.get(acct_id, {"spend": 0.0, "leads": 0.0, "name": acct_id, "division": None})
        base = baseline_rows.get(acct_id, {"spend": 0.0, "leads": 0.0, "days": 0, "name": cur["name"], "division": cur.get("division")})

        if base["days"] < MIN_BASELINE_DAYS:
            continue  # not enough baseline to trust

        baseline_daily_spend = base["spend"] / base["days"]
        baseline_daily_leads = base["leads"] / base["days"]

        # Contractor / division tag for source_type
        div = (cur.get("division") or base.get("division") or "platform").lower()
        if div in ("ibos", "i-bos"):
            source_type = "contractor"
        elif div == "cp":
            source_type = "cp"
        elif div == "sanitred":
            source_type = "sanitred"
        else:
            source_type = "platform"

        label = base["name"] or cur["name"]

        # Spend
        candidates.append(Candidate(
            source_type=source_type,
            source_id=str(acct_id),
            source_label=str(label) if label else None,
            metric="spend",
            last24h_value=cur["spend"],
            baseline_7d_avg=baseline_daily_spend,
            deviation_pct=_safe_pct(cur["spend"], baseline_daily_spend),
            notes=f"baseline_days={base['days']}",
        ))

        # Leads
        candidates.append(Candidate(
            source_type=source_type,
            source_id=str(acct_id),
            source_label=str(label) if label else None,
            metric="leads",
            last24h_value=cur["leads"],
            baseline_7d_avg=baseline_daily_leads,
            deviation_pct=_safe_pct(cur["leads"], baseline_daily_leads),
            notes=f"baseline_days={base['days']}",
        ))

        # CPL: only when both windows have leads
        if cur["leads"] > 0 and base["leads"] > 0:
            cur_cpl = cur["spend"] / cur["leads"]
            base_cpl = base["spend"] / base["leads"]
            candidates.append(Candidate(
                source_type=source_type,
                source_id=str(acct_id),
                source_label=str(label) if label else None,
                metric="cpl",
                last24h_value=cur_cpl,
                baseline_7d_avg=base_cpl,
                deviation_pct=_safe_pct(cur_cpl, base_cpl),
                notes=f"baseline_days={base['days']}",
            ))

    return candidates


async def _retail_candidates(
    db: AsyncSession, *, now: datetime,
) -> List[Candidate]:
    """CP Shopify + Sani-Tred WC daily-revenue deviation."""
    today = now.date()
    last24h_start = (now - timedelta(hours=24)).date()
    baseline_end = today - timedelta(days=1)
    baseline_start = baseline_end - timedelta(days=6)

    candidates: List[Candidate] = []

    # CP Shopify
    try:
        cur_q = await db.execute(
            select(func.coalesce(func.sum(ShopifyOrder.total), 0))
            .where(ShopifyOrder.date_created >= last24h_start)
        )
        cur_rev = float(cur_q.scalar() or 0)

        base_q = await db.execute(
            select(
                func.coalesce(func.sum(ShopifyOrder.total), 0),
                func.count(func.distinct(ShopifyOrder.date_created)),
            )
            .where(and_(
                ShopifyOrder.date_created >= baseline_start,
                ShopifyOrder.date_created <= baseline_end,
            ))
        )
        base_total, base_days = base_q.one()
        base_total = float(base_total or 0)
        base_days = int(base_days or 0)
        if base_days >= MIN_BASELINE_DAYS:
            base_daily = base_total / base_days
            candidates.append(Candidate(
                source_type="cp",
                source_id="cp_store",
                source_label="CP Store (Shopify)",
                metric="revenue",
                last24h_value=cur_rev,
                baseline_7d_avg=base_daily,
                deviation_pct=_safe_pct(cur_rev, base_daily),
                notes=f"baseline_days={base_days}",
            ))
    except Exception as exc:
        logger.warning("anomaly: shopify retail check failed: %s", exc)

    # Sani-Tred WC
    try:
        cur_q = await db.execute(
            select(func.coalesce(func.sum(WCOrder.total), 0))
            .where(and_(
                WCOrder.date_created >= last24h_start,
                WCOrder.division == "sanitred",
            ))
        )
        cur_rev = float(cur_q.scalar() or 0)

        base_q = await db.execute(
            select(
                func.coalesce(func.sum(WCOrder.total), 0),
                func.count(func.distinct(WCOrder.date_created)),
            )
            .where(and_(
                WCOrder.date_created >= baseline_start,
                WCOrder.date_created <= baseline_end,
                WCOrder.division == "sanitred",
            ))
        )
        base_total, base_days = base_q.one()
        base_total = float(base_total or 0)
        base_days = int(base_days or 0)
        if base_days >= MIN_BASELINE_DAYS:
            base_daily = base_total / base_days
            candidates.append(Candidate(
                source_type="sanitred",
                source_id="sanitred_store",
                source_label="Sani-Tred Store (WooCommerce)",
                metric="revenue",
                last24h_value=cur_rev,
                baseline_7d_avg=base_daily,
                deviation_pct=_safe_pct(cur_rev, base_daily),
                notes=f"baseline_days={base_days}",
            ))
    except Exception as exc:
        logger.warning("anomaly: woocommerce retail check failed: %s", exc)

    return candidates


# ──────────────────────────────────────────────────────────────────────
# Orchestration
# ──────────────────────────────────────────────────────────────────────

async def _persist_flags(
    db: AsyncSession, candidates: Iterable[Candidate],
) -> Tuple[int, int]:
    """
    Insert one Anomaly row per candidate that exceeds threshold.

    Returns (flagged, skipped). Skipped includes everything below
    threshold — most candidates are normal noise.
    """
    flagged = 0
    skipped = 0
    rows: List[Anomaly] = []

    for c in candidates:
        sev = _classify_severity(c.deviation_pct)
        if sev is None:
            skipped += 1
            continue
        rows.append(Anomaly(
            source_type=c.source_type,
            source_id=c.source_id,
            source_label=c.source_label,
            metric=c.metric,
            last24h_value=round(c.last24h_value, 4),
            baseline_7d_avg=round(c.baseline_7d_avg, 4),
            deviation_pct=round(c.deviation_pct, 4),
            severity=sev,
            status="open",
            notes=c.notes,
        ))
        flagged += 1

    if rows:
        db.add_all(rows)
        await db.commit()

    return flagged, skipped


async def run_anomaly_pass(now: Optional[datetime] = None) -> Dict[str, int]:
    """
    Public entry point — invoked by the scheduler and by /api/v2 triggers.

    One pass evaluates every contractor + retail source, classifies
    candidates, and inserts only those that exceed threshold.
    """
    now = now or datetime.now(timezone.utc)

    candidates: List[Candidate] = []
    async with async_session_maker() as db:
        try:
            candidates.extend(await _contractor_candidates(db, now=now))
        except Exception as exc:
            logger.warning("anomaly: contractor pass failed: %s", exc)
        try:
            candidates.extend(await _retail_candidates(db, now=now))
        except Exception as exc:
            logger.warning("anomaly: retail pass failed: %s", exc)

        flagged, skipped = await _persist_flags(db, candidates)

    logger.info(
        "anomaly: pass complete (flagged=%d, skipped=%d, evaluated=%d)",
        flagged, skipped, len(candidates),
    )
    return {
        "flagged": flagged,
        "skipped": skipped,
        "evaluated": len(candidates),
        "checked_at": now.isoformat(),
    }
