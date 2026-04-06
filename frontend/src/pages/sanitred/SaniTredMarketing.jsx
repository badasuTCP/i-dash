import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';

// Per-quarter metrics for seamless scorecard filtering
const METRICS_PER_PERIOD = {
  'Q1 2024': { spend: 16800, leads: 38,  cpl: 442 },
  'Q2 2024': { spend: 18500, leads: 42,  cpl: 440 },
  'Q3 2024': { spend: 17200, leads: 39,  cpl: 441 },
  'Q4 2024': { spend: 19700, leads: 44,  cpl: 448 },
  'Q1 2025': { spend: 17500, leads: 40,  cpl: 438 },
};

const SaniTredMarketing = () => (
  <MarketingDashboardTemplate
    title="Sani-Tred Marketing Campaign"
    subtitle="Sani-Tred Retail — Ad performance and campaign ROI"
    accentColor="#10B981"
    pageInsights={[
      'Meta outperforms Google on ROAS (3.4x vs 3.1x) — consider shifting budget allocation',
      'YouTube Ads show lowest ROAS (2.8x) but highest awareness value — reassess funnel role',
      'Spend efficiency steady: Q3 2024 best CPL period · Dec 2024 peak leads at 25',
    ]}
    scorecards={[
      { label: 'Marketing Spend', value: 72200,   change: -3.8, color: 'emerald', format: 'currency', metricKey: 'spend', sparkData: [78000, 76500, 75200, 74000, 73200, 72800, 72200] },
      { label: 'Impressions',     value: 4200000, change: 18.4, color: 'blue',    format: 'number',   sparkData: [2800000, 3100000, 3400000, 3600000, 3800000, 4000000, 4200000] },
      { label: 'Leads',           value: 180,     change: 14.2, color: 'violet',  format: 'number',   metricKey: 'leads', sparkData: [120, 130, 140, 150, 160, 170, 180] },
      { label: 'CPL',             value: 118.50,  change: -8.6, color: 'amber',   format: 'currency', sparkData: [142, 138, 132, 128, 124, 121, 118.50] },
    ]}
    performanceSummary={[
      { division: 'Meta Ads',    spend: '$32.4K', revenue: '$420K', roas: '3.4x', conversions: '82', cpl: '$108.20' },
      { division: 'Google Ads',  spend: '$28.8K', revenue: '$380K', roas: '3.1x', conversions: '68', cpl: '$125.40' },
      { division: 'YouTube Ads', spend: '$11.0K', revenue: '$120K', roas: '2.8x', conversions: '30', cpl: '$132.50' },
    ]}
    spendVsRevenue={[
      { quarter: 'Q1 2024', spend: 16800, revenue: 420000 },
      { quarter: 'Q2 2024', spend: 18500, revenue: 485000 },
      { quarter: 'Q3 2024', spend: 17200, revenue: 510000 },
      { quarter: 'Q4 2024', spend: 19700, revenue: 560000 },
      { quarter: 'Q1 2025', spend: 17500, revenue: 490000 },
    ]}
    funnelData={[
      { name: 'Impressions',         value: 4200000 },
      { name: 'Clicks',              value: 126000  },
      { name: 'Landing Page Visits', value: 48000   },
      { name: 'Leads',               value: 180     },
      { name: 'Purchases',           value: 82      },
    ]}
    spendByPeriod={[
      { period: 'Jul 2024', spend: 5800, leads: 14 },
      { period: 'Aug 2024', spend: 6200, leads: 16 },
      { period: 'Sep 2024', spend: 5400, leads: 15 },
      { period: 'Oct 2024', spend: 7100, leads: 22 },
      { period: 'Nov 2024', spend: 6800, leads: 20 },
      { period: 'Dec 2024', spend: 7500, leads: 25 },
      { period: 'Jan 2025', spend: 5500, leads: 18 },
      { period: 'Feb 2025', spend: 6100, leads: 19 },
      { period: 'Mar 2025', spend: 6800, leads: 22 },
    ]}
    ctrData={[
      { quarter: 'Q1 2024', meta: 2.8, google: 3.5 },
      { quarter: 'Q2 2024', meta: 3.0, google: 3.7 },
      { quarter: 'Q3 2024', meta: 3.2, google: 3.9 },
      { quarter: 'Q4 2024', meta: 3.5, google: 4.2 },
      { quarter: 'Q1 2025', meta: 3.3, google: 4.0 },
    ]}
    metricsPerPeriod={METRICS_PER_PERIOD}
  />
);

export default SaniTredMarketing;
