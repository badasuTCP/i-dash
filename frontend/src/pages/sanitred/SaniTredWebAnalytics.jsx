import React from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';

const SaniTredWebAnalytics = () => (
  <WebAnalyticsDashboard
    title="Sani-Tred Web Analytics"
    subtitle="Sani-Tred Retail - Website traffic and eCommerce engagement"
    accentColor="#10B981"
    scorecards={[
      { label: 'Total Visits', value: 38500, change: 16.2, color: 'emerald', format: 'number', sparkData: [28000, 30000, 32000, 33500, 35000, 37000, 38500] },
      { label: 'Returning Visitors', value: 5800, change: 11.4, color: 'violet', format: 'number', sparkData: [4200, 4500, 4800, 5000, 5300, 5600, 5800] },
      { label: 'Bounce Rate', value: 48.5, change: -3.8, color: 'blue', format: 'percent', sparkData: [54, 53, 52, 51, 50, 49, 48.5] },
      { label: 'Avg Session', value: 2.82, change: 9.5, color: 'amber', format: 'decimal', sparkData: [2.3, 2.4, 2.5, 2.6, 2.7, 2.75, 2.82] },
    ]}
    visitorTrend={[
      { month: 'Jul', visits: 4800, returning: 720 },
      { month: 'Aug', visits: 5100, returning: 780 },
      { month: 'Sep', visits: 5400, returning: 840 },
      { month: 'Oct', visits: 5800, returning: 900 },
      { month: 'Nov', visits: 5600, returning: 870 },
      { month: 'Dec', visits: 6200, returning: 980 },
      { month: 'Jan', visits: 5200, returning: 820 },
      { month: 'Feb', visits: 5500, returning: 860 },
      { month: 'Mar', visits: 5900, returning: 950 },
    ]}
    websiteBreakdown={[
      { name: 'Sani-Tred Main Store', value: 22000, color: '#10B981' },
      { name: 'DIY Solutions', value: 8500, color: '#3B82F6' },
      { name: 'Product Reviews', value: 5200, color: '#8B5CF6' },
      { name: 'Knowledge Base', value: 2800, color: '#F59E0B' },
    ]}
    deviceData={[
      { device: 'Desktop', users: 18200 },
      { device: 'Mobile', users: 16500 },
      { device: 'Tablet', users: 3800 },
    ]}
    trafficSources={[
      { source: 'google / organic', users: 14200, sessions: 18500, bounceRate: '44.2%', avgDuration: '2:58' },
      { source: 'google / cpc', users: 8500, sessions: 10800, bounceRate: '48.5%', avgDuration: '2:32' },
      { source: 'direct / (none)', users: 6200, sessions: 7800, bounceRate: '38.1%', avgDuration: '3:25' },
      { source: 'facebook / social', users: 4100, sessions: 5200, bounceRate: '55.4%', avgDuration: '2:08' },
      { source: 'youtube / referral', users: 2800, sessions: 3400, bounceRate: '42.3%', avgDuration: '3:45' },
      { source: 'email / newsletter', users: 1800, sessions: 2200, bounceRate: '32.1%', avgDuration: '4:12' },
    ]}
  />
);

export default SaniTredWebAnalytics;
