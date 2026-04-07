import { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../services/api';

/**
 * useMarketingData — Fetches live Meta + Google Ads data from the backend.
 *
 * Mirrors the useWebAnalytics pattern:
 *  - Returns `hasLiveData: true` when the backend confirms at least one
 *    marketing pipeline (meta_ads or google_ads) has completed successfully.
 *  - Falls back to the static seed props passed to MarketingDashboardTemplate
 *    when no pipeline has ever run (`hasLiveData: false`).
 *
 * @param {string}  division   - 'cp' | 'sanitred' | 'ibos'
 * @param {object}  fallback   - Static seed data { scorecards, performanceSummary, ... }
 * @param {Date|null} dateFrom - Optional start date
 * @param {Date|null} dateTo   - Optional end date
 */
export function useMarketingData(division, fallback = {}, dateFrom = null, dateTo = null) {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLiveData, setHasLiveData] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await dashboardAPI.getMarketing(division, dateFrom, dateTo);
      const data = resp.data;

      if (data.hasLiveData) {
        setLiveData(data);
        setHasLiveData(true);
        console.info(`[Marketing] ${division}: Live data — spend=$${data.scorecards?.totalSpend || 0}`);
      } else {
        setHasLiveData(false);
        setLiveData(null);
        console.info(`[Marketing] ${division}: No pipeline has run yet`);
      }
    } catch (err) {
      console.warn(`[useMarketingData] Failed to fetch for ${division}:`, err.message);
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
      dataWarning: fallback.dataWarning || null,
      scorecards: fallback.scorecards || [],
      performanceSummary: fallback.performanceSummary || [],
      spendByPeriod: fallback.spendByPeriod || [],
    };
  }

  // ── Live data → build template-compatible shapes ─────────────────────
  const sc = liveData.scorecards || {};
  const totalSpend = sc.totalSpend || 0;
  const totalLeads = sc.totalLeads || 0;

  const liveScorecards = [
    { label: 'Marketing Spend', value: totalSpend,            change: 0, color: 'emerald', format: 'currency', metricKey: 'spend',  sparkData: [] },
    { label: 'Impressions',     value: sc.totalImpressions || 0, change: 0, color: 'blue',    format: 'number',   sparkData: [] },
    { label: 'Leads',           value: totalLeads,            change: 0, color: 'violet',  format: 'number',   metricKey: 'leads',  sparkData: [] },
    { label: 'CPL',             value: sc.cpl || 0,           change: 0, color: 'amber',   format: 'currency', sparkData: [] },
  ];

  // Performance summary per platform (from backend)
  const livePerformanceSummary = (liveData.platforms || []).map((p) => ({
    division: p.division,
    spend: `$${(p.spend / 1000).toFixed(1)}K`,
    revenue: `$${(p.revenue / 1000).toFixed(0)}K`,
    roas: `${p.roas}x`,
    conversions: String(p.conversions),
    cpl: `$${p.cpl.toFixed(2)}`,
  }));

  // Spend by period time series
  const liveSpendByPeriod = (liveData.spendByPeriod || []).map((d) => ({
    period: d.date,
    spend: d.spend,
    leads: d.leads,
  }));

  return {
    loading,
    hasLiveData: true,
    dataWarning: null,  // Live = no warning
    scorecards: liveScorecards,
    performanceSummary: livePerformanceSummary.length > 0
      ? livePerformanceSummary
      : fallback.performanceSummary || [],
    spendByPeriod: liveSpendByPeriod.length > 0
      ? liveSpendByPeriod
      : fallback.spendByPeriod || [],
  };
}
