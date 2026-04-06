import React from 'react';
import DivisionDashboard from '../templates/DivisionDashboard';

// Real data from Google Sheets / Looker as of Q1 2026
const IBOSSDashboard = () => (
  <DivisionDashboard
    title="I-BOS Dashboard"
    subtitle="I-BOS Contractor Division — 13 active contractors · Data as of Q1 2026"
    accentColor="#F59E0B"
    scorecards={[
      {
        label: 'Revenue Generated TD',
        value: 1154810,
        change: 18.2,
        color: 'emerald',
        format: 'currency',
        sparkData: [680000, 720000, 810000, 890000, 980000, 1080000, 1154810],
      },
      {
        label: 'Total Marketing Spend',
        value: 74646,
        change: 4.8,
        color: 'amber',
        format: 'currency',
        sparkData: [58000, 62000, 55000, 62200, 67000, 71000, 74646],
      },
      {
        label: 'Total Distinct Leads',
        value: 727,
        change: 22.1,
        color: 'blue',
        format: 'number',
        sparkData: [420, 480, 510, 565, 610, 670, 727],
      },
      {
        label: 'Avg Cost Per Lead',
        value: 102.68,
        change: -14.5,
        color: 'violet',
        format: 'currency',
        sparkData: [145, 138, 128, 120, 115, 108, 102.68],
      },
    ]}
    revenueData={[
      { month: 'Q2 2025', revenue: 285000, target: 260000 },
      { month: 'Q3 2025', revenue: 295000, target: 280000 },
      { month: 'Q4 2025', revenue: 380000, target: 320000 },
      { month: 'Q1 2026', revenue: 194810, target: 300000 },
    ]}
    salesByCategory={[
      { name: 'Beckley (Concrete Trans.)', value: 34, color: '#3B82F6' },
      { name: 'Eminence', value: 29, color: '#06B6D4' },
      { name: 'Columbus Coatings', value: 10, color: '#8B5CF6' },
      { name: 'PermaSurface', value: 14, color: '#84CC16' },
      { name: 'Diamond Topcoat', value: 10, color: '#EC4899' },
      { name: 'SLG', value: 4, color: '#F59E0B' },
    ]}
    topProducts={[
      { name: 'Beckley Concrete Decor', revenue: 392470 },
      { name: 'Eminence', revenue: 330770 },
      { name: 'Columbus Concrete Coatings', revenue: 113720 },
      { name: 'Diamond Topcoat', revenue: 113730 },
      { name: 'PermaSurface', revenue: 156330 },
      { name: 'SLG Concrete Coatings', revenue: 47790 },
    ]}
    quarterlyData={[
      { metric: 'Revenue', q1: '$275K', q2: '$285K', q3: '$295K', q4: '$380K', q1_25: '$194.8K' },
      { metric: 'Total Leads', q1: '142', q2: '168', q3: '185', q4: '182', q1_25: '150' },
      { metric: 'Marketing Spend', q1: '$58K', q2: '$62K', q3: '$55K', q4: '$62.2K', q1_25: '$74.6K' },
      { metric: 'Avg CPL', q1: '$142', q2: '$128', q3: '$115', q4: '$108', q1_25: '$102.68' },
      { metric: 'Total Clicks', q1: '45K', q2: '52K', q3: '60K', q4: '71K', q1_25: '228.5K' },
      { metric: 'Total Web Visits', q1: '22K', q2: '38K', q3: '45K', q4: '58K', q1_25: '109K' },
    ]}
  />
);

export default IBOSSDashboard;
