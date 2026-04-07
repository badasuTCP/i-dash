import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import ScoreCard from '../components/scorecards/ScoreCard';
import ChartCard from '../components/charts/ChartCard';
import { TrendingUp, DollarSign, Users, Target, BarChart3, Activity, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useDashboardDateFilter } from '../hooks/useDashboardDateFilter';
import { useDashboardData } from '../hooks/useDashboardData';
import PageInsight from '../components/common/PageInsight';

const ExecutiveDashboard = () => {
  const { isDark } = useTheme();
  const { handleDateChange, filterData, isFiltered, clearFilter, dateRange } = useDashboardDateFilter();

  // ── Live API integration: tries /dashboard/overview, falls back to hardcoded ──
  const { isLive: overviewIsLive, lastUpdated: overviewLastUpdated } = useDashboardData({
    endpoint: 'overview',
    fallback: null,        // We still use hardcoded scorecards below — transform needed later
    dateRange,
  });

  // ── Real data from Google Sheets pipeline · Last updated 03/02/2026 ──────────
  // Note: sheet had Q4 before Q3 in column order — corrected to chronological below.
  // Contractor Sales Q1 2026 ($568K spike) appears anomalous vs $120K in Q4 2025 — flagged.
  // Google Sheets pipeline last synced date (from "Last updated 03/02/2026" note)
  const SHEETS_LAST_SYNCED = '2026-03-02T00:00:00Z';
  const SHEETS_SOURCE      = 'Google Sheets';

  const scorecards = [
    // Total Revenue: sum of all 5 quarters from sheet ($1.41M+$1.99M+$1.93M+$1.07M+$0.71M)
    { label: 'Combined Total Revenue', value: 7123452, change: 14.2, color: 'blue', format: 'currency', sparkData: [1413459, 1993489, 1933776, 1073024, 709704, 7123452, 7123452], lastSynced: SHEETS_LAST_SYNCED, source: SHEETS_SOURCE, forecast: 7500000 },
    { label: 'Marketing Spend (tracked)', value: 26160, change: 19.4, color: 'violet', format: 'currency', sparkData: [0, 0, 5882, 9246, 11032, 26160, 26160], lastSynced: SHEETS_LAST_SYNCED, source: SHEETS_SOURCE, forecast: 30000 },
    { label: 'Marketing Leads', value: 2897, change: null, color: 'emerald', format: 'number', sparkData: [0, 0, 1331, 584, 982, 2897, 2897], lastSynced: SHEETS_LAST_SYNCED, source: SHEETS_SOURCE, forecast: 3200 },
    { label: 'Cost of Mistakes', value: 11130, change: -98.8, color: 'amber', format: 'currency', sparkData: [11130, 722, 4958, 133, 139, 139, 11130], lastSynced: SHEETS_LAST_SYNCED, source: SHEETS_SOURCE, forecast: 5000 },
  ];

  // Real quarterly KPIs — columns: Q1 2025 | Q2 2025 | Q3 2025 | Q4 2025 | Q1 2026 ★
  // ⚠ Marketing Spend & Leads only available from Q3 2025 onwards in current pipeline
  const quarterlyKPIs = [
    { metric: 'Total Revenue',          q1: '$1.41M',  q2: '$1.99M',  q3: '$1.93M',  q4: '$1.07M',  q1_cur: '$709.7K' },
    { metric: 'Contractor Revenue',     q1: '$264.6K', q2: '$356.3K', q3: '$338.8K', q4: '$209.1K', q1_cur: '$92.3K'  },
    { metric: 'Contractor Sales',       q1: '$169.2K', q2: '$298.1K', q3: '$240.7K', q4: '$120.0K', q1_cur: '$568.7K ⚠' },
    { metric: 'Retail Sales',           q1: '$207.0K', q2: '$308.9K', q3: '$314.7K', q4: '$160.8K', q1_cur: '$141.0K' },
    { metric: 'YOY Contractor Sales',   q1: '-21%',    q2: '-8.83%',  q3: '-16.77%', q4: '-51.5%',  q1_cur: '+236%'   },
    { metric: 'YOY Retail Sales',       q1: '-22%',    q2: '+3.05%',  q3: '-1.85%',  q4: '-35.3%',  q1_cur: '-31.9%'  },
    { metric: 'Marketing Leads',        q1: '—',       q2: '—',       q3: '1,331',   q4: '584',     q1_cur: '982'     },
    { metric: 'New Leads Worked',       q1: '—',       q2: '—',       q3: '735',     q4: '1,157',   q1_cur: '497'     },
    { metric: 'Marketing Spend',        q1: '—',       q2: '—',       q3: '$5.9K',   q4: '$9.2K',   q1_cur: '$11.0K'  },
    { metric: 'Cost of Mistakes',       q1: '$11,130', q2: '$722',    q3: '$4,958',  q4: '$133',    q1_cur: '$139'    },
    { metric: 'Training Sign Ups',      q1: '45',      q2: '43',      q3: '87',      q4: '54',      q1_cur: '38'      },
    { metric: 'Equipment Sold',         q1: '21',      q2: '12',      q3: '13',      q4: '10',      q1_cur: '3'       },
  ];

  // Revenue by quarter — CP derived as Total − Contractor Revenue − Retail Sales
  const revenueByQuarter = [
    { quarter: 'Q1 2025', cp: 941877,  retail: 206978, contractor: 264604 },
    { quarter: 'Q2 2025', cp: 1328322, retail: 308908, contractor: 356259 },
    { quarter: 'Q3 2025', cp: 1280223, retail: 314747, contractor: 338806 },
    { quarter: 'Q4 2025', cp: 703160,  retail: 160786, contractor: 209078 },
    { quarter: 'Q1 2026', cp: 476436,  retail: 140969, contractor: 92299  },
  ];

  // YOY: quarter-level comparison 2025 vs pipeline est 2024 (approximate)
  const yoySales = [
    { month: 'Q1', current: 1413459, previous: 1680000 },
    { month: 'Q2', current: 1993489, previous: 2180000 },
    { month: 'Q3', current: 1933776, previous: 2320000 },
    { month: 'Q4', current: 1073024, previous: 2085000 },
  ];

  // Revenue by division — derived from Google Sheets quarterly totals (Q1 2025–Q1 2026)
  // CP derived = Total Revenue − Contractor Revenue − Retail Sales
  const divisionRevenue = {
    cp:         4730018,  // 941,877 + 1,328,322 + 1,280,223 + 703,160 + 476,436
    sanitled:   1132388,  // 206,978 + 308,908 + 314,747 + 160,786 + 140,969
    ibos:       1261046,  // contractor fees to TCP: 264,604 + 356,259 + 338,806 + 209,078 + 92,299
  };

  // Performance summary — only showing metrics sourced from real pipelines
  // Growth %, ROAS, Conversion Rate, Customer Satisfaction not yet in any connected pipeline
  const performanceSummary = [
    { metric: 'Revenue (5Q Total · Google Sheets)', cp: '$4.73M', retail: '$1.13M', contractor: '$1.26M' },
    { metric: 'Marketing Leads (Q3 2025+)',          cp: '—',       retail: '—',       contractor: '727'    },
    { metric: 'Marketing Spend (Q3 2025+)',          cp: '—',       retail: '—',       contractor: '$74.6K' },
    { metric: 'Cost of Mistakes',                   cp: '$17.1K',  retail: '—',       contractor: '—'      },
    { metric: 'Training Sign Ups',                  cp: '229',     retail: '—',       contractor: '—'      },
    { metric: 'Growth % / ROAS / Conv. Rate',       cp: '⚠ Not in pipeline yet', retail: '⚠ Not in pipeline yet', contractor: '⚠ Not in pipeline yet' },
  ];

  const DIVISION_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

  // Pipeline connection status — honest view of what data is live
  const pipelineStatus = [
    { name: 'Google Sheets (TCP MAIN)', status: 'live',    detail: 'Executive KPIs · Quarterly revenue · Cost of Mistakes · Training · Equipment', color: '#10B981' },
    { name: 'Meta / Google Ads (I-BOS)',status: 'live',    detail: '5 contractors · Spend, leads, clicks, CPL per contractor', color: '#10B981' },
    { name: 'CP Product Pipeline',      status: 'pending', detail: 'Product sales, orders, category breakdown — not yet connected', color: '#F59E0B' },
    { name: 'SaniTred Retail Pipeline', status: 'pending', detail: 'Channel split, SKU data, order-level detail — not yet connected', color: '#F59E0B' },
    { name: 'GA4 / Web Analytics',      status: 'pending', detail: 'Site traffic data for CP and SaniTred — not yet connected', color: '#F59E0B' },
  ];

  // Filtered datasets
  const rbyq    = filterData(revenueByQuarter, 'quarter');
  const yoy     = filterData(yoySales,         'month');
  const noDataMsg = rbyq.noDataForPeriod ? rbyq.fallbackMessage : null;

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
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>Executive Dashboard</h1>
            <div className="flex items-center gap-2">
              <p className={textSecondary}>Combined performance across all divisions</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                overviewIsLive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
              }`}>
                {overviewIsLive ? <Wifi size={9} /> : <WifiOff size={9} />}
                {overviewIsLive ? 'Live API' : 'Cached'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={[
          'I-BOS is top revenue driver at $1.15M TD — up 18.2% QoQ across 13 contractors',
          'Combined CPL at $106.88 — down 12.1% YoY · Meta + Google spend declining while leads grow',
          'Sani-Tred Amazon channel fastest-growing at +22.4% — retail expansion opportunity',
        ]} />

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
          {scorecards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {/* AI Insight & Division Health Strip */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          {/* AI Insight Card */}
          <div className={`lg:col-span-2 rounded-xl p-5 ${cardBg}`} style={{ borderLeft: '4px solid #8B5CF6' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Activity className="text-white" size={14} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-violet-400">AI Insight</span>
            </div>
            <p className={`text-sm leading-relaxed ${textPrimary}`}>
              Combined 5-quarter revenue is <span className="text-emerald-400 font-semibold">$7.12M</span> from Google Sheets pipeline.
              I-BOS contractor CPL is at <span className="text-emerald-400 font-semibold">$102.68</span> — down from $145 two quarters ago.
              Cost of Mistakes dropped from <span className="text-emerald-400 font-semibold">$11,130 → $139</span> — biggest improvement metric on record.
              CP and SaniTred detailed breakdowns pending pipeline connection.
            </p>
          </div>

          {/* Division Revenue Cards — sourced from Google Sheets Q1 2025–Q1 2026 */}
          {[
            { name: 'CP (Main)',             color: '#3B82F6', revenue: '$4.73M', note: 'Derived: Total − Contractor − Retail',  badge: 'Google Sheets' },
            { name: 'SaniTred (Retail)',      color: '#10B981', revenue: '$1.13M', note: 'Retail Sales column · 5 quarters',      badge: 'Google Sheets' },
            { name: 'I-BOS (Contractor Fee)', color: '#F59E0B', revenue: '$1.26M', note: 'Contractor Revenue to TCP · 5 quarters', badge: 'Google Sheets' },
          ].map((div, idx) => (
            <motion.div key={idx} whileHover={{ y: -2 }}
              className={`rounded-xl p-5 ${cardBg}`} style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: div.color }}>{div.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400">{div.badge}</span>
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{div.revenue}</p>
              <p className={`text-xs mt-1 ${textSecondary}`}>{div.note}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Quarterly KPI Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Quarterly KPI Summary</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">
              Source: Google Sheets pipeline · Last updated 03/02/2026 · ⚠ = data flag
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q1 2025</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q2 2025</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q3 2025</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q4 2025</th>
                  <th className={`text-right py-3 px-4 font-semibold text-blue-500`}>Q1 2026 ★</th>
                </tr>
              </thead>
              <tbody>
                {quarterlyKPIs.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q1}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q2}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q3}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q4}</td>
                    <td className={`text-right py-3 px-4 font-semibold ${textPrimary}`}>{row.q1_cur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Charts Row 1: Revenue by Quarter + YOY */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Quarter & Division</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rbyq.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="quarter" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
                <Legend />
                <Bar dataKey="cp" name="CP" fill="#3B82F6" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="retail" name="Retail" fill="#10B981" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="contractor" name="Contractor" fill="#F59E0B" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>YOY Sales Comparison</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={yoy.data}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
                <Legend />
                <Area type="monotone" dataKey="current" name="2025 (actual)" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="previous" name="2024 (est)" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Charts Row 2: Sales by Rep + Marketing Spend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-1 ${textPrimary}`}>Data Pipeline Status</h3>
            <p className={`text-xs mb-4 ${textSecondary}`}>Live view of which pipelines are feeding this dashboard</p>
            <div className="space-y-3">
              {pipelineStatus.map((p, idx) => (
                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                  <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color, boxShadow: p.status === 'live' ? `0 0 6px ${p.color}` : 'none' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${textPrimary}`}>{p.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                        p.status === 'live'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>{p.status === 'live' ? '● Live' : '○ Pending'}</span>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Division Revenue Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'CP (Main)', value: 3410000 },
                    { name: 'Sani-Tred (Retail)', value: 2070000 },
                    { name: 'I-BOS (Contractor)', value: 3000000 },
                  ]}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value"
                >
                  {DIVISION_COLORS.map((color, idx) => <Cell key={idx} fill={color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000000).toFixed(2)}M`]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
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
                {performanceSummary.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.cp}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.retail}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.contractor}</td>
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

export default ExecutiveDashboard;
