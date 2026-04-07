import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useGlobalDate } from '../context/GlobalDateContext';

// ─── Label parsers ─────────────────────────────────────────────────────────────
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/**
 * Parse a period label string into a { start, end } date range.
 * Supports: "Q1 2026", "Jan 2025", "2025"
 * Returns null for unparseable labels (treated as always-visible).
 */
export function parseLabel(label) {
  if (!label || typeof label !== 'string') return null;

  // "Q1 2026", "Q2 2025" …
  const qMatch = label.match(/^Q([1-4])\s+(\d{4})$/);
  if (qMatch) {
    const q    = parseInt(qMatch[1], 10);
    const year = parseInt(qMatch[2], 10);
    const sm   = (q - 1) * 3;
    return { start: new Date(year, sm, 1), end: new Date(year, sm + 3, 0) };
  }

  // "Jan 2025", "Feb 2024" …
  const mMatch = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (mMatch) {
    const mIdx = MONTHS.findIndex((m) => m === mMatch[1].toLowerCase().slice(0, 3));
    const year = parseInt(mMatch[2], 10);
    if (mIdx >= 0) {
      return { start: new Date(year, mIdx, 1), end: new Date(year, mIdx + 1, 0) };
    }
  }

  // Plain "Jan" — no year, always show
  if (MONTHS.includes(label.toLowerCase().slice(0, 3))) return null;

  // "2025" full year
  const yMatch = label.match(/^(\d{4})$/);
  if (yMatch) {
    const year = parseInt(yMatch[1], 10);
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }

  // "Mar 09" / "Apr 07" — daily GA4 labels (MMM dd)
  const dayMatch = label.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (dayMatch) {
    // Without year, treat as current year — safe for daily data filtering
    const mIdx = MONTHS.findIndex((m) => m === dayMatch[1].toLowerCase());
    if (mIdx >= 0) {
      const now = new Date();
      const d = new Date(now.getFullYear(), mIdx, parseInt(dayMatch[2], 10));
      return { start: d, end: d };
    }
  }

  return null; // unknown — always include
}

/** True when a label's date range overlaps [filterStart, filterEnd]. */
function overlaps(itemLabel, filterStart, filterEnd) {
  const range = parseLabel(itemLabel);
  if (!range) return true; // unparseable → always show
  return range.start <= filterEnd && range.end >= filterStart;
}

/** Label of the most-recent parseable item in arr. */
function mostRecentLabel(arr, labelKey) {
  if (!arr || arr.length === 0) return null;
  let latestDate  = null;
  let latestLabel = null;
  for (const item of arr) {
    const range = parseLabel(item[labelKey]);
    if (range && (!latestDate || range.end > latestDate)) {
      latestDate  = range.end;
      latestLabel = item[labelKey];
    }
  }
  return latestLabel;
}

function rangeLabel(start, end) {
  try { return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`; }
  catch { return 'selected range'; }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
/**
 * useDashboardDateFilter — reads from GlobalDateContext so ALL pages share one
 * date range set by the Header DateRangePicker.
 *
 * Also retains handleDateChange / clearFilter for backward compatibility —
 * they now delegate to the global context.
 *
 * Key exports:
 *   resolveData(arr, labelKey, metricsPerPeriod?)
 *     → { data, resolvedMetrics, activePeriod, noDataForPeriod, fallbackMessage }
 *
 *   filterData(arr, labelKey)   — backward-compat wrapper
 */
export function useDashboardDateFilter() {
  // ── Read from Global Date Context ────────────────────────────────────────
  // Always call the hook (React rules require unconditional hook calls).
  // Returns null values when no provider is present (tests), which is safe.
  const globalCtx = useGlobalDate();

  // Local fallback state (only used if GlobalDateContext is unavailable)
  const [localFilter, setLocalFilter] = useState({ dateRange: null, presetId: null });

  // Determine active filter — global wins if available
  const dateRange = globalCtx?.dateRange ?? localFilter.dateRange;
  const presetId  = globalCtx?.presetId ?? localFilter.presetId;

  /** Apply date range — writes to global context if available, local otherwise */
  const handleDateChange = useCallback((start, end, preset = null) => {
    if (globalCtx) {
      globalCtx.setGlobalDate(start, end, preset);
    } else {
      setLocalFilter({ dateRange: { start, end }, presetId: preset });
    }
  }, [globalCtx]);

  /** Clear filter */
  const clearFilter = useCallback(() => {
    if (globalCtx) {
      globalCtx.clearGlobalDate();
    } else {
      setLocalFilter({ dateRange: null, presetId: null });
    }
  }, [globalCtx]);

  /**
   * resolveData — THE unified resolution path for every component.
   */
  const resolveData = useCallback(
    (arr, labelKey = 'month', metricsPerPeriod = null) => {
      const base = {
        data:            arr,
        resolvedMetrics: null,
        activePeriod:    null,
        noDataForPeriod: false,
        fallbackMessage: null,
      };

      if (!dateRange || !Array.isArray(arr) || arr.length === 0) return base;

      const { start, end } = dateRange;
      const filtered = arr.filter((item) => overlaps(item[labelKey], start, end));

      if (filtered.length > 0) {
        let activePeriod    = null;
        let resolvedMetrics = null;

        if (metricsPerPeriod) {
          // Strategy 1: exact key match
          for (const item of filtered) {
            const lbl = item[labelKey];
            if (lbl && metricsPerPeriod[lbl] !== undefined) {
              activePeriod    = lbl;
              resolvedMetrics = metricsPerPeriod[lbl];
              break;
            }
          }

          // Strategy 2: key range contained in filter range
          if (!activePeriod) {
            for (const key of Object.keys(metricsPerPeriod)) {
              const kr = parseLabel(key);
              if (!kr) continue;
              if (kr.start >= start && kr.end <= end) {
                activePeriod    = key;
                resolvedMetrics = metricsPerPeriod[key];
                break;
              }
            }
          }

          // Strategy 3: overlapping key
          if (!activePeriod) {
            for (const key of Object.keys(metricsPerPeriod)) {
              const kr = parseLabel(key);
              if (!kr) continue;
              if (kr.start <= end && kr.end >= start) {
                activePeriod    = key;
                resolvedMetrics = metricsPerPeriod[key];
                break;
              }
            }
          }
        }

        if (!activePeriod) {
          activePeriod = mostRecentLabel(filtered, labelKey);
        }

        return { data: filtered, resolvedMetrics, activePeriod, noDataForPeriod: false, fallbackMessage: null };
      }

      // ── No match — fall back to most recent ────────────────────────────
      const latestLabel = mostRecentLabel(arr, labelKey);
      const fallback    = latestLabel
        ? arr.filter((item) => item[labelKey] === latestLabel)
        : arr.slice(-2);

      let resolvedMetrics = null;
      if (metricsPerPeriod && latestLabel) {
        resolvedMetrics = metricsPerPeriod[latestLabel] ?? null;
      }

      return {
        data:            fallback.length > 0 ? fallback : arr,
        resolvedMetrics,
        activePeriod:    latestLabel,
        noDataForPeriod: true,
        fallbackMessage: `No records for ${rangeLabel(start, end)}. Showing ${latestLabel ?? 'most recent'} — run your pipelines to load fresh data.`,
      };
    },
    [dateRange]
  );

  /** filterData — backward-compat wrapper */
  const filterData = useCallback(
    (arr, labelKey = 'month') => {
      const { data, noDataForPeriod, fallbackMessage } = resolveData(arr, labelKey, null);
      return { data, noDataForPeriod, fallbackMessage };
    },
    [resolveData]
  );

  return {
    handleDateChange,
    clearFilter,
    filterData,
    resolveData,
    isFiltered: !!dateRange,
    dateRange,
    presetId,
  };
}
