import React, { useMemo } from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useMarketingData } from '../../hooks/useMarketingData';

// Zero-fallback: show $0.00 / empty state when no 2026 live data exists
const ZERO_FALLBACK = {
  scorecards: [
    { label: 'Marketing Spend',      value: 0, change: 0, color: 'amber',   format: 'currency', metricKey: 'spend',  sparkData: [] },
    { label: 'Total Clicks',         value: 0, change: 0, color: 'blue',    format: 'number',                        sparkData: [] },
    { label: 'Total Distinct Leads', value: 0, change: 0, color: 'emerald', format: 'number',   metricKey: 'leads',  sparkData: [] },
    { label: 'Avg Cost Per Lead',    value: 0, change: 0, color: 'violet',  format: 'currency', metricKey: 'cpl',    sparkData: [] },
  ],
  performanceSummary: [],
  spendByPeriod: [],
};

const IBOSSMarketing = () => {
  const { isContractorActive } = useDashboardConfig();
  const { hasLiveData, scorecards, performanceSummary, spendByPeriod } = useMarketingData('ibos', ZERO_FALLBACK);

  const filteredPerformance = useMemo(
    () => performanceSummary.filter((row) =>
      row.contractorId ? isContractorActive(row.contractorId) : true
    ),
    [performanceSummary, isContractorActive],
  );

  return (
    <MarketingDashboardTemplate
      title="I-BOS Marketing Campaign"
      subtitle="Contractor Division — live data from Meta Ads & Google Ads"
      hasLiveData={hasLiveData}
      accentColor="#F59E0B"
      pageInsights={[
        'Connect Meta Ads and Google Ads pipelines to see live campaign performance',
        'Per-contractor spend, ROAS, and CPL will populate once the pipelines sync',
        'Date range selector in the Header filters all metrics automatically',
      ]}
      scorecards={scorecards}
      performanceSummary={filteredPerformance}
      spendVsRevenue={[]}
      funnelData={[]}
      spendByPeriod={spendByPeriod}
      ctrData={[]}
      metricsPerPeriod={{}}
    />
  );
};

export default IBOSSMarketing;
