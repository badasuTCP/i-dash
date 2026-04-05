import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import DateRangePicker from '../../components/common/DateRangePicker';

// ── Contractor data ────────────────────────────────────────────
const CONTRACTORS = [
  {
    id: 'slg',
    name: 'SLG Concrete Coatings',
    shortName: 'SLG',
    color: '#3B82F6',
    ga4Property: 'GA4_PROPERTY_ID_IBOS_SLG',
    scorecards: [
      { label: 'Website Visits', value: 8420, change: 22.3, color: 'blue', format: 'number', sparkData: [5200, 5800, 6400, 7000, 7500, 8000, 8420] },
      { label: 'Ad Spend', value: 12800, change: -4.2, color: 'violet', format: 'currency', sparkData: [14200, 13800, 13500, 13200, 13000, 12900, 12800] },
      { label: 'Leads Generated', value: 78, change: 28.5, color: 'emerald', format: 'number', sparkData: [42, 48, 55, 60, 65, 72, 78] },
      { label: 'Cost Per Lead', value: 164.10, change: -18.8, color: 'amber', format: 'currency', sparkData: [220, 210, 198, 188, 178, 170, 164.10] },
    ],
    webAnalytics: {
      sessions: 8420, pageViews: 24800, bounceRate: 35.2, avgDuration: '3:42',
      topPages: [
        { page: '/services/epoxy-flooring', views: 4200 },
        { page: '/gallery', views: 3100 },
        { page: '/contact', views: 2800 },
        { page: '/about', views: 1900 },
      ],
      trafficSources: [
        { source: 'Google Organic', value: 42, color: '#3B82F6' },
        { source: 'Google Ads', value: 28, color: '#10B981' },
        { source: 'Facebook', value: 18, color: '#8B5CF6' },
        { source: 'Direct', value: 12, color: '#F59E0B' },
      ],
    },
    marketingSpend: [
      { month: 'Oct', google: 1800, meta: 1200, total: 3000 },
      { month: 'Nov', google: 1900, meta: 1100, total: 3000 },
      { month: 'Dec', google: 2100, meta: 1300, total: 3400 },
      { month: 'Jan', google: 1700, meta: 1000, total: 2700 },
      { month: 'Feb', google: 1800, meta: 1100, total: 2900 },
      { month: 'Mar', google: 1900, meta: 1200, total: 3100 },
    ],
    radarScores: { traffic: 78, leads: 85, conversion: 72, retention: 68, satisfaction: 82 },
  },
  {
    id: 'reeves',
    name: 'Reeves Custom Coatings',
    shortName: 'Reeves',
    color: '#10B981',
    ga4Property: 'GA4_PROPERTY_ID_IBOS_REEVES',
    scorecards: [
      { label: 'Website Visits', value: 6250, change: 15.8, color: 'emerald', format: 'number', sparkData: [4100, 4500, 4900, 5300, 5600, 5900, 6250] },
      { label: 'Ad Spend', value: 9500, change: 2.1, color: 'violet', format: 'currency', sparkData: [9100, 9200, 9300, 9350, 9400, 9450, 9500] },
      { label: 'Leads Generated', value: 52, change: 18.2, color: 'blue', format: 'number', sparkData: [32, 36, 40, 44, 47, 50, 52] },
      { label: 'Cost Per Lead', value: 182.69, change: -12.5, color: 'amber', format: 'currency', sparkData: [240, 228, 218, 208, 198, 190, 182.69] },
    ],
    webAnalytics: {
      sessions: 6250, pageViews: 18200, bounceRate: 38.8, avgDuration: '3:18',
      topPages: [
        { page: '/services', views: 3200 },
        { page: '/portfolio', views: 2500 },
        { page: '/contact', views: 2100 },
        { page: '/reviews', views: 1400 },
      ],
      trafficSources: [
        { source: 'Google Organic', value: 38, color: '#3B82F6' },
        { source: 'Google Ads', value: 32, color: '#10B981' },
        { source: 'Facebook', value: 20, color: '#8B5CF6' },
        { source: 'Direct', value: 10, color: '#F59E0B' },
      ],
    },
    marketingSpend: [
      { month: 'Oct', google: 1400, meta: 800, total: 2200 },
      { month: 'Nov', google: 1500, meta: 850, total: 2350 },
      { month: 'Dec', google: 1600, meta: 900, total: 2500 },
      { month: 'Jan', google: 1300, meta: 750, total: 2050 },
      { month: 'Feb', google: 1400, meta: 800, total: 2200 },
      { month: 'Mar', google: 1500, meta: 850, total: 2350 },
    ],
    radarScores: { traffic: 65, leads: 70, conversion: 68, retention: 72, satisfaction: 75 },
  },
  {
    id: 'landshark',
    name: 'Landshark Coatings',
    shortName: 'Landshark',
    color: '#F59E0B',
    ga4Property: 'GA4_PROPERTY_ID_IBOS_LANDSHARK',
    scorecards: [
      { label: 'Website Visits', value: 5180, change: 32.1, color: 'amber', format: 'number', sparkData: [2800, 3200, 3600, 4000, 4400, 4800, 5180] },
      { label: 'Ad Spend', value: 7200, change: 8.5, color: 'violet', format: 'currency', sparkData: [6200, 6400, 6600, 6800, 7000, 7100, 7200] },
      { label: 'Leads Generated', value: 41, change: 42.1, color: 'emerald', format: 'number', sparkData: [18, 22, 27, 31, 35, 38, 41] },
      { label: 'Cost Per Lead', value: 175.61, change: -22.4, color: 'blue', format: 'currency', sparkData: [280, 260, 240, 220, 200, 185, 175.61] },
    ],
    webAnalytics: {
      sessions: 5180, pageViews: 14500, bounceRate: 42.1, avgDuration: '2:55',
      topPages: [
        { page: '/garage-floors', views: 2800 },
        { page: '/residential', views: 2200 },
        { page: '/free-estimate', views: 1900 },
        { page: '/about', views: 1100 },
      ],
      trafficSources: [
        { source: 'Google Organic', value: 35, color: '#3B82F6' },
        { source: 'Google Ads', value: 30, color: '#10B981' },
        { source: 'Facebook', value: 25, color: '#8B5CF6' },
        { source: 'Direct', value: 10, color: '#F59E0B' },
      ],
    },
    marketingSpend: [
      { month: 'Oct', google: 1100, meta: 700, total: 1800 },
      { month: 'Nov', google: 1200, meta: 750, total: 1950 },
      { month: 'Dec', google: 1300, meta: 800, total: 2100 },
      { month: 'Jan', google: 1000, meta: 650, total: 1650 },
      { month: 'Feb', google: 1100, meta: 700, total: 1800 },
      { month: 'Mar', google: 1200, meta: 750, total: 1950 },
    ],
    radarScores: { traffic: 55, leads: 60, conversion: 58, retention: 55, satisfaction: 70 },
  },
  {
    id: 'graber',
    name: 'Graber Design Coatings',
    shortName: 'Graber',
    color: '#8B5CF6',
    ga4Property: 'GA4_PROPERTY_ID_IBOS_GRABER',
    scorecards: [
      { label: 'Website Visits', value: 4950, change: 18.4, color: 'violet', format: 'number', sparkData: [3200, 3500, 3800, 4100, 4400, 4700, 4950] },
      { label: 'Ad Spend', value: 8800, change: -1.5, color: 'amber', format: 'currency', sparkData: [9200, 9100, 9000, 8950, 8900, 8850, 8800] },
      { label: 'Leads Generated', value: 45, change: 25.0, color: 'emerald', format: 'number', sparkData: [25, 28, 32, 36, 39, 42, 45] },
      { label: 'Cost Per Lead', value: 195.56, change: -16.2, color: 'blue', format: 'currency', sparkData: [280, 265, 250, 235, 220, 205, 195.56] },
    ],
    webAnalytics: {
      sessions: 4950, pageViews: 13800, bounceRate: 40.5, avgDuration: '3:05',
      topPages: [
        { page: '/decorative-coatings', views: 2600 },
        { page: '/metallic-epoxy', views: 2100 },
        { page: '/contact', views: 1800 },
        { page: '/gallery', views: 1500 },
      ],
      trafficSources: [
        { source: 'Google Organic', value: 40, color: '#3B82F6' },
        { source: 'Google Ads', value: 25, color: '#10B981' },
        { source: 'Facebook', value: 22, color: '#8B5CF6' },
        { source: 'Direct', value: 13, color: '#F59E0B' },
      ],
    },
    marketingSpend: [
      { month: 'Oct', google: 1300, meta: 900, total: 2200 },
      { month: 'Nov', google: 1400, meta: 950, total: 2350 },
      { month: 'Dec', google: 1500, meta: 1000, total: 2500 },
      { month: 'Jan', google: 1200, meta: 850, total: 2050 },
      { month: 'Feb', google: 1300, meta: 900, total: 2200 },
      { month: 'Mar', google: 1400, meta: 950, total: 2350 },
    ],
    radarScores: { traffic: 60, leads: 65, conversion: 70, retention: 65, satisfaction: 78 },
  },
];

// ── Rankings computation ────────────────────────────────────────
function computeRankings(contractors) {
  const metrics = [
    { key: 'visits', label: 'Website Traffic', getValue: (c) => c.scorecards[0].value, format: 'number', higherBetter: true },
    { key: 'leads', label: 'Leads Generated', getValue: (c) => c.scorecards[2].value, format: 'number', higherBetter: true },
    { key: 'cpl', label: 'Cost Per Lead', getValue: (c) => c.scorecards[3].value, format: 'currency', higherBetter: false },
    { key: 'spend', label: 'Ad Spend', getValue: (c) => c.scorecards[1].value, format: 'currency', higherBetter: false },
    { key: 'growth', label: 'Traffic Growth', getValue: (c) => c.scorecards[0].change, format: 'percent', higherBetter: true },
    { key: 'leadGrowth', label: 'Lead Growth', getValue: (c) => c.scorecards[2].change, format: 'percent', higherBetter: true },
  ];

  return metrics.map((metric) => {
    const sorted = [...contractors].sort((a, b) => {
      const aVal = metric.getValue(a);
      const bVal = metric.getValue(b);
      return metric.higherBetter ? bVal - aVal : aVal - bVal;
    });
    return {
      ...metric,
      rankings: sorted.map((c, idx) => ({
        rank: idx + 1,
        contractor: c.shortName,
        value: metric.getValue(c),
        color: c.color,
      })),
    };
  });
}

const formatRankValue = (val, fmt) => {
  if (fmt === 'currency') return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (fmt === 'percent') return `${val.toFixed(1)}%`;
  return val.toLocaleString();
};

const rankMedals = ['', '', '', ''];

// ── Main Component ──────────────────────────────────────────────
const IBOSContractors = () => {
  const { isDark } = useTheme();
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

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

  const rankings = computeRankings(CONTRACTORS);

  const radarData = [
    { metric: 'Traffic', ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.radarScores.traffic])) },
    { metric: 'Leads', ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.radarScores.leads])) },
    { metric: 'Conversion', ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.radarScores.conversion])) },
    { metric: 'Retention', ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.radarScores.retention])) },
    { metric: 'Satisfaction', ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.radarScores.satisfaction])) },
  ];

  // Aggregate spend for comparison chart
  const spendComparison = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((month, idx) => ({
    month,
    ...Object.fromEntries(CONTRACTORS.map(c => [c.id, c.marketingSpend[idx].total])),
  }));

  const selected = selectedContractor ? CONTRACTORS.find(c => c.id === selectedContractor) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>I-BOS Contractor Breakdown</h1>
            <p className={textSecondary}>Per-contractor marketing spend, web analytics, and performance rankings</p>
          </div>
          <DateRangePicker onApply={() => {}} />
        </motion.div>

        {/* Contractor Selector Tabs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setSelectedContractor(null)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              !selectedContractor
                ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white shadow-lg shadow-orange-500/20'
                : isDark
                  ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            All Contractors
          </button>
          {CONTRACTORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedContractor(c.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                selectedContractor === c.id
                  ? 'text-white shadow-lg'
                  : isDark
                    ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
              style={selectedContractor === c.id ? { background: c.color, boxShadow: `0 8px 20px ${c.color}40` } : {}}
            >
              {c.shortName}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {!selected ? (
            /* ── ALL CONTRACTORS VIEW ───────────────────────────── */
            <motion.div key="all" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              {/* Rankings Section */}
              <div className={`rounded-xl p-6 mb-8 ${cardBg}`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-lg">
                    #
                  </div>
                  <h3 className={`text-lg font-bold ${textPrimary}`}>Contractor Rankings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rankings.map((metric) => (
                    <div key={metric.key} className={`rounded-lg p-4 ${isDark ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
                      <h4 className={`text-sm font-semibold mb-3 ${textSecondary}`}>{metric.label}</h4>
                      <div className="space-y-2">
                        {metric.rankings.map((r) => (
                          <div key={r.contractor} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              r.rank === 1 ? 'bg-amber-500 text-white' : r.rank === 2 ? 'bg-slate-400 text-white' : r.rank === 3 ? 'bg-amber-700 text-white' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {r.rank}
                            </span>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                              <span className={`text-sm font-medium ${textPrimary}`}>{r.contractor}</span>
                            </div>
                            <span className={`text-sm font-semibold ${textPrimary}`}>
                              {formatRankValue(r.value, metric.format)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Radar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <motion.div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Performance Comparison</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={isDark ? 'rgba(148,163,184,0.15)' : 'rgba(203,213,225,0.5)'} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                      {CONTRACTORS.map((c) => (
                        <Radar key={c.id} name={c.shortName} dataKey={c.id} stroke={c.color} fill={c.color} fillOpacity={0.15} strokeWidth={2} />
                      ))}
                      <Legend />
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </motion.div>

                <motion.div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Monthly Marketing Spend</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={spendComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                      <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                      <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                      <Legend />
                      {CONTRACTORS.map((c) => (
                        <Bar key={c.id} dataKey={c.id} name={c.shortName} fill={c.color} radius={[4, 4, 0, 0]} stackId="spend" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </motion.div>
              </div>

              {/* Contractor Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {CONTRACTORS.map((c) => (
                  <motion.div key={c.id} whileHover={{ y: -4 }}
                    className={`rounded-xl p-6 cursor-pointer transition-all ${cardBg}`}
                    onClick={() => setSelectedContractor(c.id)}
                    style={{ borderLeftWidth: 4, borderLeftColor: c.color }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: c.color }}>
                        {c.shortName.charAt(0)}
                      </div>
                      <div>
                        <h4 className={`font-semibold ${textPrimary}`}>{c.name}</h4>
                        <p className={`text-xs ${textSecondary}`}>Click to view full breakdown</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className={`text-xs ${textSecondary}`}>Visits</p>
                        <p className={`text-lg font-bold ${textPrimary}`}>{c.scorecards[0].value.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className={`text-xs ${textSecondary}`}>Leads</p>
                        <p className={`text-lg font-bold ${textPrimary}`}>{c.scorecards[2].value}</p>
                      </div>
                      <div>
                        <p className={`text-xs ${textSecondary}`}>Ad Spend</p>
                        <p className={`text-lg font-bold ${textPrimary}`}>${c.scorecards[1].value.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className={`text-xs ${textSecondary}`}>CPL</p>
                        <p className={`text-lg font-bold ${textPrimary}`}>${c.scorecards[3].value.toFixed(0)}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* ── SINGLE CONTRACTOR VIEW ─────────────────────────── */
            <motion.div key={selected.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              {/* Contractor Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                  style={{ background: selected.color }}>
                  {selected.shortName.charAt(0)}
                </div>
                <div>
                  <h2 className={`text-2xl font-bold ${textPrimary}`}>{selected.name}</h2>
                  <p className={`text-sm ${textSecondary}`}>Detailed performance breakdown</p>
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="flex gap-2 mb-6">
                {['overview', 'web', 'marketing'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab
                        ? 'text-white shadow-lg'
                        : isDark ? 'bg-slate-800/50 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                    }`}
                    style={activeTab === tab ? { background: selected.color } : {}}
                  >
                    {tab === 'overview' ? 'Overview' : tab === 'web' ? 'Web Analytics' : 'Marketing Spend'}
                  </button>
                ))}
              </div>

              {/* Scorecards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {selected.scorecards.map((kpi, idx) => (
                  <ScoreCard key={idx} {...kpi} />
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Traffic Sources Pie */}
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Traffic Sources</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={selected.webAnalytics.trafficSources} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                          {selected.webAnalytics.trafficSources.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {selected.webAnalytics.trafficSources.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className={textSecondary}>{s.source}</span>
                          </div>
                          <span className={`font-medium ${textPrimary}`}>{s.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Pages */}
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Top Pages</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={selected.webAnalytics.topPages} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                        <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                        <YAxis dataKey="page" type="category" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} width={140} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="views" fill={selected.color} radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {activeTab === 'web' && (
                <div className="space-y-6">
                  {/* Web Metrics Summary */}
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Web Analytics Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className={`text-sm ${textSecondary}`}>Sessions</p>
                        <p className={`text-2xl font-bold ${textPrimary}`}>{selected.webAnalytics.sessions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${textSecondary}`}>Page Views</p>
                        <p className={`text-2xl font-bold ${textPrimary}`}>{selected.webAnalytics.pageViews.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${textSecondary}`}>Bounce Rate</p>
                        <p className={`text-2xl font-bold ${textPrimary}`}>{selected.webAnalytics.bounceRate}%</p>
                      </div>
                      <div>
                        <p className={`text-sm ${textSecondary}`}>Avg Duration</p>
                        <p className={`text-2xl font-bold ${textPrimary}`}>{selected.webAnalytics.avgDuration}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Pages */}
                    <div className={`rounded-xl p-6 ${cardBg}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Top Pages</h3>
                      <div className="space-y-3">
                        {selected.webAnalytics.topPages.map((page, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <span className={`w-6 text-center text-sm font-bold ${textSecondary}`}>{idx + 1}</span>
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${textPrimary}`}>{page.page}</p>
                              <div className={`h-2 rounded-full mt-1 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(page.views / selected.webAnalytics.topPages[0].views) * 100}%` }}
                                  transition={{ duration: 1, delay: idx * 0.1 }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: selected.color }}
                                />
                              </div>
                            </div>
                            <span className={`text-sm font-semibold ${textPrimary}`}>{page.views.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Traffic Sources */}
                    <div className={`rounded-xl p-6 ${cardBg}`}>
                      <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Traffic Sources</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={selected.webAnalytics.trafficSources} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                            {selected.webAnalytics.trafficSources.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 mt-2">
                        {selected.webAnalytics.trafficSources.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                              <span className={textSecondary}>{s.source}</span>
                            </div>
                            <span className={`font-medium ${textPrimary}`}>{s.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'marketing' && (
                <div className="space-y-6">
                  {/* Spend Trend */}
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Marketing Spend Trend (Google vs Meta)</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={selected.marketingSpend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                        <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                        <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(1)}K`} />
                        <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`]} />
                        <Legend />
                        <Bar dataKey="google" name="Google Ads" fill="#4285F4" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="meta" name="Meta Ads" fill="#1877F2" radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Spend Summary Table */}
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Monthly Spend Breakdown</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`border-b ${tableBorder}`}>
                            <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Month</th>
                            <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Google Ads</th>
                            <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Meta Ads</th>
                            <th className={`text-right py-3 px-4 font-semibold`} style={{ color: selected.color }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.marketingSpend.map((row, idx) => (
                            <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                              <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.month}</td>
                              <td className={`text-right py-3 px-4 ${textSecondary}`}>${row.google.toLocaleString()}</td>
                              <td className={`text-right py-3 px-4 ${textSecondary}`}>${row.meta.toLocaleString()}</td>
                              <td className={`text-right py-3 px-4 font-semibold ${textPrimary}`}>${row.total.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default IBOSContractors;
