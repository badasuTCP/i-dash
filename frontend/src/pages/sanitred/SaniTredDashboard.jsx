import React from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';

const SaniTredDashboard = () => (
  <DivisionDashboard
    title="Sani-Tred Dashboard"
    subtitle="Sani-Tred Retail Outlet - Sales and product performance"
    accentColor="#10B981"
    scorecards={[
      { label: 'Retail Revenue', value: 2070000, change: 11.2, color: 'emerald', format: 'currency', sparkData: [1650000, 1720000, 1790000, 1860000, 1930000, 2000000, 2070000] },
      { label: 'Orders', value: 4280, change: 15.6, color: 'blue', format: 'number', sparkData: [3200, 3400, 3550, 3700, 3900, 4100, 4280] },
      { label: 'Avg Order Value', value: 483, change: 6.8, color: 'violet', format: 'currency', sparkData: [420, 435, 445, 455, 465, 475, 483] },
      { label: 'Return Rate', value: 3.2, change: -18.4, color: 'amber', format: 'percent', sparkData: [5.2, 4.8, 4.4, 4.0, 3.6, 3.4, 3.2] },
    ]}
    revenueData={[
      { month: 'Jul', revenue: 310000, target: 300000 },
      { month: 'Aug', revenue: 325000, target: 310000 },
      { month: 'Sep', revenue: 340000, target: 320000 },
      { month: 'Oct', revenue: 365000, target: 330000 },
      { month: 'Nov', revenue: 380000, target: 340000 },
      { month: 'Dec', revenue: 420000, target: 350000 },
      { month: 'Jan', revenue: 345000, target: 360000 },
      { month: 'Feb', revenue: 360000, target: 370000 },
      { month: 'Mar', revenue: 395000, target: 380000 },
    ]}
    salesByCategory={[
      { name: 'Waterproofing Products', value: 35, color: '#10B981' },
      { name: 'Sealants & Coatings', value: 28, color: '#3B82F6' },
      { name: 'Repair Kits', value: 20, color: '#8B5CF6' },
      { name: 'Accessories', value: 12, color: '#F59E0B' },
      { name: 'Bundles', value: 5, color: '#EF4444' },
    ]}
    topProducts={[
      { name: 'Sani-Tred PermaFlex', revenue: 480000 },
      { name: 'TAV Liquid Rubber', revenue: 380000 },
      { name: 'PermaSeal Coating', revenue: 310000 },
      { name: 'Basement Waterproof Kit', revenue: 250000 },
      { name: 'PermaFlex Primer', revenue: 180000 },
      { name: 'Crack Repair System', revenue: 145000 },
    ]}
    quarterlyData={[
      { metric: 'Revenue', q1: '$420K', q2: '$485K', q3: '$510K', q4: '$560K', q1_25: '$490K' },
      { metric: 'Orders', q1: '920', q2: '1050', q3: '1080', q4: '1230', q1_25: '1020' },
      { metric: 'Avg Order Value', q1: '$456', q2: '$462', q3: '$472', q4: '$455', q1_25: '$480' },
      { metric: 'Repeat Customers', q1: '28%', q2: '30%', q3: '32%', q4: '34%', q1_25: '33%' },
      { metric: 'Return Rate', q1: '4.8%', q2: '4.2%', q3: '3.8%', q4: '3.4%', q1_25: '3.2%' },
    ]}
  />
);

export default SaniTredDashboard;
