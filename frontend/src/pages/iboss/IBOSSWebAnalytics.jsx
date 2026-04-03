import React from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';

const IBOSSWebAnalytics = () => (
  <WebAnalyticsDashboard
    title="I-BOS Web Analytics"
    subtitle="I-BOS Contractor Division - Website traffic and lead engagement"
    accentColor="#F59E0B"
    scorecards={[
      { label: 'Total Visits', value: 24800, change: 20.5, color: 'amber', format: 'number', sparkData: [16500, 18000, 19500, 21000, 22200, 23500, 24800] },
      { label: 'Returning Visitors', value: 4200, change: 14.8, color: 'violet', format: 'number', sparkData: [2800, 3100, 3400, 3600, 3800, 4000, 4200] },
      { label: 'Bounce Rate', value: 38.5, change: -8.2, color: 'emerald', format: 'percent', sparkData: [45, 44, 43, 42, 40, 39, 38.5] },
      { label: 'Avg Session', value: 4.12, change: 18.6, color: 'blue', format: 'decimal', sparkData: [3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.12] },
    ]}
    visitorTrend={[
      { month: 'Jul', visits: 3100, returning: 480 },
      { month: 'Aug', visits: 3400, returning: 520 },
      { month: 'Sep', visits: 3600, returning: 560 },
      { month: 'Oct', visits: 3900, returning: 620 },
      { month: 'Nov', visits: 3750, returning: 600 },
      { month: 'Dec', visits: 4100, returning: 680 },
      { month: 'Jan', visits: 3500, returning: 580 },
      { month: 'Feb', visits: 3700, returning: 620 },
      { month: 'Mar', visits: 4050, returning: 680 },
    ]}
    websiteBreakdown={[
      { name: 'I-BOS Main Portal', value: 12500, color: '#F59E0B' },
      { name: 'Contractor Resources', value: 6200, color: '#3B82F6' },
      { name: 'Project Gallery', value: 3800, color: '#10B981' },
      { name: 'Training & Certs', value: 2300, color: '#8B5CF6' },
    ]}
    deviceData={[
      { device: 'Desktop', users: 14200 },
      { device: 'Mobile', users: 8500 },
      { device: 'Tablet', users: 2100 },
    ]}
    trafficSources={[
      { source: 'google / organic', users: 9200, sessions: 12500, bounceRate: '35.2%', avgDuration: '4:18' },
      { source: 'google / cpc', users: 5800, sessions: 7200, bounceRate: '42.1%', avgDuration: '3:45' },
      { source: 'direct / (none)', users: 4500, sessions: 5800, bounceRate: '30.5%', avgDuration: '5:02' },
      { source: 'facebook / social', users: 2200, sessions: 2800, bounceRate: '48.3%', avgDuration: '2:52' },
      { source: 'email / newsletter', users: 1800, sessions: 2200, bounceRate: '25.8%', avgDuration: '5:32' },
      { source: 'youtube / referral', users: 1300, sessions: 1600, bounceRate: '40.2%', avgDuration: '3:28' },
    ]}
  />
);

export default IBOSSWebAnalytics;
