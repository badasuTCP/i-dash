import React from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';

const CPMarketing = () => (
  <MarketingDashboardTemplate
    title="CP Marketing Campaign"
    subtitle="The Concrete Protector - Ad spend, ROAS, and campaign performance"
    accentColor="#3B82F6"
    scorecards={[
      { label: 'Marketing Spend', value: 237220, change: -5.3, color: 'violet', format: 'currency', sparkData: [252000, 248000, 245000, 242000, 240000, 238000, 237220] },
      { label: 'Total Impressions', value: 12500000, change: 22.8, color: 'blue', format: 'number', sparkData: [8200000, 9100000, 9800000, 10500000, 11200000, 11900000, 12500000] },
      { label: 'Total Leads', value: 677, change: 18.5, color: 'emerald', format: 'number', sparkData: [420, 480, 520, 560, 610, 645, 677] },
      { label: 'Cost Per Lead', value: 106.72, change: -12.3, color: 'amber', format: 'currency', sparkData: [135, 128, 122, 118, 114, 110, 106.72] },
    ]}
    performanceSummary={[
      { division: 'CP (Main)', spend: '$98.5K', revenue: '$1.82M', roas: '3.8x', conversions: '285', cpl: '$92.40' },
      { division: 'Sani-Tred (Retail)', spend: '$72.2K', revenue: '$920K', roas: '3.2x', conversions: '180', cpl: '$118.50' },
      { division: 'I-BOS (Contractor)', spend: '$66.5K', revenue: '$1.24M', roas: '4.1x', conversions: '212', cpl: '$105.80' },
    ]}
    spendVsRevenue={[
      { quarter: 'Q1 2024', spend: 58000, revenue: 1820000 },
      { quarter: 'Q2 2024', spend: 62000, revenue: 2050000 },
      { quarter: 'Q3 2024', spend: 55000, revenue: 2180000 },
      { quarter: 'Q4 2024', spend: 62220, revenue: 2430000 },
      { quarter: 'Q1 2025', spend: 57000, revenue: 2120000 },
    ]}
    funnelData={[
      { name: 'Impressions', value: 12500000 },
      { name: 'Clicks', value: 385000 },
      { name: 'Landing Page Visits', value: 142000 },
      { name: 'Leads', value: 677 },
      { name: 'Conversions', value: 285 },
    ]}
    spendByPeriod={[
      { period: 'Jul', spend: 18500, leads: 52 },
      { period: 'Aug', spend: 19200, leads: 58 },
      { period: 'Sep', spend: 17800, leads: 55 },
      { period: 'Oct', spend: 21500, leads: 68 },
      { period: 'Nov', spend: 20800, leads: 72 },
      { period: 'Dec', spend: 22500, leads: 78 },
      { period: 'Jan', spend: 18200, leads: 62 },
      { period: 'Feb', spend: 19500, leads: 65 },
      { period: 'Mar', spend: 21200, leads: 74 },
    ]}
    ctrData={[
      { quarter: 'Q1 2024', meta: 3.2, google: 4.1 },
      { quarter: 'Q2 2024', meta: 3.5, google: 4.3 },
      { quarter: 'Q3 2024', meta: 3.8, google: 4.5 },
      { quarter: 'Q4 2024', meta: 4.1, google: 4.8 },
      { quarter: 'Q1 2025', meta: 3.9, google: 4.6 },
    ]}
  />
);

export default CPMarketing;
