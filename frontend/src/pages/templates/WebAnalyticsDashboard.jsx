import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush,
} from 'recharts';
import { Filter, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import PageInsight from '../../components/common/PageInsight';

// ── Custom Brush handle — "grip" icon (three vertical dots) ─────────────────
const GripHandle = (props) => {
  const { x, y, width, height } = props;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        fill="#4f46e5" stroke="#6366f1" strokeWidth={1}
        style={{ cursor: 'ew-resize', transition: 'fill 0.15s' }} />
      {/* Three vertical dots — grip icon */}
      <circle cx={cx} cy={cy - 5} r={1.5} fill="#c7d2fe" />
      <circle cx={cx} cy={cy}     r={1.5} fill="#c7d2fe" />
      <circle cx={cx} cy={cy + 5} r={1.5} fill="#c7d2fe" />
    </g>
  );
};

// ── Trend Chart with contextual scroll hint ─────────────────────────────────
const TrendChart = ({ data, accentColor, isDark, cardBg, textPrimary, tooltipStyle }) => {
  const [hasScrolled, setHasScrolled] = useState(false);
  const len = data?.length || 0;
  const showBrush = len > 14;
  const isLong = len > 30;
  const showHint = showBrush && isLong && !hasScrolled;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className={`rounded-xl p-6 mb-8 ${cardBg} relative`}>
      <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Visitor Trend</h3>

      {/* Floating hint — positioned over the empty brush track (left side) */}
      {showHint && (
        <div className="absolute bottom-8 left-16 right-1/2 flex items-center justify-center pointer-events-none z-20">
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: [0.5, 0.8, 0.5], x: [10, 0, 10] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className={`text-[10px] uppercase tracking-[0.15em] font-semibold px-3 py-1.5 rounded-full ${
              isDark ? 'bg-indigo-500/15 text-indigo-300/70 border border-indigo-500/20'
                     : 'bg-indigo-50 text-indigo-400/80 border border-indigo-200/40'
            }`}
          >
            ← Drag to view full history
          </motion.span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.4)'} />
          <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 11 }} />
          <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={v => [`${(v || 0).toLocaleString()}`]}
            animationDuration={150}
            cursor={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '4 2' }}
          />
          <Legend />
          <Area type="monotone" dataKey="visits" name="Total Visits" stroke={accentColor} fill="url(#visitGrad)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: accentColor, stroke: '#fff', strokeWidth: 2 }} animationDuration={500} />
          <Line type="monotone" dataKey="returning" name="Returning" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="5 5" dot={false} animationDuration={500} />
          {showBrush && (
            <Brush
              dataKey="month"
              height={30}
              stroke={isDark ? '#4f46e5' : '#6366f1'}
              fill={isDark ? '#0f172a' : '#f8fafc'}
              startIndex={isLong ? len - 30 : 0}
              endIndex={len - 1}
              onChange={() => { if (!hasScrolled) setHasScrolled(true); }}
              traveller={GripHandle}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Brush track styling */}
      <style>{`
        .recharts-brush-slide {
          cursor: grab;
          fill: ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)'};
          stroke: ${isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)'};
          rx: 4;
        }
        .recharts-brush-slide:active { cursor: grabbing; }
      `}</style>
    </motion.div>
  );
};


const WebAnalyticsDashboard = ({ title, subtitle, accentColor, scorecards, websiteBreakdown, deviceData, trafficSources, visitorTrend, metricsPerPeriod, pageInsights, dataWarning, contractorDetails, hasLiveData, loading, apiReachable, propertyId, headerExtra }) => {
  const { isDark } = useTheme();
  const { resolveData, isFiltered, clearFilter } = useDashboardDateFilter();

  // ── Unified resolution ────────────────────────────────────────────────────
  const vtResolved = useMemo(
    () => resolveData(visitorTrend, 'month', metricsPerPeriod),
    [resolveData, visitorTrend, metricsPerPeriod]
  );
  const noDataMsg = vtResolved.noDataForPeriod ? vtResolved.fallbackMessage : null;

  // Scorecards from the same resolved metrics — guaranteed same period as chart
  const resolvedScorecards = useMemo(() => {
    const metrics = vtResolved.resolvedMetrics;
    if (!metrics) return scorecards;
    return scorecards.map((kpi) =>
      kpi.metricKey !== undefined && metrics[kpi.metricKey] !== undefined
        ? { ...kpi, value: metrics[kpi.metricKey] }
        : kpi
    );
  }, [scorecards, vtResolved.resolvedMetrics]);

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
            {headerExtra}
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={pageInsights} />

        {/* Status banner — context-aware based on GA4 connection state */}
        {hasLiveData && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live GA4 Data Connected{propertyId ? ` · Property ${propertyId}` : ''}
          </motion.div>
        )}
        {!hasLiveData && !loading && apiReachable && !propertyId && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-red-500/10 border border-red-500/30">
            <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">Error: GA4 Property Not Found</p>
              <p className="text-xs text-red-300/80 mt-0.5">No GA4 property ID is configured for this division. Set the env var or check auto-discovery. Showing estimated data below.</p>
            </div>
          </motion.div>
        )}
        {!hasLiveData && !loading && apiReachable && propertyId && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/30">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">GA4 Property Found — Awaiting Pipeline Data</p>
              <p className="text-xs text-amber-300/80 mt-0.5">Property {propertyId} is configured but no data has been loaded yet. Run the GA4 pipeline to populate. Showing estimates below.</p>
            </div>
          </motion.div>
        )}
        {!hasLiveData && !loading && !apiReachable && dataWarning && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/30">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">⚠ Estimated Data</p>
              <p className="text-xs text-amber-300/80 mt-0.5">{dataWarning}</p>
            </div>
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

        {/* Visitor Trend — recent-first snap + contextual scroll hint */}
        <TrendChart
          data={vtResolved.data}
          accentColor={accentColor}
          isDark={isDark}
          cardBg={cardBg}
          textPrimary={textPrimary}
          tooltipStyle={tooltipStyle}
        />

        {/* Website Breakdown + Device */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Website Breakdown by Users</h3>
            {(websiteBreakdown || []).length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={websiteBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" animationDuration={500}>
                      {(websiteBreakdown || []).map((entry, idx) => (
                        <Cell key={idx} fill={entry?.color || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${(v || 0).toLocaleString()} users`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="flex items-center justify-center h-[280px]">
                <p className={`text-sm ${textSecondary}`}>No user data available for this period</p>
              </div>
            )}
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

        {/* Per-Contractor Web Analytics (I-BOS specific) */}
        {contractorDetails && contractorDetails.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className={`rounded-xl p-6 mt-8 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-1 ${textPrimary}`}>Per-Contractor Web Performance</h3>
            <p className={`text-xs mb-4 ${textSecondary}`}>Individual website metrics for each active contractor — visits, engagement, bounce rate, and traffic split.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-3 font-semibold ${textSecondary}`}>Contractor</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Visits</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Visitors</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>New</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Returning</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Avg Eng.</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Bounce</th>
                    <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Top Source</th>
                    <th className={`text-center py-3 px-3 font-semibold ${textSecondary}`}>Paid / Organic / Direct</th>
                  </tr>
                </thead>
                <tbody>
                  {contractorDetails.map((row, idx) => (
                    <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                      <td className={`py-3 px-3 font-medium ${textPrimary}`}>{row.contractor}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.visits > 0 ? row.visits.toLocaleString() : '—'}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.visitors > 0 ? row.visitors.toLocaleString() : '—'}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.newVisitors > 0 ? row.newVisitors.toLocaleString() : '—'}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.returning > 0 ? row.returning.toLocaleString() : '—'}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.avgEngagement}</td>
                      <td className={`text-right py-3 px-3 ${textSecondary}`}>{row.bounceRate}</td>
                      <td className={`text-right py-3 px-3 text-xs ${textSecondary}`}>{row.topSource}</td>
                      <td className={`text-center py-3 px-3 text-xs ${textSecondary}`}>
                        {row.paidShare !== '—'
                          ? <span><span className="text-blue-400">{row.paidShare}</span> / <span className="text-emerald-400">{row.organicShare}</span> / <span className="text-amber-400">{row.directShare}</span></span>
                          : '—'}
                      </td>
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

export default WebAnalyticsDashboard;
