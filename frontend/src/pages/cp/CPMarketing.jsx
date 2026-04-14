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
      pageInsights={(() => {
        const spend = mkt.scorecards?.find(c => c.metricKey === 'spend')?.value || mkt.scorecards?.[0]?.value || 0;
        const leads = mkt.scorecards?.find(c => c.metricKey === 'leads')?.value || 0;
        if (!mkt.hasLiveData || spend === 0) return [
          'CP marketing data limited to Meta training account (act_144305066).',
          'Run Meta Ads pipeline to see spend and lead metrics.',
        ];
        const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${Number(v).toFixed(2)}`;
        return [
          `CP marketing spend: ${fmt(spend)} (Meta only — no Google Ads for CP).`,
          leads > 0 ? `${leads.toLocaleString()} leads generated from training campaigns.` : null,
        ].filter(Boolean);
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

export default CPMarketing;
