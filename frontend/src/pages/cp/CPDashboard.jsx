import React from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';

// Per-month metrics for seamless scorecard filtering
const METRICS_PER_PERIOD = {
  'Jul 2024': { revenue: 520000, equipment: 89,  training: 145, mistakes: 12500 },
  'Aug 2024': { revenue: 545000, equipment: 92,  training: 152, mistakes: 11800 },
  'Sep 2024': { revenue: 580000, equipment: 96,  training: 160, mistakes: 11200 },
  'Oct 2024': { revenue: 610000, equipment: 102, training: 168, mistakes: 10400 },
  'Nov 2024': { revenue: 590000, equipment: 98,  training: 172, mistakes: 9800  },
  'Dec 2024': { revenue: 630000, equipment: 108, training: 185, mistakes: 9200  },
  'Jan 2025': { revenue: 560000, equipment: 98,  training: 168, mistakes: 8500  },
  'Feb 2025': { revenue: 580000, equipment: 104, training: 175, mistakes: 7900  },
  'Mar 2025': { revenue: 620000, equipment: 112, training: 185, mistakes: 7100  },
};

const CPDashboard = () => (
  <DivisionDashboard
    title="CP Dashboard"
    subtitle="The Concrete Protector — Main company performance metrics"
    accentColor="#3B82F6"
    pageInsights={[
      'Revenue peaked in Dec 2024 at $630K — holiday and year-end deal cycle confirmed',
      'Cost of Mistakes down 43% from Jul 2024 → Mar 2025 — quality initiatives working',
      'Equipment sales up 26% YoY — training programs are strong conversion driver',
    ]}
    scorecards={[
      { label: 'CP Revenue',        value: 3410000, change: 14.8,  color: 'blue',    format: 'currency', metricKey: 'revenue',   sparkData: [2800000, 2950000, 3100000, 3200000, 3300000, 3380000, 3410000] },
      { label: 'Equipment Sold',    value: 135,     change: 18.4,  color: 'emerald', format: 'number',   metricKey: 'equipment', sparkData: [89, 95, 102, 110, 118, 128, 135] },
      { label: 'Training Sign Ups', value: 210,     change: 12.3,  color: 'violet',  format: 'number',   metricKey: 'training',  sparkData: [145, 155, 168, 180, 192, 200, 210] },
      { label: 'Cost of Mistakes',  value: 7100,    change: -22.5, color: 'amber',   format: 'currency', metricKey: 'mistakes',  sparkData: [12500, 11200, 9800, 8900, 8200, 7500, 7100] },
    ]}
    revenueData={[
      { month: 'Jul 2024', revenue: 520000, target: 500000 },
      { month: 'Aug 2024', revenue: 545000, target: 510000 },
      { month: 'Sep 2024', revenue: 580000, target: 520000 },
      { month: 'Oct 2024', revenue: 610000, target: 530000 },
      { month: 'Nov 2024', revenue: 590000, target: 540000 },
      { month: 'Dec 2024', revenue: 630000, target: 550000 },
      { month: 'Jan 2025', revenue: 560000, target: 560000 },
      { month: 'Feb 2025', revenue: 580000, target: 570000 },
      { month: 'Mar 2025', revenue: 620000, target: 580000 },
    ]}
    salesByCategory={[
      { name: 'Concrete Coatings',  value: 38, color: '#3B82F6' },
      { name: 'Equipment Sales',    value: 22, color: '#8B5CF6' },
      { name: 'Training Programs',  value: 18, color: '#10B981' },
      { name: 'Consulting',         value: 12, color: '#F59E0B' },
      { name: 'Other Services',     value: 10, color: '#EF4444' },
    ]}
    topProducts={[
      { name: 'CP Epoxy System',      revenue: 680000 },
      { name: 'CP Polyurea Kit',       revenue: 520000 },
      { name: 'Metallic Coating',      revenue: 410000 },
      { name: 'Training Course',       revenue: 350000 },
      { name: 'CP Grinder Package',    revenue: 280000 },
      { name: 'Decorative Flake',      revenue: 220000 },
    ]}
    metricsPerPeriod={METRICS_PER_PERIOD}
    quarterlyData={[
      { metric: 'Revenue',               q1: '$780K', q2: '$845K', q3: '$860K', q4: '$980K', q1_25: '$850K' },
      { metric: 'Equipment Sold',        q1: '89',    q2: '102',   q3: '118',   q4: '135',   q1_25: '112'   },
      { metric: 'Training Sign Ups',     q1: '145',   q2: '168',   q3: '192',   q4: '210',   q1_25: '185'   },
      { metric: 'Avg Deal Size',         q1: '$4.2K', q2: '$4.5K', q3: '$4.8K', q4: '$5.1K', q1_25: '$4.9K' },
      { metric: 'Customer Satisfaction', q1: '90%',   q2: '91%',   q3: '92%',   q4: '93%',   q1_25: '92%'   },
    ]}
  />
);

export default CPDashboard;
