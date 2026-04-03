import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../scorecards/ScoreCard';
import ChartCard from '../charts/ChartCard';
import PremiumAreaChart from '../charts/AreaChart';
import PremiumBarChart from '../charts/BarChart';
import { TrendingUp, BarChart3, Zap, Target } from 'lucide-react';

const ExecutiveDashboard = () => {
  const { isDark } = useTheme();

  const executiveKPIs = [
    {
      label: 'Revenue',
      value: 248000,
      change: 18.7,
      color: 'blue',
      sparkData: [185000, 205000, 218000, 230000, 238000, 244000, 248000],
      format: 'currency',
    },
    {
      label: 'Net Profit',
      value: 89500,
      change: 12.3,
      color: 'emerald',
      sparkData: [72000, 76500, 80000, 83500, 86000, 88000, 89500],
      format: 'currency',
    },
    {
      label: 'YoY Growth',
      value: 18.7,
      change: 4.2,
      color: 'violet',
      sparkData: [12.5, 13.8, 15.2, 16.5, 17.6, 18.2, 18.7],
      format: 'decimal',
    },
    {
      label: 'Customer LTV',
      value: 2450,
      change: 8.9,
      color: 'amber',
      sparkData: [2100, 2190, 2265, 2330, 2380, 2420, 2450],
      format: 'currency',
    },
  ];

  // Revenue actual vs target
  const revenueData = [
    { date: 'Jan', actual: 58000, target: 55000 },
    { date: 'Feb', actual: 72000, target: 60000 },
    { date: 'Mar', actual: 85000, target: 75000 },
    { date: 'Apr', revenue: 95000 },
    { date: 'May', revenue: 112000 },
    { date: 'Jun', revenue: 248000 },
  ];

  // Department performance
  const departmentData = [
    { name: 'Marketing', actual: 72000, target: 65000 },
    { name: 'Sales', actual: 125000, target: 115000 },
    { name: 'Ops', actual: 35000, target: 38000 },
    { name: 'Finance', actual: 16000, target: 15000 },
  ];

  // MoM comparison cards data
  const momCards = [
    { label: 'Revenue', thisMonth: '$248K', lastMonth: '$215K', change: 15.3 },
    { label: 'Profit Margin', thisMonth: '36.1%', lastMonth: '32.5%', change: 3.6 },
    { label: 'Customer Count', thisMonth: 1248, lastMonth: 1185, change: 5.3 },
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
            Executive Dashboard
          </h1>
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            High-level business metrics and KPIs
          </p>
        </motion.div>

        {/* KPI Scorecards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
        >
          {executiveKPIs.map((kpi, idx) => (
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

        {/* Row 1: Revenue Actual vs Target and Department Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
        >
          <ChartCard title="Revenue Trend" icon={Target} subtitle="Actual performance">
            <PremiumAreaChart
              data={revenueData}
              series={[
                { key: 'actual', name: 'Actual', color: '#10B981' },
                { key: 'target', name: 'Target', color: '#3B82F6' },
              ]}
              height={300}
            />
          </ChartCard>

          <ChartCard title="Department Performance" icon={BarChart3} subtitle="vs target">
            <PremiumBarChart
              data={departmentData}
              series={[
                { key: 'actual', name: 'Actual', color: '#8B5CF6' },
                { key: 'target', name: 'Target', color: '#64748B' },
              ]}
              height={300}
              stacked={false}
            />
          </ChartCard>
        </motion.div>

        {/* Row 2: MoM Comparison Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {momCards.map((card, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + idx * 0.05 }}
              className={`rounded-xl p-6 border ${
                isDark
                  ? 'bg-[#1e2235] border-slate-700/30'
                  : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <p className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {card.label}
              </p>
              <div className="mb-4">
                <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {card.thisMonth}
                </p>
              </div>
              <div className="space-y-2">
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Previous: {card.lastMonth}
                </p>
                <p className={`text-sm font-semibold ${card.change > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {card.change > 0 ? '+' : ''}{card.change}% vs last month
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ExecutiveDashboard;
