import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const CustomLineTooltip = ({ active, payload, label, isDark }) => {
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
            {entry.name}: {entry.value?.toFixed(2) || 0}
          </p>
        ))}
      </motion.div>
    );
  }
  return null;
};

const PremiumLineChart = ({
  data = [],
  series = [
    { key: 'campaign1', name: 'Campaign 1', color: '#6366F1' },
    { key: 'campaign2', name: 'Campaign 2', color: '#10B981' },
  ],
  height = 300,
  showLegend = true,
  targetLine = null,
}) => {
  const { isDark } = useTheme();

  // Generate sample data if none provided
  const chartData = data.length > 0 ? data : [
    { date: 'Day 1', campaign1: 2.5, campaign2: 1.8 },
    { date: 'Day 2', campaign1: 3.1, campaign2: 2.2 },
    { date: 'Day 3', campaign1: 2.8, campaign2: 2.9 },
    { date: 'Day 4', campaign1: 4.2, campaign2: 3.5 },
    { date: 'Day 5', campaign1: 5.1, campaign2: 4.1 },
    { date: 'Day 6', campaign1: 4.9, campaign2: 4.8 },
    { date: 'Day 7', campaign1: 6.2, campaign2: 5.4 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full h-full"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`line-gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
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
          <Tooltip content={<CustomLineTooltip isDark={isDark} />} />
          {showLegend && <Legend />}
          {targetLine && (
            <ReferenceLine
              y={targetLine.value}
              stroke={targetLine.color || '#8B5CF6'}
              strokeDasharray="5 5"
              label={targetLine.label || 'Target'}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2.5}
              dot={{ fill: s.color, r: 5 }}
              activeDot={{ r: 7 }}
              isAnimationActive={true}
              animationDuration={800}
              name={s.name}
              animationDelay={100}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default PremiumLineChart;
