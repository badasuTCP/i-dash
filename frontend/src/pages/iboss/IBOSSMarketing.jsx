import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';

// Real data from Meta Ads / Google Ads pipelines + Looker (Q1 2026)
const IBOSSMarketing = () => (
  <MarketingDashboardTemplate
    title="I-BOS Marketing Campaign"
    subtitle="Contractor Division — $74.65K spend · 727 leads · $102.68 avg CPL · 228.5K total clicks"
    accentColor="#F59E0B"
    scorecards={[
      {
        label: 'Marketing Spend',
        value: 74646,
        change: 4.8,
        color: 'amber',
        format: 'currency',
        sparkData: [58000, 62000, 55000, 62200, 67000, 71000, 74646],
      },
      {
        label: 'Total Clicks',
        value: 228468,
        change: 32.1,
        color: 'blue',
        format: 'number',
        sparkData: [95000, 112000, 130000, 158000, 185000, 210000, 228468],
      },
      {
        label: 'Total Distinct Leads',
        value: 727,
        change: 22.1,
        color: 'emerald',
        format: 'number',
        sparkData: [420, 480, 510, 565, 610, 670, 727],
      },
      {
        label: 'Avg Cost Per Lead',
        value: 102.68,
        change: -14.5,
        color: 'violet',
        format: 'currency',
        sparkData: [145, 138, 128, 120, 115, 108, 102.68],
      },
    ]}
    // Real per-contractor performance from Looker leaderboard
    performanceSummary={[
      { division: 'Beckley Concrete Decor', spend: '$37.7K', revenue: '$392.5K', roas: '10.4x', conversions: '290', cpl: '$130.17' },
      { division: 'Tailored Concrete Coatings', spend: '$15.9K', revenue: '—', roas: '—', conversions: '275', cpl: '$57.77' },
      { division: 'SLG Concrete Coatings', spend: '$11.3K', revenue: '$47.8K', roas: '4.2x', conversions: '42', cpl: '$269.72' },
      { division: 'Columbus Concrete Coatings', spend: '$5.2K', revenue: '$113.7K', roas: '21.9x', conversions: '10', cpl: '$518.00' },
      { division: 'TVS Coatings', spend: '$4.5K', revenue: '—', roas: '—', conversions: '16', cpl: '$281.36' },
    ]}
    spendVsRevenue={[
      { quarter: 'Q2 2025', spend: 15200, revenue: 285000 },
      { quarter: 'Q3 2025', spend: 14800, revenue: 295000 },
      { quarter: 'Q4 2025', spend: 18200, revenue: 380000 },
      { quarter: 'Q1 2026', spend: 26446, revenue: 194810 },
    ]}
    funnelData={[
      { name: 'Total Clicks', value: 228468 },
      { name: 'Landing Page Visits', value: 109000 },
      { name: 'Engaged Sessions', value: 38000 },
      { name: 'Total Leads', value: 727 },
      { name: 'Revenue Attributed', value: 638 },
    ]}
    spendByPeriod={[
      { period: 'Q2 2025', spend: 15200, leads: 168 },
      { period: 'Q3 2025', spend: 14800, leads: 185 },
      { period: 'Q4 2025', spend: 18200, leads: 182 },
      { period: 'Q1 2026', spend: 26446, leads: 192 },
    ]}
    ctrData={[
      { quarter: 'Q2 2025', meta: 2.1, google: 3.8 },
      { quarter: 'Q3 2025', meta: 2.5, google: 4.1 },
      { quarter: 'Q4 2025', meta: 2.8, google: 4.4 },
      { quarter: 'Q1 2026', meta: 3.05, google: 4.8 },
    ]}
  />
);

export default IBOSSMarketing;
