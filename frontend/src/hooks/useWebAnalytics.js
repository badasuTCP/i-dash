import { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../services/api';

/**
 * useWebAnalytics — Fetches live GA4 data from the backend for a division.
 *
 * Returns the live data when available, or signals the caller to use
 * its static fallback data.
 *
 * @param {string} division  - 'cp' | 'sanitred' | 'ibos'
 * @param {object} fallback  - Static seed data { scorecards, visitorTrend, ... }
 * @param {Date|null} dateFrom - Optional start date from date filter
 * @param {Date|null} dateTo   - Optional end date from date filter
 */
export function useWebAnalytics(division, fallback = {}, dateFrom = null, dateTo = null) {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [propertyId, setPropertyId] = useState(null);
  const [apiReachable, setApiReachable] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await dashboardAPI.getWebAnalytics(division, dateFrom, dateTo);
      const data = resp.data;
      setApiReachable(true);
      setPropertyId(data.property_id || null);

      if (data.hasLiveData) {
        setLiveData(data);
        setHasLiveData(true);
        console.info(`[GA4] ${division}: Live data from property ${data.property_id} (${data.granularity}, ${data.visitorTrend?.length || 0} data points)`);
      } else {
        setHasLiveData(false);
        setLiveData(null);
        console.info(`[GA4] ${division}: No live data. Property: ${data.property_id || 'NONE CONFIGURED'}`);
      }
    } catch (err) {
      // API call failed — fall back to static data silently
      console.warn(`[useWebAnalytics] Failed to fetch GA4 data for ${division}:`, err.message);
      setApiReachable(false);
      setHasLiveData(false);
      setLiveData(null);
    } finally {
      setLoading(false);
    }
  }, [division, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Merge live data over static fallback ───────────────────────────────────
  // If we have live data, transform it into the shape the WebAnalyticsDashboard
  // template expects.  Otherwise, pass through the static fallback unchanged.

  if (!hasLiveData || !liveData) {
    return {
      loading,
      hasLiveData: false,
      apiReachable,
      propertyId,
      scorecards: fallback.scorecards || [],
      visitorTrend: fallback.visitorTrend || [],
      trafficSources: fallback.trafficSources || [],
      deviceData: fallback.deviceData || [],
      metricsPerPeriod: fallback.metricsPerPeriod || {},
      granularity: 'monthly',
    };
  }

  // Build live scorecards in the same shape the template expects
  const sc = liveData.scorecards || {};
  const liveScorecards = [
    { label: 'Total Visits',       value: sc.totalVisits || 0,        change: sc.totalVisitsChange || 0,  color: 'blue',    format: 'number',  metricKey: 'visits' },
    { label: 'Returning Visitors', value: sc.returningVisitors || 0,  change: sc.returningChange || 0,    color: 'violet',  format: 'number',  metricKey: 'returning' },
    { label: 'Bounce Rate',        value: sc.bounceRate || 0,         change: 0,                          color: 'emerald', format: 'percent' },
    { label: 'Avg Session (min)',   value: sc.avgSessionMin || 0,      change: 0,                          color: 'amber',   format: 'decimal' },
  ];

  // Build metricsPerPeriod from live visitorTrend so date filter resolution works
  const liveMetricsPerPeriod = {};
  for (const pt of liveData.visitorTrend || []) {
    liveMetricsPerPeriod[pt.month] = {
      visits: pt.visits,
      returning: pt.returning,
    };
  }

  return {
    loading,
    hasLiveData: true,
    apiReachable: true,
    propertyId: liveData.property_id,
    scorecards: liveScorecards,
    visitorTrend: liveData.visitorTrend || [],
    trafficSources: liveData.trafficSources || [],
    deviceData: liveData.deviceData || [],
    metricsPerPeriod: liveMetricsPerPeriod,
    granularity: liveData.granularity || 'daily',
  };
}
