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
      pageInsights={[
        'Connect Sani-Tred ad accounts to see real spend, ROAS, and lead data',
        'Date range selector in the Header filters all metrics automatically',
        'Performance summary populates once Meta and Google Ads pipelines sync',
      ]}
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
