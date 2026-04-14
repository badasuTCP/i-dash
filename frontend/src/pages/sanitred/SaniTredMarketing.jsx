import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';
import { useMarketingData } from '../../hooks/useMarketingData';

// Zero-fallback: $0.00 / empty state when no 2026 live data exists
const ZERO_FALLBACK = {
  scorecards: [
    { label: 'Marketing Spend', value: 0, change: 0, color: 'emerald', format: 'currency', metricKey: 'spend', sparkData: [] },
    { label: 'Impressions',     value: 0, change: 0, color: 'blue',    format: 'number',   sparkData: [] },
    { label: 'Leads',           value: 0, change: 0, color: 'violet',  format: 'number',   metricKey: 'leads', sparkData: [] },
    { label: 'CPL',             value: 0, change: 0, color: 'amber',   format: 'currency', sparkData: [] },
  ],
  performanceSummary: [],
  spendByPeriod: [],
};

const SaniTredMarketing = () => {
  const mkt = useMarketingData('sanitred', ZERO_FALLBACK);

  return (
    <MarketingDashboardTemplate
      title="Sani-Tred Marketing Campaign"
      subtitle="Sani-Tred Retail — live data from Meta Ads & Google Ads"
      accentColor="#10B981"
      hasLiveData={mkt.hasLiveData}
      dataWarning={mkt.dataWarning}
      pageInsights={(() => {
        const spend = mkt.scorecards?.find(c => c.metricKey === 'spend')?.value || mkt.scorecards?.[0]?.value || 0;
        const leads = mkt.scorecards?.find(c => c.metricKey === 'leads')?.value || 0;
        if (!mkt.hasLiveData || spend === 0) return [
          'Sani-Tred uses Google Ads only (CID 2823564937) — no Meta campaigns.',
          'Run Google Ads pipeline to see spend and conversion data.',
        ];
        const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${Number(v).toFixed(2)}`;
        return [
          `Sani-Tred Google Ads spend: ${fmt(spend)}.`,
          leads > 0 ? `${leads.toLocaleString()} conversions tracked.` : 'No conversions in this period.',
        ];
      })()}
      scorecards={mkt.scorecards}
      performanceSummary={mkt.performanceSummary}
      spendVsRevenue={[]}
      funnelData={[]}
      spendByPeriod={mkt.spendByPeriod}
      ctrData={[]}
      metricsPerPeriod={{}}
    />
  );
};

export default SaniTredMarketing;
