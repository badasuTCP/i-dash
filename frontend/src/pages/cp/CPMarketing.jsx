import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';
import { useMarketingData } from '../../hooks/useMarketingData';

// Zero-fallback: $0.00 / empty state when no 2026 live data exists
const ZERO_FALLBACK = {
  scorecards: [
    { label: 'Marketing Spend',    value: 0, change: 0, color: 'violet',  format: 'currency', metricKey: 'spend', sparkData: [] },
    { label: 'Total Impressions',  value: 0, change: 0, color: 'blue',    format: 'number',   sparkData: [] },
    { label: 'Total Leads',        value: 0, change: 0, color: 'emerald', format: 'number',   metricKey: 'leads', sparkData: [] },
    { label: 'Cost Per Lead',      value: 0, change: 0, color: 'amber',   format: 'currency', sparkData: [] },
  ],
  performanceSummary: [],
  spendByPeriod: [],
};

const CPMarketing = () => {
  const mkt = useMarketingData('cp', ZERO_FALLBACK);

  return (
    <MarketingDashboardTemplate
      title="CP Marketing Campaign"
      subtitle="The Concrete Protector — live data from Meta Ads & Google Ads"
      accentColor="#3B82F6"
      hasLiveData={mkt.hasLiveData}
      dataWarning={mkt.dataWarning}
      pageInsights={[
        'Connect CP ad accounts to see real spend, ROAS, and lead data',
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

export default CPMarketing;
