import React, { useMemo } from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';

// ── Static source data (full set) ────────────────────────────────────────────
const ALL_SALES_BY_CATEGORY = [
  { name: 'Beckley (Concrete Trans.)', value: 34, color: '#3B82F6', contractorId: 'beckley' },
  { name: 'Eminence',                  value: 29, color: '#06B6D4', contractorId: 'eminence' },
  { name: 'PermaSurface',              value: 14, color: '#84CC16', contractorId: 'permasurface' },
  { name: 'Columbus Coatings',         value: 10, color: '#8B5CF6', contractorId: 'columbus' },
  { name: 'Diamond Topcoat',           value: 10, color: '#EC4899', contractorId: 'diamond' },
  { name: 'SLG',                       value:  4, color: '#F59E0B', contractorId: 'slg' },
];

const ALL_TOP_PRODUCTS = [
  { name: 'Beckley Concrete Decor',    revenue: 392470, contractorId: 'beckley' },
  { name: 'Eminence',                  revenue: 330770, contractorId: 'eminence' },
  { name: 'PermaSurface',              revenue: 156330, contractorId: 'permasurface' },
  { name: 'Columbus Concrete Coatings',revenue: 113720, contractorId: 'columbus' },
  { name: 'Diamond Topcoat',           revenue: 113730, contractorId: 'diamond' },
  { name: 'SLG Concrete Coatings',     revenue:  47790, contractorId: 'slg' },
];

// ── Per-period metrics for seamless scorecard filtering ──────────────────────
const METRICS_PER_PERIOD = {
  'Q2 2025': { revenue: 285000, spend: 15200, leads: 168, cpl: 90.48 },
  'Q3 2025': { revenue: 295000, spend: 14800, leads: 185, cpl: 80.00 },
  'Q4 2025': { revenue: 380000, spend: 18200, leads: 182, cpl: 100.00 },
  'Q1 2026': { revenue: 194810, spend: 26446, leads: 150, cpl: 102.68 },
};

const IBOSSDashboard = () => {
  const { isContractorActive } = useDashboardConfig();

  // Filter contractors based on admin config
  const salesByCategory = useMemo(() => {
    const filtered = ALL_SALES_BY_CATEGORY.filter((c) => isContractorActive(c.contractorId));
    const total = filtered.reduce((sum, c) => sum + c.value, 0);
    if (!total) return filtered;
    // Re-normalise percentages to 100%
    return filtered.map((c) => ({ ...c, value: Math.round((c.value / total) * 100) }));
  }, [isContractorActive]);

  const topProducts = useMemo(
    () => ALL_TOP_PRODUCTS.filter((c) => isContractorActive(c.contractorId)),
    [isContractorActive]
  );

  return (
    <DivisionDashboard
      title="I-BOS Dashboard"
      subtitle="I-BOS Contractor Division — 13 active contractors · Data as of Q1 2026"
      accentColor="#F59E0B"
      pageInsights={[
        'Beckley leads revenue at $392K TD · Eminence highest rev/lead at $110K (organic)',
        'CPL trending down to $102.68 — best I-BOS rate on record',
        '5 contractors on paid media · 8 organic-only · total reach 109K web visits',
      ]}
      scorecards={[
        { label: 'Revenue Generated TD', value: 1154810, change: 18.2, color: 'emerald', format: 'currency', metricKey: 'revenue', sparkData: [680000, 720000, 810000, 890000, 980000, 1080000, 1154810], lastSynced: '2026-03-31T00:00:00Z', source: 'Meta + Google Ads', forecast: 1300000 },
        { label: 'Total Marketing Spend', value: 74646, change: 4.8, color: 'amber', format: 'currency', metricKey: 'spend', sparkData: [58000, 62000, 55000, 62200, 67000, 71000, 74646], lastSynced: '2026-03-31T00:00:00Z', source: 'Meta + Google Ads', forecast: 80000 },
        { label: 'Total Distinct Leads', value: 727, change: 22.1, color: 'blue', format: 'number', metricKey: 'leads', sparkData: [420, 480, 510, 565, 610, 670, 727], lastSynced: '2026-03-31T00:00:00Z', source: 'Meta + Google Ads', forecast: 800 },
        { label: 'Avg Cost Per Lead', value: 102.68, change: -14.5, color: 'violet', format: 'currency', metricKey: 'cpl', sparkData: [145, 138, 128, 120, 115, 108, 102.68], lastSynced: '2026-03-31T00:00:00Z', source: 'Meta + Google Ads', forecast: 95 },
      ]}
      revenueData={[
        { month: 'Q2 2025', revenue: 285000, target: 260000 },
        { month: 'Q3 2025', revenue: 295000, target: 280000 },
        { month: 'Q4 2025', revenue: 380000, target: 320000 },
        { month: 'Q1 2026', revenue: 194810, target: 300000 },
      ]}
      salesByCategory={salesByCategory}
      topProducts={topProducts}
      metricsPerPeriod={METRICS_PER_PERIOD}
      quarterlyData={[
        { metric: 'Revenue',          q1: '$275K',  q2: '$285K',  q3: '$295K',  q4: '$380K',  q1_25: '$194.8K' },
        { metric: 'Total Leads',      q1: '142',    q2: '168',    q3: '185',    q4: '182',    q1_25: '150' },
        { metric: 'Marketing Spend',  q1: '$58K',   q2: '$62K',   q3: '$55K',   q4: '$62.2K', q1_25: '$74.6K' },
        { metric: 'Avg CPL',          q1: '$142',   q2: '$91',    q3: '$80',    q4: '$100',   q1_25: '$102.68' },
        { metric: 'Total Clicks',     q1: '45K',    q2: '52K',    q3: '60K',    q4: '71K',    q1_25: '228.5K' },
        { metric: 'Total Web Visits', q1: '22K',    q2: '38K',    q3: '45K',    q4: '58K',    q1_25: '109K' },
      ]}
    />
  );
};

export default IBOSSDashboard;
