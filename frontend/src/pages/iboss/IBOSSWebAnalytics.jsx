import React from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';

// Real data from GA4 pipelines (all I-BOS contractor properties combined) — Q1 2026
const IBOSSWebAnalytics = () => (
  <WebAnalyticsDashboard
    title="I-BOS Web Analytics"
    subtitle="All contractor websites combined — 109K visits · 86.3K visitors · 71.4K new · 14.9K returning"
    accentColor="#F59E0B"
    scorecards={[
      {
        label: 'Total Visits',
        value: 109000,
        change: 26.4,
        color: 'amber',
        format: 'number',
        sparkData: [52000, 62000, 72000, 82000, 92000, 100000, 109000],
      },
      {
        label: 'Total Visitors',
        value: 86300,
        change: 20.8,
        color: 'blue',
        format: 'number',
        sparkData: [42000, 50000, 58000, 66000, 74000, 80000, 86300],
      },
      {
        label: 'New Visitors',
        value: 71400,
        change: 24.1,
        color: 'emerald',
        format: 'number',
        sparkData: [34000, 41000, 48000, 55000, 62000, 67000, 71400],
      },
      {
        label: 'Returning Users',
        value: 14900,
        change: 8.5,
        color: 'violet',
        format: 'number',
        sparkData: [9500, 10500, 11500, 12500, 13200, 14000, 14900],
      },
    ]}
    visitorTrend={[
      { month: 'Q2 2025', visits: 22000, returning: 4800 },
      { month: 'Q3 2025', visits: 38000, returning: 7200 },
      { month: 'Q4 2025', visits: 58000, returning: 10500 },
      { month: 'Q1 2026', visits: 109000, returning: 14900 },
    ]}
    // Real website breakdown per contractor from Looker (GA4 rollup)
    websiteBreakdown={[
      { name: 'Columbus Concrete Coatings', value: 71800, color: '#8B5CF6' },
      { name: 'SLG Concrete Coatings', value: 10200, color: '#F59E0B' },
      { name: 'Dec. Concrete Idaho', value: 9500, color: '#0EA5E9' },
      { name: 'Floor Warriors', value: 7300, color: '#F97316' },
      { name: 'Tailored Concrete', value: 5400, color: '#10B981' },
      { name: 'Beckley Concrete Decor', value: 5300, color: '#3B82F6' },
      { name: 'Reeves Solutions', value: 1928, color: '#64748B' },
      { name: 'Graber Design', value: 85, color: '#7C3AED' },
      { name: 'Elite Pool Coatings', value: 21, color: '#2DD4BF' },
    ]}
    deviceData={[
      { device: 'Mobile', users: 391 },
      { device: 'Desktop', users: 224 },
      { device: 'Tablet', users: 36 },
    ]}
    // Real traffic sources from GA4 combined view
    trafficSources={[
      { source: 'google / organic', users: 36400, sessions: 45800, bounceRate: '38.2%', avgDuration: '2:18' },
      { source: 'google / cpc', users: 21600, sessions: 28200, bounceRate: '44.1%', avgDuration: '1:52' },
      { source: 'direct / (none)', users: 15800, sessions: 19400, bounceRate: '32.5%', avgDuration: '3:05' },
      { source: 'facebook / paid', users: 7200, sessions: 9100, bounceRate: '51.3%', avgDuration: '1:28' },
      { source: 'bing / organic', users: 2800, sessions: 3400, bounceRate: '42.8%', avgDuration: '1:45' },
      { source: 'referral / other', users: 2500, sessions: 3100, bounceRate: '36.2%', avgDuration: '2:42' },
    ]}
  />
);

export default IBOSSWebAnalytics;
