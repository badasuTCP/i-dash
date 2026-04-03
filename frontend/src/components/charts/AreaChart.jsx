import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const CustomTooltip = ({ active, payload, label, isDark }) => {
  if (active && payload && payload.length) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-3 rounded-lg border shadow-lg ${
          isDark
            ? 'bg-[#1e2235] border-slate-600/30'
            : 'bg-white border-slate-200'
        }`}
      >
        <p className={`text-sm mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-semibold">
            {entry.name}: ${entry.value?.toLocaleString() || 0}
          </p>
        ))}
      </motion.div>
    );
  }
  return null;
};

const PremiumAreaChart = ({
  data = [],
  series = [
    { key: 'revenue', name: 'Revenue', color: '#6366F1' },
    { key: 'cost', name: 'Cost', color: '#F43F5E' },
  ],
  height = 300,
  showLegend = true,
}) => {
  const { isDark } = useTheme();

  // Generate sample data if none provided
  const chartData = data.length > 0 ? data : [
    { date: 'Jan 1', revenue: 45000, cost: 18000 },
    { date: 'Jan 8', revenue: 52000, cost: 19500 },
    { date: 'Jan 15', revenue: 48000, cost: 17200 },
    { date: 'Jan 22', revenue: 61000, cost: 21000 },
    { date: 'Jan 29', revenue: 72000, cost: 24000 },
    { date: 'Feb 5', revenue: 95000, cost: 28500 },
    { date: 'Feb 12', revenue: 124500, cost: 32000 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full h-full"
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 213, 225, 0.3)'}
          />
          <XAxis
            dataKey="date"
            stroke={isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.6)'}
          />
          <YAxis
            stroke={isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.6)'}
          />
          <Tooltip content={<CustomTooltip isDark={isDark} />} />
          {showLegend && <Legend />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={`url(#gradient-${s.key})`}
              strokeWidth={2.5}
              isAnimationActive={true}
              animationDuration={800}
              name={s.name}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default PremiumAreaChart;
