import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, Brush,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Funnel,
} from 'recharts';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';

const MarketingDashboardTemplate = ({ title, subtitle, accentColor, scorecards, spendVsRevenue, funnelData, performanceSummary, spendByPeriod, ctrData, metricsPerPeriod, pageInsights, dataWarning, hasLiveData }) => {
  const { isDark } = useTheme();

  // Server handles date filtering — pass data through directly
  const svrResolved = useMemo(() => ({ data: spendVsRevenue || [] }), [spendVsRevenue]);
  const sbp = useMemo(() => ({ data: spendByPeriod || [] }), [spendByPeriod]);
  const ctr = useMemo(() => ({ data: ctrData || [] }), [ctrData]);
  const resolvedScorecards = scorecards || [];

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

        {/* Date filtering handled server-side — no client-side "no records" message */}

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

        {/* Funnel from live scorecards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Marketing Funnel</h3>
            <div className="space-y-4 py-4">
              {(() => {
                const sc = resolvedScorecards.reduce((m, k) => { m[k.label] = k.value; return m; }, {});
                const steps = [
                  { name: 'Impressions', value: sc['Impressions'] || sc['Total Impressions'] || 0 },
                  { name: 'Clicks', value: sc['Total Clicks'] || 0 },
                  { name: 'Leads', value: sc['Leads'] || sc['Total Distinct Leads'] || 0 },
                ];
                const maxVal = Math.max(...steps.map(s => s.value), 1);
                return steps.filter(s => s.value > 0).map((step, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={textSecondary}>{step.name}</span>
                      <span className={`font-semibold ${textPrimary}`}>{step.value.toLocaleString()}</span>
                    </div>
                    <div className={`h-8 rounded-md overflow-hidden ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(step.value / maxVal) * 100}%` }}
                        transition={{ duration: 1, delay: 0.3 + idx * 0.15 }}
                        className="h-full rounded-md"
                        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }}
                      />
                    </div>
                  </div>
                ));
              })()}
              {resolvedScorecards.length === 0 && (
                <p className={`text-sm text-center py-8 ${textSecondary}`}>No funnel data for this period</p>
              )}
            </div>
          </motion.div>

          {/* Platform breakdown summary */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Quick Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              {resolvedScorecards.map((kpi, i) => (
                <div key={i} className={`rounded-lg p-4 ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${textSecondary}`}>{kpi.label}</p>
                  <p className={`text-xl font-bold ${textPrimary}`}>
                    {kpi.format === 'currency' ? `$${(kpi.value || 0).toLocaleString()}` : (kpi.value || 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Spend & Leads by Period — FULL WIDTH */}
        <div className="mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Spend & Leads by Period</h3>
            {(sbp.data?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={sbp.data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={accentColor} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.4)'} />
                  <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`} />
                  <YAxis yAxisId="right" orientation="right" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === 'Spend' ? `$${(v || 0).toLocaleString()}` : (v || 0).toLocaleString(), name]} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke={accentColor} fill="url(#spendGrad)" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="#F59E0B" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#F59E0B' }} />
                  {(sbp.data?.length || 0) > 14 && (
                    <Brush dataKey="date" height={26} stroke="#6366f1" fill={isDark ? '#0f172a' : '#f8fafc'}
                      startIndex={Math.max(0, (sbp.data?.length || 0) - 30)} endIndex={(sbp.data?.length || 1) - 1} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className={`h-[350px] flex items-center justify-center ${textSecondary}`}>
                <p className="text-sm">No spend data for this period</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default MarketingDashboardTemplate;
