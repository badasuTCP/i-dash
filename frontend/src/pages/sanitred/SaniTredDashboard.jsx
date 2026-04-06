import React from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';

// Per-month metrics for seamless scorecard filtering
const METRICS_PER_PERIOD = {
  'Jul 2024': { revenue: 310000, orders: 920,  aov: 337, returnRate: 4.8 },
  'Aug 2024': { revenue: 325000, orders: 960,  aov: 339, returnRate: 4.5 },
  'Sep 2024': { revenue: 340000, orders: 990,  aov: 344, returnRate: 4.2 },
  'Oct 2024': { revenue: 365000, orders: 1050, aov: 348, returnRate: 4.0 },
  'Nov 2024': { revenue: 380000, orders: 1100, aov: 345, returnRate: 3.8 },
  'Dec 2024': { revenue: 420000, orders: 1230, aov: 341, returnRate: 3.5 },
  'Jan 2025': { revenue: 345000, orders: 975,  aov: 354, returnRate: 3.4 },
  'Feb 2025': { revenue: 360000, orders: 1010, aov: 356, returnRate: 3.3 },
  'Mar 2025': { revenue: 395000, orders: 1060, aov: 373, returnRate: 3.2 },
};

const SaniTredDashboard = () => (
  <DivisionDashboard
    title="Sani-Tred Dashboard"
    dataWarning="Sani-Tred retail pipeline not yet connected. Product sales, orders, and AOV shown are estimates — connect Sani-Tred store data to get real figures."
    subtitle="Sani-Tred Retail Outlet — Sales and product performance"
    accentColor="#10B981"
    pageInsights={[
      'Return rate fell from 4.8% → 3.2% over 9 months — product quality improvements showing',
      'Dec 2024 strongest month: $420K revenue, 1,230 orders — seasonal peak confirmed',
      'AOV trending up to $373 in Mar 2025 — higher-value bundles gaining traction',
    ]}
    scorecards={[
      { label: 'Retail Revenue',   value: 2070000, change: 11.2,  color: 'emerald', format: 'currency', metricKey: 'revenue',    sparkData: [1650000, 1720000, 1790000, 1860000, 1930000, 2000000, 2070000], lastSynced: '2026-03-02T00:00:00Z', source: 'Google Sheets (est.)', forecast: 2200000 },
      { label: 'Orders',           value: 4280,    change: 15.6,  color: 'blue',    format: 'number',   metricKey: 'orders',     sparkData: [3200, 3400, 3550, 3700, 3900, 4100, 4280],                     lastSynced: '2026-03-02T00:00:00Z', source: 'Google Sheets (est.)' },
      { label: 'Avg Order Value',  value: 483,     change: 6.8,   color: 'violet',  format: 'currency', metricKey: 'aov',        sparkData: [420, 435, 445, 455, 465, 475, 483],                            lastSynced: '2026-03-02T00:00:00Z', source: 'Google Sheets (est.)' },
      { label: 'Return Rate',      value: 3.2,     change: -18.4, color: 'amber',   format: 'percent',  metricKey: 'returnRate', sparkData: [5.2, 4.8, 4.4, 4.0, 3.6, 3.4, 3.2],                           lastSynced: '2026-03-02T00:00:00Z', source: 'Google Sheets (est.)' },
    ]}
    revenueData={[
      { month: 'Jul 2024', revenue: 310000, target: 300000 },
      { month: 'Aug 2024', revenue: 325000, target: 310000 },
      { month: 'Sep 2024', revenue: 340000, target: 320000 },
      { month: 'Oct 2024', revenue: 365000, target: 330000 },
      { month: 'Nov 2024', revenue: 380000, target: 340000 },
      { month: 'Dec 2024', revenue: 420000, target: 350000 },
      { month: 'Jan 2025', revenue: 345000, target: 360000 },
      { month: 'Feb 2025', revenue: 360000, target: 370000 },
      { month: 'Mar 2025', revenue: 395000, target: 380000 },
    ]}
    salesByCategory={[
      { name: 'Waterproofing Products', value: 35, color: '#10B981' },
      { name: 'Sealants & Coatings',    value: 28, color: '#3B82F6' },
      { name: 'Repair Kits',            value: 20, color: '#8B5CF6' },
      { name: 'Accessories',            value: 12, color: '#F59E0B' },
      { name: 'Bundles',                value: 5,  color: '#EF4444' },
    ]}
    topProducts={[
      { name: 'Sani-Tred PermaFlex',      revenue: 480000 },
      { name: 'TAV Liquid Rubber',         revenue: 380000 },
      { name: 'PermaSeal Coating',         revenue: 310000 },
      { name: 'Basement Waterproof Kit',   revenue: 250000 },
      { name: 'PermaFlex Primer',          revenue: 180000 },
      { name: 'Crack Repair System',       revenue: 145000 },
    ]}
    metricsPerPeriod={METRICS_PER_PERIOD}
    quarterlyData={[
      { metric: 'Revenue',           q1: '$420K', q2: '$485K', q3: '$510K', q4: '$560K', q1_25: '$490K' },
      { metric: 'Orders',            q1: '920',   q2: '1050',  q3: '1080',  q4: '1230',  q1_25: '1020'  },
      { metric: 'Avg Order Value',   q1: '$456',  q2: '$462',  q3: '$472',  q4: '$455',  q1_25: '$480'  },
      { metric: 'Repeat Customers',  q1: '28%',   q2: '30%',   q3: '32%',   q4: '34%',   q1_25: '33%'   },
      { metric: 'Return Rate',       q1: '4.8%',  q2: '4.2%',  q3: '3.8%',  q4: '3.4%',  q1_25: '3.2%'  },
    ]}
  />
);

export default SaniTredDashboard;
