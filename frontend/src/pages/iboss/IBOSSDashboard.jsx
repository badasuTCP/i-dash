import React from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';

const IBOSSDashboard = () => (
  <DivisionDashboard
    title="I-BOS Dashboard"
    subtitle="I-BOS Contractor Division - Contractor sales and project metrics"
    accentColor="#F59E0B"
    scorecards={[
      { label: 'Contractor Revenue', value: 3000000, change: 16.5, color: 'amber', format: 'currency', sparkData: [2200000, 2350000, 2500000, 2650000, 2780000, 2900000, 3000000] },
      { label: 'Active Contractors', value: 342, change: 22.1, color: 'blue', format: 'number', sparkData: [220, 240, 260, 280, 300, 320, 342] },
      { label: 'Projects Completed', value: 1280, change: 18.8, color: 'emerald', format: 'number', sparkData: [850, 920, 980, 1050, 1120, 1200, 1280] },
      { label: 'Avg Project Value', value: 2344, change: 8.4, color: 'violet', format: 'currency', sparkData: [1950, 2020, 2080, 2150, 2220, 2280, 2344] },
    ]}
    revenueData={[
      { month: 'Jul', revenue: 420000, target: 400000 },
      { month: 'Aug', revenue: 445000, target: 410000 },
      { month: 'Sep', revenue: 480000, target: 420000 },
      { month: 'Oct', revenue: 510000, target: 430000 },
      { month: 'Nov', revenue: 495000, target: 440000 },
      { month: 'Dec', revenue: 540000, target: 450000 },
      { month: 'Jan', revenue: 460000, target: 460000 },
      { month: 'Feb', revenue: 485000, target: 470000 },
      { month: 'Mar', revenue: 530000, target: 480000 },
    ]}
    salesByCategory={[
      { name: 'Floor Coatings', value: 40, color: '#F59E0B' },
      { name: 'Garage Systems', value: 25, color: '#3B82F6' },
      { name: 'Commercial Projects', value: 20, color: '#10B981' },
      { name: 'Decorative Work', value: 10, color: '#8B5CF6' },
      { name: 'Maintenance', value: 5, color: '#EF4444' },
    ]}
    topProducts={[
      { name: 'Commercial Floor System', revenue: 650000 },
      { name: 'Garage Epoxy Package', revenue: 520000 },
      { name: 'Industrial Coating', revenue: 420000 },
      { name: 'Decorative Metallic', revenue: 350000 },
      { name: 'Polyurea System', revenue: 280000 },
      { name: 'Repair & Resurface', revenue: 210000 },
    ]}
    quarterlyData={[
      { metric: 'Revenue', q1: '$680K', q2: '$720K', q3: '$810K', q4: '$890K', q1_25: '$780K' },
      { metric: 'Active Contractors', q1: '245', q2: '268', q3: '290', q4: '320', q1_25: '342' },
      { metric: 'Projects Completed', q1: '280', q2: '310', q3: '340', q4: '350', q1_25: '320' },
      { metric: 'Contractor Leads', q1: '85', q2: '92', q3: '105', q4: '112', q1_25: '98' },
      { metric: 'Avg Project Value', q1: '$2.1K', q2: '$2.15K', q3: '$2.22K', q4: '$2.30K', q1_25: '$2.34K' },
    ]}
  />
);

export default IBOSSDashboard;
