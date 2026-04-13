import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import ScoreCard from '../components/scorecards/ScoreCard';
import { Activity, AlertCircle, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useDashboardDateFilter } from '../hooks/useDashboardDateFilter';
import { dashboardAPI } from '../services/api';
import PageInsight from '../components/common/PageInsight';

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────
const fmtCurrency = (v) => {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v).toLocaleString()}`;
};
const fmtNumber = (v) => {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
};
const fmtPct = (v) => {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(1)}%`;
};
const fmtMetricValue = (metric, value) => {
  if (value === null || value === undefined) return '—';
  const m = (metric || '').toLowerCase();
  if (m.includes('yoy') || m.includes('growth')) return fmtPct(value);
  if (m.includes('revenue') || m.includes('sales') || m.includes('spend') || m.includes('cost')) {
    return fmtCurrency(value);
  }
  return fmtNumber(value);
};

const DIVISION_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

const ExecutiveSummary = () => {
  const { isDark } = useTheme();
  const { dateRange } = useDashboardDateFilter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const start = dateRange?.start || null;
        const end   = dateRange?.end   || null;
        const resp = await dashboardAPI.getExecutiveSummary(start, end);
        if (!cancelled) {
          setData(resp.data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message || 'Failed to load summary');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  // ── Theme helpers ──────────────────────────────────────────────────────
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

  // ── Derived view-model ─────────────────────────────────────────────────
  const isLive = !!data?.has_live_data;

  const scorecards = useMemo(() => {
    if (!data?.scorecards) return [];
    const palette = ['blue', 'violet', 'emerald', 'amber'];
    return data.scorecards.map((s, idx) => ({
      label: s.label,
      value: s.value ?? 0,
      change: s.change ?? 0,
      color: palette[idx % palette.length],
      format: s.format || 'currency',
      source: s.source,
    }));
  }, [data]);

  const quarters = data?.quarterly_kpis?.quarters || [];
  const quarterlyRows = data?.quarterly_kpis?.rows || [];
  const pipelineStatus = data?.pipeline_status || [];
  const divisionRevenue = data?.division_revenue || { cp: 0, sanitred: 0, ibos: 0 };
  const revenueByQuarter = data?.revenue_by_quarter || [];
  const yoySales = data?.yoy_sales || [];

  const divisionCards = [
    { name: 'CP (Main)',              color: '#3B82F6', revenue: divisionRevenue.cp,       note: 'Derived: Total − Contractor − Retail', badge: 'Google Sheets' },
    { name: 'Sani-Tred (Retail)',     color: '#10B981', revenue: divisionRevenue.sanitred, note: 'Retail Sales column · sum of quarters', badge: 'Google Sheets' },
    { name: 'I-BOS (Contractor Fee)', color: '#F59E0B', revenue: divisionRevenue.ibos,     note: 'Contractor Revenue · sum of quarters',  badge: 'Google Sheets' },
  ];

  // Division pie = sum across all quarters
  const divisionPieData = [
    { name: 'CP (Main)',          value: divisionRevenue.cp || 0 },
    { name: 'Sani-Tred (Retail)', value: divisionRevenue.sanitred || 0 },
    { name: 'I-BOS (Contractor)', value: divisionRevenue.ibos || 0 },
  ].filter((d) => d.value > 0);

  // AI Insights — built from live numbers
  const insights = useMemo(() => {
    if (!data?.has_live_data) return [
      'Awaiting google_sheets pipeline — run the sheets sync to populate executive KPIs.',
      'Ads scorecards will appear once Meta / Google Ads pipelines have any successful run.',
    ];
    const latestQ = data.latest_quarter || 'latest quarter';
    const tr = (quarterlyRows.find((r) => r.metric === 'Total Revenue') || {});
    const com = (quarterlyRows.find((r) => r.metric === 'Cost of Mistakes') || {});
    const cr  = (quarterlyRows.find((r) => r.metric === 'Contractor Revenue') || {});
    const totalRevenueAllQ = Object.values(tr).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
    return [
      `Combined revenue across ${quarters.length} quarters = ${fmtCurrency(totalRevenueAllQ)} (Google Sheets · TCP MAIN).`,
      com[latestQ] != null
        ? `Cost of Mistakes in ${latestQ}: ${fmtCurrency(com[latestQ])}.`
        : `Cost of Mistakes not reported for ${latestQ}.`,
      cr[latestQ] != null
        ? `Contractor revenue in ${latestQ}: ${fmtCurrency(cr[latestQ])}.`
        : `Contractor revenue for ${latestQ} pending.`,
    ];
  }, [data, quarterlyRows, quarters.length]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className={`animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} size={36} />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>Executive Summary</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={textSecondary}>Combined KPIs from every pipeline — live cross-division performance</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isLive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
              }`}>
                {isLive ? <Wifi size={9} /> : <WifiOff size={9} />}
                {isLive ? 'Live API' : 'No sheet data'}
              </span>
              {lastUpdated && (
                <span className={`text-[11px] ${textSecondary}`}>
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="mb-6 p-3 rounded-lg flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <PageInsight insights={insights} />

        {!isLive && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 rounded-lg flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              No quarterly data from Google Sheets yet. Run the <b>google_sheets</b> pipeline
              to ingest the TCP MAIN tab — the Executive Summary will populate automatically.
            </span>
          </motion.div>
        )}

        {/* Scorecards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {scorecards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {/* AI Insight & Division Health Strip */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          <div className={`lg:col-span-2 rounded-xl p-5 ${cardBg}`} style={{ borderLeft: '4px solid #8B5CF6' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Activity className="text-white" size={14} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-violet-400">Live Summary</span>
            </div>
            <ul className={`text-sm leading-relaxed space-y-2 ${textPrimary}`}>
              {insights.map((ins, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-violet-400">›</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>

          {divisionCards.map((div, idx) => (
            <motion.div key={idx} whileHover={{ y: -2 }}
              className={`rounded-xl p-5 ${cardBg}`} style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: div.color }}>{div.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400">{div.badge}</span>
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{fmtCurrency(div.revenue)}</p>
              <p className={`text-xs mt-1 ${textSecondary}`}>{div.note}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Quarterly KPI Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Quarterly KPI Summary</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">
              Source: Google Sheets · TCP MAIN · {quarters.length} quarter{quarters.length === 1 ? '' : 's'}
            </span>
          </div>
          {quarterlyRows.length === 0 ? (
            <p className={`text-sm ${textSecondary} py-6 text-center`}>
              No quarterly data yet — run the google_sheets pipeline.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                    {quarters.map((q, qIdx) => (
                      <th key={q} className={`text-right py-3 px-4 font-semibold ${
                        qIdx === quarters.length - 1 ? 'text-blue-500' : textSecondary
                      }`}>
                        {q}{qIdx === quarters.length - 1 ? ' ★' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quarterlyRows.map((row, idx) => (
                    <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                      <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                      {quarters.map((q, qIdx) => (
                        <td key={q} className={`text-right py-3 px-4 ${
                          qIdx === quarters.length - 1 ? `font-semibold ${textPrimary}` : textSecondary
                        }`}>
                          {fmtMetricValue(row.metric, row[q])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Charts Row 1: Revenue by Quarter + YOY */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Quarter & Division</h3>
            {revenueByQuarter.length === 0 ? (
              <p className={`text-sm ${textSecondary} py-12 text-center`}>No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueByQuarter}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                  <XAxis dataKey="quarter" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} />
                  <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                  <Legend />
                  <Bar dataKey="cp"         name="CP"         fill="#3B82F6" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="retail"     name="Retail"     fill="#10B981" radius={[0, 0, 0, 0]} stackId="a" />
                  <Bar dataKey="contractor" name="Contractor" fill="#F59E0B" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>YOY Sales Comparison</h3>
            {yoySales.length === 0 ? (
              <p className={`text-sm ${textSecondary} py-12 text-center`}>No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={yoySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                  <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                  <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => `$${(v / 1_000).toFixed(0)}K`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="current"  name="Current year"  fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth={2} />
                  <Line type="monotone" dataKey="previous" name="Previous year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* Charts Row 2: Pipeline Status + Division Pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-1 ${textPrimary}`}>Data Pipeline Status</h3>
            <p className={`text-xs mb-4 ${textSecondary}`}>Live view of which pipelines are feeding this dashboard</p>
            <div className="space-y-3">
              {pipelineStatus.length === 0 && (
                <p className={`text-sm ${textSecondary}`}>No pipeline runs logged yet.</p>
              )}
              {pipelineStatus.map((p) => {
                const isUp = p.status === 'live';
                const color = isUp ? '#10B981' : p.status === 'failed' ? '#EF4444' : '#F59E0B';
                const relative = p.last_run ? new Date(p.last_run).toLocaleString() : 'Never';
                return (
                  <div key={p.name} className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                    <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color, boxShadow: isUp ? `0 0 6px ${color}` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${textPrimary}`}>{p.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                          isUp
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : p.status === 'failed'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}>{p.status}</span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
                        Last run: {relative} · {(p.records ?? 0).toLocaleString()} records
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Division Revenue Breakdown</h3>
            {divisionPieData.length === 0 ? (
              <p className={`text-sm ${textSecondary} py-12 text-center`}>No revenue data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={divisionPieData}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                    {DIVISION_COLORS.map((color, idx) => <Cell key={idx} fill={color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* Executive Performance Summary */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className={`rounded-xl p-6 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Executive Performance Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                  <th className={`text-right py-3 px-4 font-semibold text-blue-500`}>CP (Main)</th>
                  <th className={`text-right py-3 px-4 font-semibold text-emerald-500`}>Sani-Tred (Retail)</th>
                  <th className={`text-right py-3 px-4 font-semibold text-amber-500`}>I-BOS (Contractor)</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${tableBorder} ${tableRowHover}`}>
                  <td className={`py-3 px-4 font-medium ${textPrimary}`}>Revenue · sum of quarters</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.cp)}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.sanitred)}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.ibos)}</td>
                </tr>
                {['Marketing Leads', 'Marketing Spend', 'Cost of Mistakes', 'Training Sign Ups', 'Equipment Sold'].map((name) => {
                  const row = quarterlyRows.find((r) => r.metric === name) || {};
                  const total = quarters.reduce((acc, q) => acc + (typeof row[q] === 'number' ? row[q] : 0), 0);
                  return (
                    <tr key={name} className={`border-b ${tableBorder} ${tableRowHover}`}>
                      <td className={`py-3 px-4 font-medium ${textPrimary}`}>{name} · total</td>
                      <td className={`text-right py-3 px-4 ${textSecondary}`} colSpan={3}>
                        {fmtMetricValue(name, total || null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
};

export default ExecutiveSummary;
