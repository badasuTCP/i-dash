import React, { useMemo } from 'react';
import MarketingDashboardTemplate from '../templates/MarketingDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';

// ── Per-contractor name → ID mapping (for performanceSummary filtering) ──────
const CONTRACTOR_NAME_TO_ID = {
  'Beckley Concrete Decor':     'beckley',
  'Tailored Concrete Coatings': 'tailored',
  'SLG Concrete Coatings':      'slg',
  'Columbus Concrete Coatings': 'columbus',
  'TVS Coatings':               'tvs',
};

const ALL_PERFORMANCE_SUMMARY = [
  { division: 'Beckley Concrete Decor',    spend: '$37.7K', revenue: '$392.5K', roas: '10.4x', conversions: '290', cpl: '$130.17', contractorId: 'beckley' },
  { division: 'Tailored Concrete Coatings',spend: '$15.9K', revenue: '—',       roas: '—',     conversions: '275', cpl: '$57.77',  contractorId: 'tailored' },
  { division: 'SLG Concrete Coatings',     spend: '$11.3K', revenue: '$47.8K',  roas: '4.2x',  conversions: '42',  cpl: '$269.72', contractorId: 'slg' },
  { division: 'Columbus Concrete Coatings',spend: '$5.2K',  revenue: '$113.7K', roas: '21.9x', conversions: '10',  cpl: '$518.00', contractorId: 'columbus' },
  { division: 'TVS Coatings',              spend: '$4.5K',  revenue: '—',       roas: '—',     conversions: '16',  cpl: '$281.36', contractorId: 'tvs' },
];

// ── Per-period metrics for seamless scorecard filtering ──────────────────────
const METRICS_PER_PERIOD = {
  'Q2 2025': { spend: 15200,  leads: 168, cpl: 90.48  },
  'Q3 2025': { spend: 14800,  leads: 185, cpl: 80.00  },
  'Q4 2025': { spend: 18200,  leads: 182, cpl: 100.00 },
  'Q1 2026': { spend: 26446,  leads: 192, cpl: 137.74 },
};

const IBOSSMarketing = () => {
  const { isContractorActive } = useDashboardConfig();

  const performanceSummary = useMemo(
    () => ALL_PERFORMANCE_SUMMARY.filter((row) => isContractorActive(row.contractorId)),
    [isContractorActive]
  );

  return (
    <MarketingDashboardTemplate
      title="I-BOS Marketing Campaign"
      subtitle="Contractor Division — $74.65K spend · 727 leads · $102.68 avg CPL · 228.5K total clicks"
      accentColor="#F59E0B"
      pageInsights={[
        'Tailored achieves best CPL at $57.77 — efficiency benchmark for the division',
        'Columbus shows highest revenue value ($11.4K rev/lead) despite high CPL of $518',
        'Tailored & TVS missing revenue attribution — CRM handoff audit recommended',
      ]}
      scorecards={[
        { label: 'Marketing Spend',      value: 74646,   change: 4.8,   color: 'amber',   format: 'currency', metricKey: 'spend',  sparkData: [58000, 62000, 55000, 62200, 67000, 71000, 74646] },
        { label: 'Total Clicks',         value: 228468,  change: 32.1,  color: 'blue',    format: 'number',   sparkData: [95000, 112000, 130000, 158000, 185000, 210000, 228468] },
        { label: 'Total Distinct Leads', value: 727,     change: 22.1,  color: 'emerald', format: 'number',   metricKey: 'leads',  sparkData: [420, 480, 510, 565, 610, 670, 727] },
        { label: 'Avg Cost Per Lead',    value: 102.68,  change: -14.5, color: 'violet',  format: 'currency', metricKey: 'cpl',    sparkData: [145, 138, 128, 120, 115, 108, 102.68] },
      ]}
      performanceSummary={performanceSummary}
      spendVsRevenue={[
        { quarter: 'Q2 2025', spend: 15200, revenue: 285000 },
        { quarter: 'Q3 2025', spend: 14800, revenue: 295000 },
        { quarter: 'Q4 2025', spend: 18200, revenue: 380000 },
        { quarter: 'Q1 2026', spend: 26446, revenue: 194810 },
      ]}
      funnelData={[
        { name: 'Total Clicks',        value: 228468 },
        { name: 'Landing Page Visits', value: 109000 },
        { name: 'Engaged Sessions',    value: 38000  },
        { name: 'Total Leads',         value: 727    },
        { name: 'Revenue Attributed',  value: 638    },
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
      metricsPerPeriod={METRICS_PER_PERIOD}
    />
  );
};

export default IBOSSMarketing;
