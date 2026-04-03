import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const CustomDonutTooltip = ({ active, payload, isDark }) => {
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
        <p style={{ color: payload[0].color }} className="text-sm font-semibold">
          {payload[0].name}
        </p>
        <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {payload[0].value?.toLocaleString()} ({payload[0].percent?.toFixed(1)}%)
        </p>
      </motion.div>
    );
  }
  return null;
};

const COLORS = [
  '#4F46E5', // Indigo
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#6366F1', // Indigo-2
];

const PremiumDonutChart = ({
  data = [],
  height = 300,
  showLegend = true,
  centerLabel = null,
}) => {
  const { isDark } = useTheme();

  // Generate sample data if none provided
  const chartData = data.length > 0 ? data : [
    { name: 'Organic Search', value: 45230 },
    { name: 'Paid Ads', value: 38450 },
    { name: 'Social Media', value: 28720 },
    { name: 'Email', value: 16380 },
    { name: 'Referral', value: 12100 },
  ];

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const renderCustomLabel = (entry) => {
    const percent = ((entry.value / total) * 100).toFixed(0);
    return `${percent}%`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full h-full flex flex-col items-center"
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            label={renderCustomLabel}
            isAnimationActive={true}
            animationDuration={800}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomDonutTooltip isDark={isDark} />} />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry) => (
                <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {value}: ${entry.payload.value?.toLocaleString()}
                </span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      {centerLabel && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-center"
        >
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Total</p>
          <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            ${(total / 1000).toFixed(1)}K
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default PremiumDonutChart;
