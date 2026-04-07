import React, { useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';

// ── Static fallback data (shown when GA4 pipeline hasn't run yet) ────────────
const STATIC_METRICS_PER_PERIOD = {
  'Jul 2024': { visits: 4800, returning: 720 },
  'Aug 2024': { visits: 5100, returning: 780 },
  'Sep 2024': { visits: 5400, returning: 840 },
  'Oct 2024': { visits: 5800, returning: 900 },
  'Nov 2024': { visits: 5600, returning: 870 },
  'Dec 2024': { visits: 6200, returning: 980 },
  'Jan 2025': { visits: 5200, returning: 820 },
  'Feb 2025': { visits: 5500, returning: 860 },
  'Mar 2025': { visits: 5900, returning: 950 },
};

const STATIC_FALLBACK = {
  scorecards: [
    { label: 'Total Visits',       value: 38500, change: 16.2, color: 'emerald', format: 'number',  metricKey: 'visits',    sparkData: [28000, 30000, 32000, 33500, 35000, 37000, 38500] },
    { label: 'Returning Visitors', value: 5800,  change: 11.4, color: 'violet',  format: 'number',  metricKey: 'returning', sparkData: [4200, 4500, 4800, 5000, 5300, 5600, 5800] },
    { label: 'Bounce Rate',        value: 48.5,  change: -3.8, color: 'blue',    format: 'percent', sparkData: [54, 53, 52, 51, 50, 49, 48.5] },
    { label: 'Avg Session',        value: 2.82,  change: 9.5,  color: 'amber',   format: 'decimal', sparkData: [2.3, 2.4, 2.5, 2.6, 2.7, 2.75, 2.82] },
  ],
  visitorTrend: [
    { month: 'Jul 2024', visits: 4800, returning: 720 },
    { month: 'Aug 2024', visits: 5100, returning: 780 },
    { month: 'Sep 2024', visits: 5400, returning: 840 },
    { month: 'Oct 2024', visits: 5800, returning: 900 },
    { month: 'Nov 2024', visits: 5600, returning: 870 },
    { month: 'Dec 2024', visits: 6200, returning: 980 },
    { month: 'Jan 2025', visits: 5200, returning: 820 },
    { month: 'Feb 2025', visits: 5500, returning: 860 },
    { month: 'Mar 2025', visits: 5900, returning: 950 },
  ],
  trafficSources: [
    { source: 'google / organic',  users: 14200, sessions: 18500, bounceRate: '44.2%', avgDuration: '2:58' },
    { source: 'google / cpc',      users: 8500,  sessions: 10800, bounceRate: '48.5%', avgDuration: '2:32' },
    { source: 'direct / (none)',   users: 6200,  sessions: 7800,  bounceRate: '38.1%', avgDuration: '3:25' },
    { source: 'facebook / social', users: 4100,  sessions: 5200,  bounceRate: '55.4%', avgDuration: '2:08' },
    { source: 'youtube / referral',users: 2800,  sessions: 3400,  bounceRate: '42.3%', avgDuration: '3:45' },
    { source: 'email / newsletter',users: 1800,  sessions: 2200,  bounceRate: '32.1%', avgDuration: '4:12' },
  ],
  deviceData: [
    { device: 'Desktop', users: 18200 },
    { device: 'Mobile',  users: 16500 },
    { device: 'Tablet',  users: 3800  },
  ],
  metricsPerPeriod: STATIC_METRICS_PER_PERIOD,
};

const SaniTredWebAnalytics = () => {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  const ga4 = useWebAnalytics('sanitred', STATIC_FALLBACK, dateFrom, dateTo);

  const handleDateChange = (start, end) => {
    setDateFrom(start);
    setDateTo(end);
  };

  return (
    <WebAnalyticsDashboard
      title="Sani-Tred Web Analytics"
      dataWarning="GA4 not yet connected for Sani-Tred. Traffic sources, device data, and session metrics shown are estimates — connect Google Analytics for real data."
      subtitle="Sani-Tred Retail — Website traffic and eCommerce engagement"
      accentColor="#10B981"
      hasLiveData={ga4.hasLiveData}
      loading={ga4.loading}
      onDateChange={handleDateChange}
      pageInsights={[
        'Organic search is top acquisition channel — 37% of users, lowest bounce rate of paid sources',
        'Email newsletter highest engagement: 32% bounce, 4:12 avg session — high-intent audience',
        'Dec 2024 traffic peak (6.2K visits) aligns with revenue peak — seasonal SEO opportunity',
      ]}
      scorecards={ga4.scorecards}
      visitorTrend={ga4.visitorTrend}
      websiteBreakdown={[
        { name: 'Sani-Tred Main Store', value: 22000, color: '#10B981' },
        { name: 'DIY Solutions',        value: 8500,  color: '#3B82F6' },
        { name: 'Product Reviews',      value: 5200,  color: '#8B5CF6' },
        { name: 'Knowledge Base',       value: 2800,  color: '#F59E0B' },
      ]}
      deviceData={ga4.deviceData}
      trafficSources={ga4.trafficSources}
      metricsPerPeriod={ga4.metricsPerPeriod}
    />
  );
};

export default SaniTredWebAnalytics;
