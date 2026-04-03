import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const CustomBarTooltip = ({ active, payload, label, isDark }) => {
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

const PremiumBarChart = ({
  data = [],
  series = [
    { key: 'revenue', name: 'Revenue', color: '#6366F1' },
    { key: 'cost', name: 'Cost', color: '#F43F5E' },
  ],
  height = 300,
  stacked = false,
  showLegend = true,
}) => {
  const { isDark } = useTheme();

  // Generate sample data if none provided
  const chartData = data.length > 0 ? data : [
    { name: 'Meta', revenue: 45000, cost: 18000 },
    { name: 'Google', revenue: 52000, cost: 19500 },
    { name: 'TikTok', revenue: 28000, cost: 12000 },
    { name: 'LinkedIn', revenue: 18500, cost: 8000 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full h-full"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`bar-gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.6} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 213, 225, 0.3)'}
          />
          <XAxis
            dataKey="name"
            stroke={isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.6)'}
          />
          <YAxis
            stroke={isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.6)'}
          />
          <Tooltip content={<CustomBarTooltip isDark={isDark} />} />
          {showLegend && <Legend />}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={`url(#bar-gradient-${s.key})`}
              radius={[4, 4, 0, 0]}
              isAnimationActive={true}
              animationDuration={800}
              name={s.name}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default PremiumBarChart;
