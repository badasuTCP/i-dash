import React from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';

const CPWebAnalytics = () => (
  <WebAnalyticsDashboard
    title="CP Web Analytics"
    subtitle="The Concrete Protector - Website traffic and user engagement"
    accentColor="#3B82F6"
    scorecards={[
      { label: 'Total Visits', value: 81700, change: 12.4, color: 'blue', format: 'number', sparkData: [62000, 65000, 68000, 72000, 75000, 78000, 81700] },
      { label: 'Returning Visitors', value: 9900, change: 8.6, color: 'violet', format: 'number', sparkData: [7200, 7600, 8000, 8400, 8800, 9400, 9900] },
      { label: 'Bounce Rate', value: 42.3, change: -5.2, color: 'emerald', format: 'percent', sparkData: [48, 47, 46, 45, 44, 43, 42.3] },
      { label: 'Avg Session', value: 3.45, change: 14.1, color: 'amber', format: 'decimal', sparkData: [2.8, 2.9, 3.0, 3.1, 3.2, 3.35, 3.45] },
    ]}
    visitorTrend={[
      { month: 'Jul', visits: 10200, returning: 1180 },
      { month: 'Aug', visits: 10800, returning: 1250 },
      { month: 'Sep', visits: 11500, returning: 1320 },
      { month: 'Oct', visits: 12100, returning: 1410 },
      { month: 'Nov', visits: 11800, returning: 1380 },
      { month: 'Dec', visits: 12600, returning: 1520 },
      { month: 'Jan', visits: 11200, returning: 1340 },
      { month: 'Feb', visits: 11900, returning: 1450 },
      { month: 'Mar', visits: 12800, returning: 1550 },
    ]}
    websiteBreakdown={[
      { name: 'The Concrete Protector', value: 42500, color: '#3B82F6' },
      { name: 'CP eStore', value: 18200, color: '#8B5CF6' },
      { name: 'Decorative Concrete', value: 12400, color: '#10B981' },
      { name: 'CP Training Portal', value: 8600, color: '#F59E0B' },
    ]}
    deviceData={[
      { device: 'Desktop', users: 45200 },
      { device: 'Mobile', users: 28500 },
      { device: 'Tablet', users: 8000 },
    ]}
    trafficSources={[
      { source: 'google / organic', users: 32500, sessions: 41200, bounceRate: '38.2%', avgDuration: '3:42' },
      { source: 'google / cpc', users: 14800, sessions: 18500, bounceRate: '45.1%', avgDuration: '2:58' },
      { source: 'direct / (none)', users: 12200, sessions: 15800, bounceRate: '35.6%', avgDuration: '4:12' },
      { source: 'facebook / referral', users: 8500, sessions: 10200, bounceRate: '52.3%', avgDuration: '2:24' },
      { source: 'bing / organic', users: 4200, sessions: 5100, bounceRate: '41.8%', avgDuration: '3:18' },
      { source: 'instagram / social', users: 3800, sessions: 4500, bounceRate: '55.2%', avgDuration: '2:05' },
      { source: 'email / newsletter', users: 2800, sessions: 3400, bounceRate: '28.4%', avgDuration: '4:45' },
      { source: 'youtube / referral', users: 2200, sessions: 2800, bounceRate: '48.7%', avgDuration: '2:32' },
    ]}
  />
);

export default CPWebAnalytics;
