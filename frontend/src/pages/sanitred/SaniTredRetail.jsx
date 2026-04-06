import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
  AreaChart, Area,
} from 'recharts';
import { Filter, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import DateRangePicker from '../../components/common/DateRangePicker';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import PageInsight from '../../components/common/PageInsight';

// ── Retail Channels ────────────────────────────────────────────
const CHANNELS = [
  { id: 'direct', name: 'Direct / Website', color: '#10B981' },
  { id: 'amazon', name: 'Amazon', color: '#FF9900' },
  { id: 'homedepot', name: 'Home Depot', color: '#F26522' },
  { id: 'phone', name: 'Phone Orders', color: '#3B82F6' },
];

const retailData = {
  scorecards: [
    { label: 'Total Retail Revenue', value: 2070000, change: 11.2, color: 'emerald', format: 'currency', sparkData: [1650000, 1720000, 1790000, 1860000, 1930000, 2000000, 2070000] },
    { label: 'Online Orders', value: 3180, change: 18.4, color: 'blue', format: 'number', sparkData: [2200, 2400, 2600, 2800, 2950, 3080, 3180] },
    { label: 'Phone Orders', value: 1100, change: 4.2, color: 'violet', format: 'number', sparkData: [980, 1000, 1020, 1040, 1060, 1080, 1100] },
    { label: 'Avg Order Value', value: 483, change: 6.8, color: 'amber', format: 'currency', sparkData: [420, 435, 445, 455, 465, 475, 483] },
  ],
  channelRevenue: [
    { month: 'Jul', direct: 145000, amazon: 52000, homedepot: 48000, phone: 65000 },
    { month: 'Aug', direct: 152000, amazon: 58000, homedepot: 50000, phone: 65000 },
    { month: 'Sep', direct: 160000, amazon: 62000, homedepot: 52000, phone: 66000 },
    { month: 'Oct', direct: 172000, amazon: 68000, homedepot: 55000, phone: 70000 },
    { month: 'Nov', direct: 180000, amazon: 75000, homedepot: 58000, phone: 67000 },
    { month: 'Dec', direct: 205000, amazon: 85000, homedepot: 62000, phone: 68000 },
    { month: 'Jan', direct: 160000, amazon: 60000, homedepot: 55000, phone: 70000 },
    { month: 'Feb', direct: 168000, amazon: 65000, homedepot: 57000, phone: 70000 },
    { month: 'Mar', direct: 185000, amazon: 72000, homedepot: 60000, phone: 78000 },
  ],
  channelSplit: [
    { name: 'Direct / Website', value: 48, color: '#10B981' },
    { name: 'Amazon', value: 22, color: '#FF9900' },
    { name: 'Home Depot', value: 15, color: '#F26522' },
    { name: 'Phone Orders', value: 15, color: '#3B82F6' },
  ],
  topProducts: [
    { name: 'Sani-Tred PermaFlex', units: 2840, revenue: 480000, growth: 14.2, channel: 'Direct' },
    { name: 'TAV Liquid Rubber', units: 2100, revenue: 380000, growth: 8.5, channel: 'Multi' },
    { name: 'PermaSeal Coating', units: 1650, revenue: 310000, growth: 12.1, channel: 'Direct' },
    { name: 'Basement Waterproof Kit', units: 1200, revenue: 250000, growth: 22.4, channel: 'Amazon' },
    { name: 'PermaFlex Primer', units: 1450, revenue: 180000, growth: 5.8, channel: 'Direct' },
    { name: 'Crack Repair System', units: 980, revenue: 145000, growth: 18.6, channel: 'Home Depot' },
    { name: 'Moisture Barrier Kit', units: 820, revenue: 118000, growth: 28.3, channel: 'Amazon' },
    { name: 'Floor Coating System', units: 680, revenue: 98000, growth: 15.2, channel: 'Direct' },
  ],
  customerInsights: {
    repeatRate: 34,
    avgLifetimeValue: 1420,
    nps: 72,
    reviewScore: 4.6,
  },
  monthlyMetrics: [
    { month: 'Jul', orders: 420, revenue: 310000, returns: 14, avgOrderValue: 738 },
    { month: 'Aug', orders: 445, revenue: 325000, returns: 12, avgOrderValue: 730 },
    { month: 'Sep', orders: 465, revenue: 340000, returns: 15, avgOrderValue: 731 },
    { month: 'Oct', orders: 510, revenue: 365000, returns: 11, avgOrderValue: 716 },
    { month: 'Nov', orders: 525, revenue: 380000, returns: 13, avgOrderValue: 724 },
    { month: 'Dec', orders: 580, revenue: 420000, returns: 16, avgOrderValue: 724 },
    { month: 'Jan', orders: 470, revenue: 345000, returns: 10, avgOrderValue: 734 },
    { month: 'Feb', orders: 490, revenue: 360000, returns: 11, avgOrderValue: 735 },
    { month: 'Mar', orders: 535, revenue: 395000, returns: 12, avgOrderValue: 738 },
  ],
  regionData: [
    { region: 'Southeast', revenue: 520000, orders: 1280, pct: 25 },
    { region: 'Northeast', revenue: 415000, orders: 1020, pct: 20 },
    { region: 'Midwest', revenue: 395000, orders: 960, pct: 19 },
    { region: 'Southwest', revenue: 350000, orders: 850, pct: 17 },
    { region: 'West Coast', revenue: 248000, orders: 610, pct: 12 },
    { region: 'Other', revenue: 142000, orders: 360, pct: 7 },
  ],
};

const SaniTredRetail = () => {
  const { isDark } = useTheme();
  const { handleDateChange, isFiltered, clearFilter } = useDashboardDateFilter();
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
            {isFiltered && (
              <motion.button onClick={clearFilter}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
              >
                <Filter size={10} /> Filtered ✕
              </motion.button>
            )}
            <DateRangePicker onApply={handleDateChange} />
          </div>
        </motion.div>

        {/* Page Insights */}
        <PageInsight insights={[
          'Direct/Website is top channel at 48% revenue share — own-channel strategy is working',
          'Amazon fastest-growing at +22.4% — Basement Waterproof Kit leads Amazon SKUs',
          'NPS of 72 and 4.6 review score signal strong brand loyalty — leverage for upsell',
        ]} />

        {/* Data warning */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl flex items-start gap-3 bg-amber-500/10 border border-amber-500/30">
          <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">⚠ Estimated Data — No Live Pipeline Connected</p>
            <p className="text-xs text-amber-300/80 mt-0.5">Sani-Tred retail channel and order data not yet connected. Channel split, product units, and regional figures shown are estimates — connect the Sani-Tred store pipeline for real data.</p>
          </div>
        </motion.div>

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
          {retailData.scorecards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {activeView === 'overview' && (
          <>
            {/* Customer Insight Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Repeat Customer Rate', value: `${retailData.customerInsights.repeatRate}%`, icon: '↻', color: '#10B981' },
                { label: 'Avg Lifetime Value', value: `$${retailData.customerInsights.avgLifetimeValue}`, icon: '♦', color: '#3B82F6' },
                { label: 'Net Promoter Score', value: retailData.customerInsights.nps, icon: '★', color: '#8B5CF6' },
                { label: 'Avg Review Score', value: `${retailData.customerInsights.reviewScore}/5`, icon: '☆', color: '#F59E0B' },
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
                  <AreaChart data={retailData.channelRevenue}>
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
                    <Pie data={retailData.channelSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                      {retailData.channelSplit.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {retailData.channelSplit.map((ch, idx) => (
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
                    {retailData.monthlyMetrics.map((row, idx) => (
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
                    {retailData.topProducts.map((p, idx) => (
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
                <BarChart data={retailData.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                  <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} width={160} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                  <Bar dataKey="revenue" fill="#10B981" radius={[0, 6, 6, 0]}>
                    {retailData.topProducts.map((_, idx) => (
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
                  <BarChart data={retailData.regionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis dataKey="region" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 11 }} />
                    <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]}>
                      {retailData.regionData.map((_, idx) => (
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
                    <Pie data={retailData.regionData.map((r) => ({ name: r.region, value: r.pct }))} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                      {retailData.regionData.map((_, idx) => (
                        <Cell key={idx} fill={['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'][idx]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {retailData.regionData.map((r, idx) => (
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
                    {retailData.regionData.map((r, idx) => (
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
