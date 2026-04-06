import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';

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
 * useDashboardDateFilter — Single Source of Truth for all dashboard filters.
 *
 * State is a single atomic object { dateRange, presetId } so switching presets
 * always performs a complete state replacement (no ghost state from prior custom
 * date inputs).
 *
 * Key exports:
 *   resolveData(arr, labelKey, metricsPerPeriod?)
 *     → { data, resolvedMetrics, activePeriod, noDataForPeriod, fallbackMessage }
 *     Both charts and scorecards consume this ONE function — the resolved metrics
 *     come out of the same call that filtered the chart data, guaranteeing they
 *     always reference the same period label.
 *
 *   filterData(arr, labelKey)   — backward-compat wrapper around resolveData
 */
export function useDashboardDateFilter() {
  // Single atomic state — replaced as a whole on every filter change.
  const [filter, setFilter] = useState({ dateRange: null, presetId: null });

  /**
   * Apply a new date range.  presetId is optional meta (e.g. 'lastQuarter').
   * Replacing the whole object guarantees no leftover custom-range ghost state.
   */
  const handleDateChange = useCallback((start, end, presetId = null) => {
    setFilter({ dateRange: { start, end }, presetId });
  }, []);

  const clearFilter = useCallback(() => {
    setFilter({ dateRange: null, presetId: null });
  }, []);

  /**
   * resolveData — THE unified resolution path for every component.
   *
   * 1. Filters `arr` by the active date range using label-based overlap.
   * 2. Derives `activePeriod` (the canonical label string).
   * 3. Looks up `metricsPerPeriod[activePeriod]` via three fallback strategies
   *    so the same "Q1 2026" key works whether the user selected a custom date
   *    range covering Q1 or clicked the "This Quarter" preset.
   * 4. Returns everything charts AND scorecards need from one call.
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

      if (!filter.dateRange || !Array.isArray(arr) || arr.length === 0) return base;

      const { start, end } = filter.dateRange;
      const filtered = arr.filter((item) => overlaps(item[labelKey], start, end));

      if (filtered.length > 0) {
        let activePeriod    = null;
        let resolvedMetrics = null;

        if (metricsPerPeriod) {
          // Strategy 1: exact key match on one of the filtered item labels
          for (const item of filtered) {
            const lbl = item[labelKey];
            if (lbl && metricsPerPeriod[lbl] !== undefined) {
              activePeriod    = lbl;
              resolvedMetrics = metricsPerPeriod[lbl];
              break;
            }
          }

          // Strategy 2: a metricsPerPeriod key whose parsed range falls within
          // the selected filter range (handles "Last Quarter" → "Q4 2025" key)
          if (!activePeriod) {
            for (const key of Object.keys(metricsPerPeriod)) {
              const kr = parseLabel(key);
              if (!kr) continue;
              // Key range is contained in (or equal to) filter range
              if (kr.start >= start && kr.end <= end) {
                activePeriod    = key;
                resolvedMetrics = metricsPerPeriod[key];
                break;
              }
            }
          }

          // Strategy 3: overlapping key (partial overlap — e.g. "This Month"
          // overlapping Q1 data)
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

        // If we still don't have activePeriod use the most-recent filtered label
        if (!activePeriod) {
          activePeriod = mostRecentLabel(filtered, labelKey);
        }

        return { data: filtered, resolvedMetrics, activePeriod, noDataForPeriod: false, fallbackMessage: null };
      }

      // ── No match — fall back to most recent available ──────────────────────
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
    [filter.dateRange]
  );

  /**
   * filterData — backward-compatible wrapper.
   * Returns { data, noDataForPeriod, fallbackMessage } — same shape as before
   * so existing callers that don't need scorecard resolution still work.
   */
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
    isFiltered: !!filter.dateRange,
    dateRange:  filter.dateRange,
    presetId:   filter.presetId,
  };
}
