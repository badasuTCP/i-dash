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

export function GlobalDateProvider({ children }) {
  const [dateRange, setDateRange] = useState(null);   // { start: Date, end: Date } | null
  const [presetId, setPresetId] = useState(null);      // e.g. 'last30', 'thisMonth', 'custom'

  /** Called by the Header DateRangePicker onApply */
  const setGlobalDate = useCallback((start, end, preset = null) => {
    setDateRange(start && end ? { start, end } : null);
    setPresetId(preset);
  }, []);

  /** Clear back to "All Time" (no filter) */
  const clearGlobalDate = useCallback(() => {
    setDateRange(null);
    setPresetId(null);
  }, []);

  return (
    <GlobalDateContext.Provider value={{
      dateRange,
      presetId,
      dateFrom: dateRange?.start ?? null,
      dateTo: dateRange?.end ?? null,
      isFiltered: !!dateRange,
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
