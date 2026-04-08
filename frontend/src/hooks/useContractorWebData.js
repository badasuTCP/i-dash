import { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../services/api';
import { useGlobalDate } from '../context/GlobalDateContext';

/**
 * useContractorWebData — Fetches per-contractor GA4 web metrics for I-BOS.
 *
 * Automatically refetches when the global date range (Header DatePicker) changes.
 *
 * Returns:
 *   contractorDetails  — array of per-contractor row objects for the analytics table
 *   websiteBreakdown   — array of { name, value, color, contractorId } for pie chart
 *   loading            — boolean
 *   hasLiveData        — boolean; false = no data for the selected range
 */
export function useContractorWebData() {
  const { dateFrom, dateTo } = useGlobalDate();
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLiveData, setHasLiveData] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await dashboardAPI.getContractorWebData('ibos', dateFrom, dateTo);
      const data = resp.data;

      if (data && data.hasLiveData) {
        setLiveData(data);
        setHasLiveData(true);
        console.info(`[ContractorWeb] ibos: Live data — ${data.contractors?.length ?? 0} contractors`);
      } else {
        setHasLiveData(false);
        setLiveData(null);
        console.info('[ContractorWeb] ibos: No pipeline data for selected range');
      }
    } catch (err) {
      console.warn('[useContractorWebData] Fetch failed:', err.message);
      setHasLiveData(false);
      setLiveData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!hasLiveData || !liveData) {
    return {
      loading,
      hasLiveData: false,
      contractorDetails: [],
      websiteBreakdown: [],
    };
  }

  // Map live contractors to display shapes expected by IBOSSWebAnalytics
  const contractorDetails = (liveData.contractors || []).map((c) => ({
    contractor: c.name,
    visits: c.visits ?? 0,
    visitors: c.visitors ?? 0,
    newVisitors: c.newVisitors ?? 0,
    returning: c.returning ?? 0,
    avgEngagement: c.avgEngagement ?? '—',
    bounceRate: c.bounceRate ?? '—',
    topSource: c.topSource ?? '—',
    paidShare: c.paidShare ?? '—',
    organicShare: c.organicShare ?? '—',
    directShare: c.directShare ?? '—',
    contractorId: c.contractorId,
  }));

  const websiteBreakdown = (liveData.contractors || []).map((c) => ({
    name: c.name,
    value: c.visits ?? 0,
    color: c.color ?? '#94a3b8',
    contractorId: c.contractorId,
  }));

  return {
    loading,
    hasLiveData: true,
    contractorDetails,
    websiteBreakdown,
  };
}
