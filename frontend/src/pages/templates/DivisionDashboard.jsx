import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { Filter, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import DateRangePicker from '../../components/common/DateRangePicker';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import PageInsight from '../../components/common/PageInsight';

const DivisionDashboard = ({ title, subtitle, accentColor, scorecards, revenueData, salesByCategory, topProducts, quarterlyData, metricsPerPeriod, pageInsights, quarterlyHeaders, dataWarning }) => {
  // Default headers match the most common real-data range; override per-page via quarterlyHeaders prop
  const qHeaders = quarterlyHeaders || ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026'];
  const { isDark } = useTheme();
  const { handleDateChange, filterData, isFiltered, clearFilter } = useDashboardDateFilter();

  // Compute filtered datasets — each call returns { data, noDataForPeriod, fallbackMessage }
  const revFiltered = filterData(revenueData, 'month');
  const noDataMsg   = revFiltered.noDataForPeriod ? revFiltered.fallbackMessage : null;

  // Resolve scorecards against metricsPerPeriod when a date filter is active
  const activePeriod = isFiltered && revFiltered.data.length > 0 ? revFiltered.data[0].month : null;
  const periodMetrics = activePeriod && metricsPerPeriod ? metricsPerPeriod[activePeriod] : null;
  const resolvedScorecards = periodMetrics
    ? scorecards.map((kpi) =>
        kpi.metricKey !== undefined && periodMetrics[kpi.metricKey] !== undefined
          ? { ...kpi, value: periodMetrics[kpi.metricKey] }
          : kpi
      )
    : scorecards;

  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';
  const tableBorder = isDark ? 'border-slate-700/30' : 'border-slate-200';
  const tableRowHover = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    border: `1px solid ${isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'}`,
    borderRadius: '8px',
    color: isDark ? '#e2e8f0' : '#1e293b',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>{title}</h1>
            <p className={textSecondary}>{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {isFiltered && (
              <motion.button onClick={clearFilter}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
                title="Clear filter"
              >
                <Filter size={10} /> Filtered ✕
              </motion.button>
            )}
            <DateRangePicker onApply={handleDateChange} />
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={pageInsights} />

        {/* Data warning banner — shown when page has no live pipeline connection */}
        {dataWarning && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/30">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">⚠ Estimated Data — No Live Pipeline Connected</p>
              <p className="text-xs text-amber-300/80 mt-0.5">{dataWarning}</p>
            </div>
          </motion.div>
        )}

        {/* No-data-for-period banner */}
        {noDataMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-lg flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{noDataMsg}</span>
          </motion.div>
        )}

        {/* Scorecards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {resolvedScorecards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {/* Revenue Trend + Sales by Category */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={revFiltered.data}>
                <defs>
                  <linearGradient id={`revGrad-${accentColor}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" fill={`url(#revGrad-${accentColor})`} stroke={accentColor} strokeWidth={2} />
                <Line type="monotone" dataKey="target" name="Target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Sales by Category</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={salesByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                  {salesByCategory.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {salesByCategory.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className={textSecondary}>{cat.name}</span>
                  </div>
                  <span className={`font-medium ${textPrimary}`}>{cat.value}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Top Products / Services */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Top Products & Services</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
              <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <YAxis dataKey="name" type="category" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} width={140} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
              <Bar dataKey="revenue" fill={accentColor} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Quarterly Performance Table */}
        {quarterlyData && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Quarterly Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                    {qHeaders.slice(0,4).map((h) => (
                      <th key={h} className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>{h}</th>
                    ))}
                    <th className={`text-right py-3 px-4 font-semibold`} style={{ color: accentColor }}>{qHeaders[4]} ★</th>
                  </tr>
                </thead>
                <tbody>
                  {quarterlyData.map((row, idx) => (
                    <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                      <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                      <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q1}</td>
                      <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q2}</td>
                      <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q3}</td>
                      <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q4}</td>
                      <td className={`text-right py-3 px-4 font-semibold ${textPrimary}`}>{row.q1_25}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default DivisionDashboard;
