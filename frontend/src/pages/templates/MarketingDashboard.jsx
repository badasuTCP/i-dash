import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Funnel,
} from 'recharts';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import PageInsight from '../../components/common/PageInsight';

const MarketingDashboardTemplate = ({ title, subtitle, accentColor, scorecards, spendVsRevenue, funnelData, performanceSummary, spendByPeriod, ctrData, metricsPerPeriod, pageInsights, dataWarning, hasLiveData }) => {
  const { isDark } = useTheme();
  const { resolveData, filterData, isFiltered, clearFilter } = useDashboardDateFilter();

  // ── Unified resolution — single source of truth ───────────────────────────
  // spendVsRevenue drives both the chart and the scorecard resolution.
  const svrResolved = useMemo(
    () => resolveData(spendVsRevenue, 'quarter', metricsPerPeriod),
    [resolveData, spendVsRevenue, metricsPerPeriod]
  );
  // Secondary charts use filterData (no scorecard needed)
  const sbp = useMemo(() => filterData(spendByPeriod, 'period'), [filterData, spendByPeriod]);
  const ctr = useMemo(() => filterData(ctrData, 'quarter'),      [filterData, ctrData]);
  const noDataMsg = svrResolved.noDataForPeriod ? svrResolved.fallbackMessage : null;

  // Scorecards from the same resolved metrics — guaranteed same period as chart
  const resolvedScorecards = useMemo(() => {
    const metrics = svrResolved.resolvedMetrics;
    if (!metrics) return scorecards;
    return scorecards.map((kpi) =>
      kpi.metricKey !== undefined && metrics[kpi.metricKey] !== undefined
        ? { ...kpi, value: metrics[kpi.metricKey] }
        : kpi
    );
  }, [scorecards, svrResolved.resolvedMetrics]);

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
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={pageInsights} />

        {/* Live data — check if there's actual spend in the period */}
        {hasLiveData && scorecards?.[0]?.value > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-xl flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-400">Live Ad Data Connected · Meta Ads + Google Ads pipelines synced</p>
          </motion.div>
        )}

        {/* Pipeline connected but no data for this date range */}
        {hasLiveData && (!scorecards?.[0]?.value || scorecards[0].value === 0) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-xl flex items-center gap-2 bg-blue-500/10 border border-blue-500/30">
            <AlertCircle size={15} className="text-blue-400 flex-shrink-0" />
            <p className="text-sm font-medium text-blue-400">No ad data for the selected period — try a different date range</p>
          </motion.div>
        )}

        {/* No pipeline has run yet */}
        {!hasLiveData && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-xl flex items-center gap-2 bg-amber-500/10 border border-amber-500/30">
            <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-400">Awaiting pipeline sync — run Meta/Google Ads pipelines to populate</p>
          </motion.div>
        )}

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

        {/* Performance Summary Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Marketing Performance Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Division</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Spend</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Revenue</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>ROAS</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Conversions</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>CPL</th>
                </tr>
              </thead>
              <tbody>
                {performanceSummary.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.division}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.spend}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.revenue}</td>
                    <td className={`text-right py-3 px-4 font-semibold`} style={{ color: accentColor }}>{row.roas}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.conversions}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.cpl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Spend vs Revenue + Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Marketing Spend vs Revenue</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={svrResolved.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="quarter" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis yAxisId="left" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <YAxis yAxisId="right" orientation="right" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar yAxisId="left" dataKey="spend" name="Spend" fill={accentColor} radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2.5} dot={{ r: 4, fill: '#10B981' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Marketing Funnel Volume</h3>
            <div className="space-y-4 py-4">
              {funnelData.map((step, idx) => {
                const widthPercent = (step.value / funnelData[0].value) * 100;
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={textSecondary}>{step.name}</span>
                      <span className={`font-semibold ${textPrimary}`}>{step.value.toLocaleString()}</span>
                    </div>
                    <div className={`h-8 rounded-md overflow-hidden ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPercent}%` }}
                        transition={{ duration: 1, delay: 0.5 + idx * 0.15, ease: 'easeOut' }}
                        className="h-full rounded-md"
                        style={{
                          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Spend by Period + CTR */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Spend & Leads by Period</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={sbp.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="period" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis yAxisId="left" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <YAxis yAxisId="right" orientation="right" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar yAxisId="left" dataKey="spend" name="Spend" fill={accentColor} radius={[4, 4, 0, 0]} opacity={0.7} />
                <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Traffic Quality (CTR) by Quarter</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ctr.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="quarter" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                <Legend />
                <Bar dataKey="meta" name="Meta CTR" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="google" name="Google CTR" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default MarketingDashboardTemplate;
