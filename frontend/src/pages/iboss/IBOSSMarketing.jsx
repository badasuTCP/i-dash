import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';

const IBOSSMarketing = () => (
  <MarketingDashboardTemplate
    title="I-BOS Marketing Campaign"
    subtitle="I-BOS Contractor Division - Lead generation and ad performance"
    accentColor="#F59E0B"
    scorecards={[
      { label: 'Marketing Spend', value: 66500, change: -2.1, color: 'amber', format: 'currency', sparkData: [72000, 70500, 69200, 68000, 67200, 66800, 66500] },
      { label: 'Impressions', value: 3800000, change: 24.5, color: 'blue', format: 'number', sparkData: [2400000, 2700000, 3000000, 3200000, 3400000, 3600000, 3800000] },
      { label: 'Contractor Leads', value: 212, change: 22.4, color: 'emerald', format: 'number', sparkData: [135, 148, 162, 175, 188, 200, 212] },
      { label: 'CPL', value: 105.80, change: -15.2, color: 'violet', format: 'currency', sparkData: [142, 135, 128, 122, 116, 110, 105.80] },
    ]}
    performanceSummary={[
      { division: 'Google Search', spend: '$28.5K', revenue: '$620K', roas: '4.5x', conversions: '95', cpl: '$92.40' },
      { division: 'Meta Ads', spend: '$22.0K', revenue: '$380K', roas: '3.8x', conversions: '72', cpl: '$108.50' },
      { division: 'Google Display', spend: '$10.5K', revenue: '$155K', roas: '3.2x', conversions: '32', cpl: '$125.80' },
      { division: 'YouTube', spend: '$5.5K', revenue: '$85K', roas: '3.0x', conversions: '13', cpl: '$142.20' },
    ]}
    spendVsRevenue={[
      { quarter: 'Q1 2024', spend: 15200, revenue: 680000 },
      { quarter: 'Q2 2024', spend: 16800, revenue: 720000 },
      { quarter: 'Q3 2024', spend: 16200, revenue: 810000 },
      { quarter: 'Q4 2024', spend: 18300, revenue: 890000 },
      { quarter: 'Q1 2025', spend: 16500, revenue: 780000 },
    ]}
    funnelData={[
      { name: 'Impressions', value: 3800000 },
      { name: 'Clicks', value: 142000 },
      { name: 'Landing Page Visits', value: 52000 },
      { name: 'Contractor Leads', value: 212 },
      { name: 'Signed Contractors', value: 95 },
    ]}
    spendByPeriod={[
      { period: 'Jul', spend: 5200, leads: 18 },
      { period: 'Aug', spend: 5600, leads: 20 },
      { period: 'Sep', spend: 5800, leads: 22 },
      { period: 'Oct', spend: 6500, leads: 28 },
      { period: 'Nov', spend: 6200, leads: 26 },
      { period: 'Dec', spend: 6800, leads: 30 },
      { period: 'Jan', spend: 5400, leads: 22 },
      { period: 'Feb', spend: 5800, leads: 24 },
      { period: 'Mar', spend: 6300, leads: 28 },
    ]}
    ctrData={[
      { quarter: 'Q1 2024', meta: 2.5, google: 4.8 },
      { quarter: 'Q2 2024', meta: 2.8, google: 5.0 },
      { quarter: 'Q3 2024', meta: 3.0, google: 5.2 },
      { quarter: 'Q4 2024', meta: 3.2, google: 5.5 },
      { quarter: 'Q1 2025', meta: 3.1, google: 5.3 },
    ]}
  />
);

export default IBOSSMarketing;
