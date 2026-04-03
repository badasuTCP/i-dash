import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../scorecards/ScoreCard';
import ChartCard from '../charts/ChartCard';
import PremiumAreaChart from '../charts/AreaChart';
import PremiumBarChart from '../charts/BarChart';
import PremiumDonutChart from '../charts/DonutChart';
import MetricTable from '../charts/MetricTable';
import { TrendingUp, BarChart3, Activity, Users } from 'lucide-react';

const SalesDashboard = () => {
  const { isDark } = useTheme();

  const salesKPIs = [
    {
      label: 'Deals Won',
      value: 89,
      change: 6.8,
      color: 'blue',
      sparkData: [68, 72, 76, 81, 85, 87, 89],
      format: 'number',
    },
    {
      label: 'Revenue Won',
      value: 124500,
      change: 14.2,
      color: 'emerald',
      sparkData: [95000, 103000, 110000, 116000, 119000, 122000, 124500],
      format: 'currency',
    },
    {
      label: 'Pipeline Value',
      value: 487500,
      change: 22.5,
      color: 'violet',
      sparkData: [350000, 380000, 410000, 440000, 460000, 475000, 487500],
      format: 'currency',
    },
    {
      label: 'Win Rate',
      value: 34.2,
      change: 3.5,
      color: 'amber',
      sparkData: [29.0, 30.2, 31.5, 32.8, 33.5, 33.9, 34.2],
      format: 'decimal',
    },
  ];

  // Pipeline stages
  const pipelineData = [
    { name: 'Prospecting', value: 125000 },
    { name: 'Qualified', value: 210000 },
    { name: 'Proposal', value: 95000 },
    { name: 'Negotiation', value: 57500 },
  ];

  // Won vs Lost
  const dealsData = [
    { name: 'Won', value: 89 },
    { name: 'Lost', value: 35 },
    { name: 'Open', value: 42 },
  ];

  // Revenue trend
  const revenueData = [
    { date: 'Month 1', revenue: 28500 },
    { date: 'Month 2', revenue: 35200 },
    { date: 'Month 3', revenue: 42100 },
    { date: 'Month 4', revenue: 51800 },
    { date: 'Month 5', revenue: 58900 },
    { date: 'Month 6', revenue: 124500 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Sales Dashboard
          </h1>
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            Pipeline, deals, and revenue performance
          </p>
        </motion.div>

        {/* KPI Scorecards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
        >
          {salesKPIs.map((kpi, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + idx * 0.05 }}
            >
              <ScoreCard {...kpi} />
            </motion.div>
          ))}
        </motion.div>

        {/* Row 1: Pipeline Stages and Won vs Lost */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
        >
          <ChartCard title="Pipeline Stages" icon={BarChart3} subtitle="By stage">
            <PremiumDonutChart data={pipelineData} height={300} centerLabel="Total" />
          </ChartCard>

          <ChartCard title="Deals Won vs Lost" icon={Activity} subtitle="Deal status">
            <PremiumDonutChart data={dealsData} height={300} centerLabel="Total" />
          </ChartCard>
        </motion.div>

        {/* Row 2: Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-10"
        >
          <ChartCard title="Revenue Trend" icon={TrendingUp} subtitle="Last 6 months">
            <PremiumAreaChart
              data={revenueData}
              series={[
                { key: 'revenue', name: 'Revenue Won', color: '#10B981' },
              ]}
              height={300}
            />
          </ChartCard>
        </motion.div>

        {/* Row 3: Recent Deals Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <ChartCard title="Recent Deals" icon={Activity}>
            <MetricTable />
          </ChartCard>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default SalesDashboard;
