import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Filter, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import DateRangePicker from '../../components/common/DateRangePicker';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import PageInsight from '../../components/common/PageInsight';

const WebAnalyticsDashboard = ({ title, subtitle, accentColor, scorecards, websiteBreakdown, deviceData, trafficSources, visitorTrend, metricsPerPeriod, pageInsights }) => {
  const { isDark } = useTheme();
  const { handleDateChange, filterData, isFiltered, clearFilter } = useDashboardDateFilter();

  const vt        = filterData(visitorTrend, 'month');
  const noDataMsg = vt.noDataForPeriod ? vt.fallbackMessage : null;

  // Resolve scorecards from metricsPerPeriod when filter active
  const activePeriod = isFiltered && vt.data.length > 0 ? vt.data[0].month : null;
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

        {/* Visitor Trend */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Visitor Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={vt.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
              <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
              <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v.toLocaleString()}`]} />
              <Legend />
              <Line type="monotone" dataKey="visits" name="Visits" stroke={accentColor} strokeWidth={2.5} dot={{ fill: accentColor, r: 4 }} />
              <Line type="monotone" dataKey="returning" name="Returning" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Website Breakdown + Device */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Website Breakdown by Users</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={websiteBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {websiteBreakdown.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {websiteBreakdown.map((site, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: site.color }} />
                    <span className={textSecondary}>{site.name}</span>
                  </div>
                  <span className={`font-medium ${textPrimary}`}>{site.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Visitors by Device</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deviceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="device" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toLocaleString()]} />
                <Bar dataKey="users" fill={accentColor} radius={[6, 6, 0, 0]}>
                  {deviceData.map((entry, idx) => (
                    <Cell key={idx} fill={['#3B82F6', '#10B981', '#F59E0B'][idx]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Traffic Sources Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className={`rounded-xl p-6 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Traffic by Source / Medium</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Source / Medium</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Users</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Sessions</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Bounce Rate</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {trafficSources.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.source}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.users.toLocaleString()}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.sessions.toLocaleString()}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.bounceRate}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.avgDuration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default WebAnalyticsDashboard;
