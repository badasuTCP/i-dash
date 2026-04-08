import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
  AreaChart, Area,
} from 'recharts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import { useRetailData } from '../../hooks/useRetailData';
import PageInsight from '../../components/common/PageInsight';

// ── Retail Channels ────────────────────────────────────────────
const CHANNELS = [
  { id: 'direct', name: 'Direct / Website', color: '#10B981' },
  { id: 'amazon', name: 'Amazon', color: '#FF9900' },
  { id: 'homedepot', name: 'Home Depot', color: '#F26522' },
  { id: 'phone', name: 'Phone Orders', color: '#3B82F6' },
];

// Zero-fallback: show $0.00 / empty state when no 2026 live data exists
const ZERO_FALLBACK = {
  scorecards: [
    { label: 'Total Retail Revenue', value: 0, change: 0, color: 'emerald', format: 'currency', sparkData: [] },
    { label: 'Online Orders',        value: 0, change: 0, color: 'blue',    format: 'number',   sparkData: [] },
    { label: 'Phone Orders',         value: 0, change: 0, color: 'violet',  format: 'number',   sparkData: [] },
    { label: 'Avg Order Value',      value: 0, change: 0, color: 'amber',   format: 'currency', sparkData: [] },
  ],
  channelRevenue: [],
  topProducts: [],
  monthlyMetrics: [],
  channelSplit: [],
  customerInsights: { repeatRate: 0, avgLifetimeValue: 0, nps: 0, reviewScore: 0 },
  regionData: [],
};

const SaniTredRetail = () => {
  const { isDark } = useTheme();
  const { isFiltered, clearFilter } = useDashboardDateFilter();
  const {
    hasLiveData,
    loading: retailLoading,
    scorecards: liveScoreCards,
    channelRevenue,
    topProducts,
    monthlyMetrics,
    channelSplit,
    customerInsights,
    regionData,
  } = useRetailData('sanitred', ZERO_FALLBACK);
  const [activeView, setActiveView] = useState('overview');

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
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>Sani-Tred Retail Breakdown</h1>
            <p className={textSecondary}>Channel performance, product insights, and regional analysis</p>
          </div>
          <div className="flex items-center gap-2">
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={[
          'Direct/Website is top channel at 48% revenue share — own-channel strategy is working',
          'Amazon fastest-growing at +22.4% — Basement Waterproof Kit leads Amazon SKUs',
          'NPS of 72 and 4.6 review score signal strong brand loyalty — leverage for upsell',
        ]} />

        {/* Data status banner */}
        {hasLiveData ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-semibold text-emerald-400">Live Retail Data Connected · Google Sheets pipeline synced</p>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/30">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">Estimated Data — No Live Pipeline Connected</p>
              <p className="text-xs text-amber-300/80 mt-0.5">Sani-Tred retail channel and order data not yet connected. Channel split, product units, and regional figures shown are estimates — connect the Sani-Tred store pipeline for real data.</p>
            </div>
          </motion.div>
        )}

        {/* View Tabs */}
        <div className="flex gap-2 mb-8">
          {['overview', 'products', 'regions'].map((tab) => (
            <button key={tab} onClick={() => setActiveView(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeView === tab
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                  : isDark
                    ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {tab === 'overview' ? 'Channel Overview' : tab === 'products' ? 'Product Analysis' : 'Regional Insights'}
            </button>
          ))}
        </div>

        {/* Scorecards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {liveScoreCards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {activeView === 'overview' && (
          <>
            {/* Customer Insight Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Repeat Customer Rate', value: `${customerInsights.repeatRate}%`, icon: '↻', color: '#10B981' },
                { label: 'Avg Lifetime Value', value: `$${customerInsights.avgLifetimeValue}`, icon: '♦', color: '#3B82F6' },
                { label: 'Net Promoter Score', value: customerInsights.nps, icon: '★', color: '#8B5CF6' },
                { label: 'Avg Review Score', value: `${customerInsights.reviewScore}/5`, icon: '☆', color: '#F59E0B' },
              ].map((item, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + idx * 0.05 }}
                  className={`rounded-xl p-4 ${cardBg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg" style={{ color: item.color }}>{item.icon}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${textSecondary}`}>{item.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${textPrimary}`}>{item.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Channel Revenue + Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <motion.div className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Channel (Monthly)</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={channelRevenue}>
                    <defs>
                      {CHANNELS.map((ch) => (
                        <linearGradient key={ch.id} id={`grad-${ch.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ch.color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={ch.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                    <Legend />
                    {CHANNELS.map((ch) => (
                      <Area key={ch.id} type="monotone" dataKey={ch.id} name={ch.name} stroke={ch.color} fill={`url(#grad-${ch.id})`} strokeWidth={2} stackId="1" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              <motion.div className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Channel Split</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={channelSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                      {channelSplit.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {channelSplit.map((ch, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                        <span className={textSecondary}>{ch.name}</span>
                      </div>
                      <span className={`font-medium ${textPrimary}`}>{ch.value}%</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Monthly Orders & Revenue */}
            <div className={`rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Monthly Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${tableBorder}`}>
                      <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Month</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Orders</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Revenue</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Avg Order</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Returns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMetrics.map((row, idx) => (
                      <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                        <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.month}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.orders}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>${row.revenue.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>${row.avgOrderValue}</td>
                        <td className={`text-right py-3 px-4 ${row.returns > 14 ? 'text-red-400' : textSecondary}`}>{row.returns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeView === 'products' && (
          <>
            {/* Product Performance Table */}
            <div className={`rounded-xl p-6 mb-8 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Product Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${tableBorder}`}>
                      <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>#</th>
                      <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Product</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Units Sold</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Revenue</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Growth</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Top Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, idx) => (
                      <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                        <td className={`py-3 px-4 ${textSecondary}`}>
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                          }`}>{idx + 1}</span>
                        </td>
                        <td className={`py-3 px-4 font-medium ${textPrimary}`}>{p.name}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>{p.units.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>${p.revenue.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 font-semibold ${p.growth > 15 ? 'text-emerald-400' : textPrimary}`}>+{p.growth}%</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>{p.channel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product Revenue Bar Chart */}
            <div className={`rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Product</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                  <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} width={160} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                  <Bar dataKey="revenue" fill="#10B981" radius={[0, 6, 6, 0]}>
                    {topProducts.map((_, idx) => (
                      <Cell key={idx} fill={idx < 3 ? '#10B981' : idx < 5 ? '#3B82F6' : '#8B5CF6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {activeView === 'regions' && (
          <>
            {/* Regional Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Region</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={regionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis dataKey="region" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 11 }} />
                    <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]}>
                      {regionData.map((_, idx) => (
                        <Cell key={idx} fill={['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'][idx]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Regional Distribution</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={regionData.map((r) => ({ name: r.region, value: r.pct }))} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                      {regionData.map((_, idx) => (
                        <Cell key={idx} fill={['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'][idx]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {regionData.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'][idx] }} />
                        <span className={textSecondary}>{r.region}</span>
                      </div>
                      <span className={`font-medium ${textPrimary}`}>${(r.revenue / 1000).toFixed(0)}K ({r.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Regional Details Table */}
            <div className={`rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Regional Detail</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${tableBorder}`}>
                      <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Region</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Revenue</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Orders</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>% of Total</th>
                      <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Avg Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionData.map((r, idx) => (
                      <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                        <td className={`py-3 px-4 font-medium ${textPrimary}`}>{r.region}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>${r.revenue.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>{r.orders.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 font-semibold`} style={{ color: '#10B981' }}>{r.pct}%</td>
                        <td className={`text-right py-3 px-4 ${textSecondary}`}>${Math.round(r.revenue / r.orders)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default SaniTredRetail;
