import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';

// ─── Quarter / Month label → date range ────────────────────────────────────────
function parseLabel(label) {
  if (!label || typeof label !== 'string') return null;

  // "Q1 2026", "Q2 2025", etc.
  const qMatch = label.match(/^Q([1-4])\s+(\d{4})$/);
  if (qMatch) {
    const quarter    = parseInt(qMatch[1], 10);
    const year       = parseInt(qMatch[2], 10);
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end:   new Date(year, startMonth + 3, 0),
    };
  }

  // "Jan 2026", "Feb 2025", etc.
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mMatch = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (mMatch) {
    const mIdx = months.findIndex((m) => m.toLowerCase() === mMatch[1].toLowerCase().slice(0, 3));
    const year  = parseInt(mMatch[2], 10);
    if (mIdx >= 0) {
      return { start: new Date(year, mIdx, 1), end: new Date(year, mIdx + 1, 0) };
    }
  }

  // Plain month name "Jan", "Feb" — year unknown, always show
  const singleMonth = months.findIndex((m) => m.toLowerCase() === label.toLowerCase().slice(0, 3));
  if (singleMonth >= 0) return null; // can't parse without year → show always

  // Full year "2025", "2026"
  const yMatch = label.match(/^(\d{4})$/);
  if (yMatch) {
    const year = parseInt(yMatch[1], 10);
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }

  return null; // unknown format — always include
}

function overlaps(itemLabel, filterStart, filterEnd) {
  const range = parseLabel(itemLabel);
  if (!range) return true;
  return range.start <= filterEnd && range.end >= filterStart;
}

// Given an array, find the label of the most recent item
function mostRecentLabel(arr, labelKey) {
  if (!arr || arr.length === 0) return null;
  let latestDate = null;
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

// Return human-readable label for a date range
function rangeLabel(start, end) {
  try {
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return 'selected range';
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useDashboardDateFilter() {
  const [dateRange, setDateRange] = useState(null);

  const handleDateChange = useCallback((start, end) => {
    setDateRange({ start, end });
  }, []);

  const clearFilter = useCallback(() => {
    setDateRange(null);
  }, []);

  /**
   * filterData(arr, labelKey)
   *
   * Returns:
   *   { data, noDataForPeriod, fallbackMessage }
   *
   * - data: filtered array (or most-recent data if no exact match)
   * - noDataForPeriod: true when no exact match was found
   * - fallbackMessage: human-readable explanation of what we're showing
   */
  const filterData = useCallback((arr, labelKey = 'month') => {
    if (!dateRange || !Array.isArray(arr) || arr.length === 0) {
      return { data: arr, noDataForPeriod: false, fallbackMessage: null };
    }

    const { start, end } = dateRange;
    const filtered = arr.filter((item) => overlaps(item[labelKey], start, end));

    if (filtered.length > 0) {
      return { data: filtered, noDataForPeriod: false, fallbackMessage: null };
    }

    // No exact match — find the most recent available item and show it
    const latestLabel = mostRecentLabel(arr, labelKey);
    const fallback    = latestLabel
      ? arr.filter((item) => item[labelKey] === latestLabel)
      : arr.slice(-2); // last 2 items as fallback

    const selectedLabel = rangeLabel(start, end);
    const availLabel    = latestLabel || 'most recent';

    return {
      data:             fallback.length > 0 ? fallback : arr,
      noDataForPeriod:  true,
      fallbackMessage:  `No records for ${selectedLabel}. Showing ${availLabel} — run your pipelines to load fresh data.`,
    };
  }, [dateRange]);

  // Convenience: check if a range is active
  const isFiltered = !!dateRange;

  return {
    handleDateChange,
    clearFilter,
    filterData,
    isFiltered,
    dateRange,
  };
}
