import React, { useMemo } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';

// ── Contractor name → ID mapping (must match IBOSContractors IDs) ─────────────
const ALL_WEBSITE_BREAKDOWN = [
  { name: 'Columbus Concrete Coatings', value: 71800, color: '#8B5CF6', contractorId: 'columbus' },
  { name: 'SLG Concrete Coatings',      value: 10200, color: '#F59E0B', contractorId: 'slg' },
  { name: 'Dec. Concrete Idaho',         value: 9500,  color: '#0EA5E9', contractorId: 'decorative' },
  { name: 'Floor Warriors',             value: 7300,  color: '#F97316', contractorId: 'floorwarriors' },
  { name: 'Tailored Concrete',          value: 5400,  color: '#10B981', contractorId: 'tailored' },
  { name: 'Beckley Concrete Decor',     value: 5300,  color: '#3B82F6', contractorId: 'beckley' },
  { name: 'Reeves Solutions',           value: 1928,  color: '#64748B', contractorId: 'reeves' },
  { name: 'Graber Design',              value: 85,    color: '#7C3AED', contractorId: 'graber' },
  { name: 'Elite Pool Coatings',        value: 21,    color: '#2DD4BF', contractorId: 'elitepool' },
];

// ── Per-period metrics for seamless scorecard filtering ──────────────────────
const METRICS_PER_PERIOD = {
  'Q2 2025': { visits: 22000,  visitors: 17400, newVisitors: 12600, returning: 4800  },
  'Q3 2025': { visits: 38000,  visitors: 30100, newVisitors: 22900, returning: 7200  },
  'Q4 2025': { visits: 58000,  visitors: 45900, newVisitors: 35400, returning: 10500 },
  'Q1 2026': { visits: 109000, visitors: 86300, newVisitors: 71400, returning: 14900 },
};

const IBOSSWebAnalytics = () => {
  const { isContractorActive } = useDashboardConfig();

  const websiteBreakdown = useMemo(
    () => ALL_WEBSITE_BREAKDOWN.filter((item) => isContractorActive(item.contractorId)),
    [isContractorActive]
  );

  return (
    <WebAnalyticsDashboard
      title="I-BOS Web Analytics"
      subtitle="All contractor websites combined — 109K visits · 86.3K visitors · 71.4K new · 14.9K returning"
      accentColor="#F59E0B"
      pageInsights={[
        'Columbus dominates traffic at 71.8K visits — 66% of total I-BOS web traffic',
        'Organic beats paid on avg engagement time (2:18 vs 1:52) — content quality drives stay',
        'Graber & Elite Pool are early-stage — very low traffic, monitor for growth signals',
      ]}
      scorecards={[
        { label: 'Total Visits',      value: 109000, change: 26.4, color: 'amber',   format: 'number', metricKey: 'visits',      sparkData: [52000, 62000, 72000, 82000, 92000, 100000, 109000] },
        { label: 'Total Visitors',    value: 86300,  change: 20.8, color: 'blue',    format: 'number', metricKey: 'visitors',    sparkData: [42000, 50000, 58000, 66000, 74000, 80000, 86300] },
        { label: 'New Visitors',      value: 71400,  change: 24.1, color: 'emerald', format: 'number', metricKey: 'newVisitors', sparkData: [34000, 41000, 48000, 55000, 62000, 67000, 71400] },
        { label: 'Returning Users',   value: 14900,  change: 8.5,  color: 'violet',  format: 'number', metricKey: 'returning',   sparkData: [9500, 10500, 11500, 12500, 13200, 14000, 14900] },
      ]}
      visitorTrend={[
        { month: 'Q2 2025', visits: 22000,  returning: 4800  },
        { month: 'Q3 2025', visits: 38000,  returning: 7200  },
        { month: 'Q4 2025', visits: 58000,  returning: 10500 },
        { month: 'Q1 2026', visits: 109000, returning: 14900 },
      ]}
      websiteBreakdown={websiteBreakdown}
      deviceData={[
        { device: 'Mobile',  users: 391 },
        { device: 'Desktop', users: 224 },
        { device: 'Tablet',  users: 36  },
      ]}
      trafficSources={[
        { source: 'google / organic', users: 36400, sessions: 45800, bounceRate: '38.2%', avgDuration: '2:18' },
        { source: 'google / cpc',     users: 21600, sessions: 28200, bounceRate: '44.1%', avgDuration: '1:52' },
        { source: 'direct / (none)',  users: 15800, sessions: 19400, bounceRate: '32.5%', avgDuration: '3:05' },
        { source: 'facebook / paid',  users: 7200,  sessions: 9100,  bounceRate: '51.3%', avgDuration: '1:28' },
        { source: 'bing / organic',   users: 2800,  sessions: 3400,  bounceRate: '42.8%', avgDuration: '1:45' },
        { source: 'referral / other', users: 2500,  sessions: 3100,  bounceRate: '36.2%', avgDuration: '2:42' },
      ]}
      metricsPerPeriod={METRICS_PER_PERIOD}
    />
  );
};

export default IBOSSWebAnalytics;
