import { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../services/api';
import { useGlobalDate } from '../context/GlobalDateContext';

/**
 * useRetailData — Fetches live retail data from the Google Sheets pipeline.
 *
 * Automatically refetches when the global date range changes.
 *
 * @param {string}  division   - 'sanitred' (expandable to other divisions)
 * @param {object}  fallback   - Static seed data { scorecards, channelRevenue, topProducts, ... }
 */
export function useRetailData(division, fallback = {}) {
  const { dateFrom, dateTo } = useGlobalDate();
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLiveData, setHasLiveData] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await dashboardAPI.getRetail(division, dateFrom, dateTo);
      const data = resp.data;

      if (data.hasLiveData) {
        setLiveData(data);
        setHasLiveData(true);
        console.info(`[Retail] ${division}: Live data — revenue=$${data.scorecards?.totalRevenue || 0}`);
      } else {
        setHasLiveData(false);
        setLiveData(null);
        console.info(`[Retail] ${division}: No pipeline has run yet`);
      }
    } catch (err) {
      console.warn(`[useRetailData] Failed to fetch for ${division}:`, err.message);
      setHasLiveData(false);
      setLiveData(null);
    } finally {
      setLoading(false);
    }
  }, [division, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Not live → return fallback seed data as-is ───────────────────────
  if (!hasLiveData || !liveData) {
    return {
      loading,
      hasLiveData: false,
      scorecards: fallback.scorecards || [],
      channelRevenue: fallback.channelRevenue || [],
      topProducts: fallback.topProducts || [],
      monthlyMetrics: fallback.monthlyMetrics || [],
      channelSplit: fallback.channelSplit || [],
      customerInsights: fallback.customerInsights || {},
      regionData: fallback.regionData || [],
    };
  }

  // ── Live data → build display-compatible shapes ─────────────────────
  const sc = liveData.scorecards || {};

  const liveScorecards = [
    { label: 'Total Retail Revenue', value: sc.totalRevenue || 0, change: 0, color: 'emerald', format: 'currency', sparkData: [] },
    { label: 'Online Orders', value: sc.totalOrders || 0, change: 0, color: 'blue', format: 'number', sparkData: [] },
    { label: 'Phone Orders', value: 0, change: 0, color: 'violet', format: 'number', sparkData: [] },
    { label: 'Avg Order Value', value: sc.avgOrderValue || 0, change: 0, color: 'amber', format: 'currency', sparkData: [] },
  ];

  return {
    loading,
    hasLiveData: true,
    scorecards: liveScorecards,
    channelRevenue: liveData.channelRevenue || fallback.channelRevenue || [],
    topProducts: liveData.topProducts || fallback.topProducts || [],
    monthlyMetrics: liveData.monthlyMetrics || fallback.monthlyMetrics || [],
    // These stay as fallback until we have more granular data
    channelSplit: fallback.channelSplit || [],
    customerInsights: fallback.customerInsights || {},
    regionData: fallback.regionData || [],
  };
}
