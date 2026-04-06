import { useState, useCallback, useMemo } from 'react';
import { dashboardAPI } from '../services/api';

// ─── Quarter / Month label → date range ────────────────────────────────────────
function parseLabel(label) {
  if (!label || typeof label !== 'string') return null;

  // Match "Q1 2026", "Q2 2025", etc.
  const qMatch = label.match(/^Q([1-4])\s+(\d{4})$/);
  if (qMatch) {
    const quarter = parseInt(qMatch[1], 10);
    const year    = parseInt(qMatch[2], 10);
    const startMonth = (quarter - 1) * 3; // 0-indexed
    return {
      start: new Date(year, startMonth, 1),
      end:   new Date(year, startMonth + 3, 0), // last day of the quarter
    };
  }

  // Match "Jan 2026", "Feb 2025", etc.
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mMatch = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (mMatch) {
    const mIdx = months.findIndex((m) => m.toLowerCase() === mMatch[1].toLowerCase().slice(0, 3));
    const year = parseInt(mMatch[2], 10);
    if (mIdx >= 0) {
      return {
        start: new Date(year, mIdx, 1),
        end:   new Date(year, mIdx + 1, 0),
      };
    }
  }

  // Match "2025", "2026" — full year
  const yMatch = label.match(/^(\d{4})$/);
  if (yMatch) {
    const year = parseInt(yMatch[1], 10);
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }

  return null;
}

function overlaps(itemLabel, filterStart, filterEnd) {
  const range = parseLabel(itemLabel);
  if (!range) return true; // unknown format → always show
  return range.start <= filterEnd && range.end >= filterStart;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
/**
 * useDashboardDateFilter
 *
 * Provides:
 *  - handleDateChange(start, end): call from DateRangePicker's onApply
 *  - filterData(arr, labelKey): filters an array of objects whose `labelKey`
 *    is a string like "Q1 2026", "Jan 2026", etc.
 *  - isFiltered: true when a non-default range is active
 *  - dateRange: { start, end } | null
 *  - apiData: data from real backend (null while loading / on error)
 *  - apiLoading: boolean
 *  - fetchLive(endpoint, params): manually trigger a live fetch
 */
export function useDashboardDateFilter({ apiEndpoint = null } = {}) {
  const [dateRange,   setDateRange]   = useState(null);
  const [apiData,     setApiData]     = useState(null);
  const [apiLoading,  setApiLoading]  = useState(false);

  const handleDateChange = useCallback(async (start, end) => {
    setDateRange({ start, end });
    setApiData(null);

    if (apiEndpoint) {
      setApiLoading(true);
      try {
        const iso = (d) => d.toISOString().split('T')[0];
        const res = await dashboardAPI[apiEndpoint]?.(iso(start), iso(end));
        if (res?.data) setApiData(res.data);
      } catch {
        // backend unavailable — will fall back to filtered prop data
      } finally {
        setApiLoading(false);
      }
    }
  }, [apiEndpoint]);

  const filterData = useCallback((arr, labelKey = 'month') => {
    if (!dateRange || !Array.isArray(arr)) return arr;
    const { start, end } = dateRange;
    const filtered = arr.filter((item) => overlaps(item[labelKey], start, end));
    return filtered.length > 0 ? filtered : arr; // don't return empty
  }, [dateRange]);

  const isFiltered = !!dateRange;

  return {
    handleDateChange,
    filterData,
    isFiltered,
    dateRange,
    apiData,
    apiLoading,
  };
}
