import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * GlobalDateContext
 *
 * Single source of truth for the active date range across ALL dashboard pages.
 * The DateRangePicker in the Header writes here; every page and data-fetching
 * hook reads from here.  Changing the date in the Header triggers a re-render
 * of every consumer, which cascades into API refetches via useWebAnalytics,
 * useMarketingData, etc.
 */

const GlobalDateContext = createContext(null);

// IMPORTANT: normalize Date → YYYY-MM-DD using LOCAL calendar fields, not
// toISOString(). DateRangePicker returns endOfMonth(lm) for "Last Month",
// which is 23:59:59.999 local time. toISOString() on that in EDT/EST bumps
// to the next UTC day — so "Mar 31" became "Apr 1" on the wire and every
// "Last Month" query picked up an extra day of spend. Kept as a module-level
// helper so setGlobalDate, clearGlobalDate, and the lazy-init default all
// use the same conversion.
const _pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const _fmtLocal = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
};

export function GlobalDateProvider({ children }) {
  // Default to YTD (Jan 1 of current year → today)
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      start: `${now.getFullYear()}-01-01`,
      end: _fmtLocal(now),
    };
  });
  const [presetId, setPresetId] = useState('ytd');

  /** Called by the Header DateRangePicker onApply.
   *  Normalizes Date objects to YYYY-MM-DD strings for stable comparison. */
  const setGlobalDate = useCallback((start, end, preset = null) => {
    const s = _fmtLocal(start);
    const e = _fmtLocal(end);
    setDateRange(s && e ? { start: s, end: e } : null);
    setPresetId(preset);
  }, []);

  /** Clear back to YTD default */
  const clearGlobalDate = useCallback(() => {
    const now = new Date();
    setDateRange({ start: `${now.getFullYear()}-01-01`, end: _fmtLocal(now) });
    setPresetId('ytd');
  }, []);

  return (
    <GlobalDateContext.Provider value={{
      dateRange,
      presetId,
      dateFrom: dateRange?.start ?? null,
      dateTo: dateRange?.end ?? null,
      isFiltered: presetId !== null && presetId !== 'ytd',
      setGlobalDate,
      clearGlobalDate,
    }}>
      {children}
    </GlobalDateContext.Provider>
  );
}

/** Safe to call outside a provider — returns null-ish defaults so hooks like
 *  useDashboardDateFilter degrade gracefully in unit tests. */
const NO_PROVIDER_DEFAULTS = {
  dateRange: null,
  presetId: null,
  dateFrom: null,
  dateTo: null,
  isFiltered: false,
  setGlobalDate: () => {},
  clearGlobalDate: () => {},
};

export function useGlobalDate() {
  const ctx = useContext(GlobalDateContext);
  return ctx ?? NO_PROVIDER_DEFAULTS;
}
