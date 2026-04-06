import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardAPI } from '../services/api';

/**
 * useDashboardData — Progressive API integration hook.
 *
 * Attempts to fetch from the live backend API. If the backend returns data,
 * uses it. If the call fails (network, 401, 500, empty data, etc.), silently
 * falls back to the hardcoded data passed via `fallback`.
 *
 * This lets us transition to live data incrementally — pages that aren't yet
 * wired up just pass their existing hardcoded datasets as fallback.
 *
 * Usage:
 *   const { data, isLive, loading, lastUpdated, error, refetch } = useDashboardData({
 *     endpoint: 'overview',           // maps to dashboardAPI.getOverview
 *     fallback: hardcodedScorecards,   // what to show if API fails
 *     dateRange: { start, end },       // optional active date filter
 *     transform: (apiResponse) => ..., // optional transform of API data to match component shape
 *   });
 */

const ENDPOINT_MAP = {
  overview:        dashboardAPI.getOverview,
  scorecards:      dashboardAPI.getScorecards,
  revenue:         dashboardAPI.getRevenue,
  adsPerformance:  dashboardAPI.getAdsPerformance,
  hubspot:         dashboardAPI.getHubspot,
};

export function useDashboardData({
  endpoint,
  fallback,
  dateRange = null,
  transform = null,
  enabled = true,
}) {
  const [data, setData] = useState(fallback);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    const apiFn = ENDPOINT_MAP[endpoint];
    if (!apiFn || !enabled) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange?.start || null;
      const endDate   = dateRange?.end || null;

      const response = await apiFn(startDate, endDate);
      const apiData  = response.data;

      // Only use API data if it's non-empty
      const hasData = apiData && (
        (Array.isArray(apiData) && apiData.length > 0) ||
        (typeof apiData === 'object' && Object.keys(apiData).length > 0)
      );

      if (hasData && !controller.signal.aborted) {
        const transformed = transform ? transform(apiData) : apiData;
        setData(transformed);
        setIsLive(true);
        setLastUpdated(apiData.last_updated || new Date().toISOString());
      } else if (!controller.signal.aborted) {
        // Empty API response — stick with fallback
        setData(fallback);
        setIsLive(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        // API failed — use fallback silently
        console.warn(`[useDashboardData] ${endpoint} API failed, using fallback:`, err.message);
        setData(fallback);
        setIsLive(false);
        setError(err.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [endpoint, dateRange?.start?.getTime?.(), dateRange?.end?.getTime?.(), enabled, fallback, transform]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  // When fallback changes (e.g. local filter), update if not live
  useEffect(() => {
    if (!isLive) setData(fallback);
  }, [fallback, isLive]);

  return {
    data,
    isLive,
    loading,
    error,
    lastUpdated,
    refetch: fetchData,
  };
}
