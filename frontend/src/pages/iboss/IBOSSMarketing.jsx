import React, { useMemo } from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useMarketingData } from '../../hooks/useMarketingData';

const fmtC = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${Number(v).toFixed(2)}`;
const fmtN = (v) => Number(v).toLocaleString();

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
      pageInsights={(() => {
        const s = scorecards || [];
        const spend = s.find(c => c.metricKey === 'spend')?.value || s[0]?.value || 0;
        const leads = s.find(c => c.metricKey === 'leads')?.value || s[2]?.value || 0;
        const cpl = s.find(c => c.metricKey === 'cpl')?.value || s[3]?.value || 0;
        if (!hasLiveData || spend === 0) return [
          'Run Meta Ads and Google Ads pipelines to populate live campaign data.',
          'Per-contractor spend, ROAS, and CPL will appear once the pipelines complete.',
        ];
        return [
          `Total I-BOS marketing spend: ${fmtC(spend)} across all contractor campaigns.`,
          leads > 0 ? `${fmtN(leads)} leads generated · CPL ${fmtC(cpl)}.` : null,
          filteredPerformance.length > 0 ? `${filteredPerformance.length} contractors with active campaigns.` : null,
        ].filter(Boolean);
      })()}
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
