import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart, Area,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import DateRangePicker from '../../components/common/DateRangePicker';
import { AlertTriangle, TrendingUp, TrendingDown, Award, Users, Globe, DollarSign } from 'lucide-react';

// ── REAL Contractor Data (from live Looker / GA4 / Google Sheets) ──────────
const CONTRACTORS = [
  {
    id: 'beckley',
    name: 'Beckley Concrete Decor',
    alias: 'Concrete Transformations',
    shortName: 'Beckley',
    color: '#3B82F6',
    spend: 37749,
    leads: 290,
    clicks: 87728,
    cpl: 130.17,
    revenue: 392470,
    cpc: 1.10,
    roas: 47,
    visits: 5300,
    totalVisitors: 4700,
    avgEngagement: '1:14',
    revenuePerLead: 1353,
    dataFlag: null,
  },
  {
    id: 'tailored',
    name: 'Tailored Concrete Coatings',
    alias: null,
    shortName: 'Tailored',
    color: '#10B981',
    spend: 15887,
    leads: 275,
    clicks: 29097,
    cpl: 57.77,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 5400,
    totalVisitors: 4700,
    avgEngagement: '2:13',
    revenuePerLead: 0,
    dataFlag: 'Revenue data missing — possible tracking gap. 275 leads with $0 attributed revenue.',
  },
  {
    id: 'slg',
    name: 'SLG Concrete Coatings',
    alias: null,
    shortName: 'SLG',
    color: '#F59E0B',
    spend: 11328,
    leads: 42,
    clicks: 13388,
    cpl: 269.72,
    revenue: 47790,
    cpc: 0.99,
    roas: 40,
    visits: 10200,
    totalVisitors: 9400,
    avgEngagement: '1:17',
    revenuePerLead: 1138,
    dataFlag: null,
  },
  {
    id: 'columbus',
    name: 'Columbus Concrete Coatings',
    alias: 'Greg Haber',
    shortName: 'Columbus',
    color: '#8B5CF6',
    spend: 5180,
    leads: 10,
    clicks: 87260,
    cpl: 518.00,
    revenue: 113720,
    cpc: 1.14,
    roas: 26,
    visits: 71800,
    totalVisitors: 53800,
    avgEngagement: '2:08',
    revenuePerLead: 11372,
    dataFlag: 'CPL of $518 is high — clicks are strong (87K) but conversion to leads needs attention.',
  },
  {
    id: 'tvs',
    name: 'TVS Coatings',
    alias: null,
    shortName: 'TVS',
    color: '#EF4444',
    spend: 4502,
    leads: 16,
    clicks: 10995,
    cpl: 281.36,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 0,
    totalVisitors: 0,
    avgEngagement: '—',
    revenuePerLead: 0,
    dataFlag: 'No revenue attributed. Verify CRM handoff for TVS leads.',
  },
  {
    id: 'eminence',
    name: 'Eminence',
    alias: null,
    shortName: 'Eminence',
    color: '#06B6D4',
    spend: 0,
    leads: 3,
    clicks: 0,
    cpl: 0,
    revenue: 330770,
    cpc: null,
    roas: null,
    visits: 0,
    totalVisitors: 0,
    avgEngagement: '—',
    revenuePerLead: 110257,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'permasurface',
    name: 'PermaSurface',
    alias: null,
    shortName: 'PermaSurface',
    color: '#84CC16',
    spend: 0,
    leads: 2,
    clicks: 0,
    cpl: 0,
    revenue: 156330,
    cpc: null,
    roas: null,
    visits: 0,
    totalVisitors: 0,
    avgEngagement: '—',
    revenuePerLead: 78165,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'diamond',
    name: 'Diamond Topcoat',
    alias: null,
    shortName: 'Diamond',
    color: '#EC4899',
    spend: 0,
    leads: 89,
    clicks: 0,
    cpl: 0,
    revenue: 113730,
    cpc: null,
    roas: null,
    visits: 0,
    totalVisitors: 0,
    avgEngagement: '—',
    revenuePerLead: 1278,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'floorwarriors',
    name: 'Floor Warriors',
    alias: null,
    shortName: 'Floor Warriors',
    color: '#F97316',
    spend: 0,
    leads: 0,
    clicks: 0,
    cpl: 0,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 7300,
    totalVisitors: 6500,
    avgEngagement: '1:05',
    revenuePerLead: 0,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'graber',
    name: 'Graber Design Coatings',
    alias: null,
    shortName: 'Graber',
    color: '#7C3AED',
    spend: 0,
    leads: 0,
    clicks: 0,
    cpl: 0,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 85,
    totalVisitors: 54,
    avgEngagement: '8:33',
    revenuePerLead: 0,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'decorative',
    name: 'Decorative Concrete Idaho',
    alias: 'decorativeconcreteidaho.com',
    shortName: 'Dec. Idaho',
    color: '#0EA5E9',
    spend: 0,
    leads: 0,
    clicks: 0,
    cpl: 0,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 9500,
    totalVisitors: 7800,
    avgEngagement: '2:23',
    revenuePerLead: 0,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'reeves',
    name: 'Reeves Concrete Solutions',
    alias: 'reevesconcretesolutions.com',
    shortName: 'Reeves',
    color: '#64748B',
    spend: 0,
    leads: 0,
    clicks: 0,
    cpl: 0,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 1928,
    totalVisitors: 1806,
    avgEngagement: '1:10',
    revenuePerLead: 0,
    dataFlag: null,
    organic: true,
  },
  {
    id: 'elitepool',
    name: 'Elite Pool Coatings',
    alias: null,
    shortName: 'Elite Pool',
    color: '#2DD4BF',
    spend: 0,
    leads: 0,
    clicks: 0,
    cpl: 0,
    revenue: 0,
    cpc: null,
    roas: null,
    visits: 21,
    totalVisitors: 17,
    avgEngagement: '18:02',
    revenuePerLead: 0,
    dataFlag: null,
    organic: true,
  },
];

// ── Quarterly lead velocity (real trend shape from Looker) ──────
const LEAD_VELOCITY = [
  { quarter: 'Q2 2025', beckley: 60, tailored: 80, slg: 8, columbus: 2, tvs: 4, diamond: 14, other: 2 },
  { quarter: 'Q3 2025', tailored: 40, beckley: 38, slg: 12, columbus: 3, tvs: 5, diamond: 22, other: 1 },
  { quarter: 'Q4 2025', beckley: 90, tailored: 95, slg: 10, columbus: 2, tvs: 4, diamond: 30, other: 1 },
  { quarter: 'Q1 2026', beckley: 72, tailored: 60, slg: 12, columbus: 3, tvs: 3, diamond: 23, other: 1 },
];

// ── Totals ─────────────────────────────────────────────────────
const TOTALS = {
  spend: 74646,
  leads: 727,
  clicks: 228468,
  cpl: 102.68,
  revenue: 1154810,
  visits: 109000,
  totalVisitors: 86300,
  newVisitors: 71400,
  returning: 14900,
};

// ── Helpers ────────────────────────────────────────────────────
const fmt = (v, type) => {
  if (v === null || v === undefined) return '—';
  if (type === 'currency') return v === 0 ? '$0' : `$${v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (type === 'cpl') return v === 0 ? '$0' : `$${v.toFixed(2)}`;
  if (type === 'number') return v === 0 ? '0' : v.toLocaleString();
  if (type === 'visits') return v === 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString();
  return v;
};

const getCPLColor = (cpl) => {
  if (cpl === 0) return '#06B6D4'; // organic — teal
  if (cpl < 80) return '#10B981';  // excellent
  if (cpl < 150) return '#3B82F6'; // good
  if (cpl < 250) return '#F59E0B'; // ok
  return '#EF4444';                // high
};

const getRevenueBarColor = (revenue, idx) => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16', '#F97316'];
  return colors[idx % colors.length];
};

// ── Custom tooltip ─────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={`px-4 py-3 rounded-xl shadow-xl text-sm ${isDark ? 'bg-slate-900 border border-slate-700/50 text-white' : 'bg-white border border-slate-200 text-slate-900'}`}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' && p.value > 1000 ? `$${(p.value / 1000).toFixed(1)}K` : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────
const IBOSContractors = () => {
  const { isDark } = useTheme();
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortBy, setSortBy] = useState('revenue');

  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const cardBgAlt = isDark ? 'bg-[#161929] border border-slate-700/20' : 'bg-slate-50 border border-slate-100';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';
  const tableBorder = isDark ? 'border-slate-700/30' : 'border-slate-200';
  const tableRowHover = isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.97)' : '#fff',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.6)'}`,
    borderRadius: '10px',
    color: isDark ? '#e2e8f0' : '#1e293b',
    fontSize: 12,
  };

  // Paid contractors only (for efficiency charts)
  const paidContractors = CONTRACTORS.filter(c => c.spend > 0);

  // Web-active contractors
  const webContractors = CONTRACTORS.filter(c => c.visits > 0)
    .sort((a, b) => b.visits - a.visits);

  // Revenue contributors
  const revenueContractors = CONTRACTORS.filter(c => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // Website breakdown for donut
  const webBreakdown = webContractors.map(c => ({
    name: c.shortName,
    value: c.visits,
    color: c.color,
  }));

  // Scatter: CTR vs Spend (paid only)
  const scatterData = paidContractors.map(c => ({
    name: c.shortName,
    x: c.spend,
    y: c.clicks > 0 ? ((c.leads / c.clicks) * 100) : 0,
    z: c.leads,
    color: c.color,
  }));

  const selected = selectedContractor ? CONTRACTORS.find(c => c.id === selectedContractor) : null;
  const dataFlags = CONTRACTORS.filter(c => c.dataFlag);

  const sortedContractors = useMemo(() => {
    return [...CONTRACTORS].sort((a, b) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      if (sortBy === 'leads') return b.leads - a.leads;
      if (sortBy === 'spend') return b.spend - a.spend;
      if (sortBy === 'visits') return b.visits - a.visits;
      if (sortBy === 'cpl') {
        // 0 (organic) goes last
        if (a.cpl === 0 && b.cpl === 0) return 0;
        if (a.cpl === 0) return 1;
        if (b.cpl === 0) return -1;
        return a.cpl - b.cpl;
      }
      return 0;
    });
  }, [sortBy]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className={`text-3xl font-bold ${textPrimary}`}>I-BOS Contractor Breakdown</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {CONTRACTORS.length} Contractors
              </span>
            </div>
            <p className={textSecondary}>Marketing spend, web analytics, lead performance & revenue contribution per contractor</p>
          </div>
          <DateRangePicker onApply={() => {}} />
        </motion.div>

        {/* ── Top KPI Strip ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Total Marketing Spend', value: `$${(TOTALS.spend / 1000).toFixed(1)}K`, icon: DollarSign, color: '#3B82F6' },
            { label: 'Total Revenue TD', value: `$${(TOTALS.revenue / 1000000).toFixed(2)}M`, icon: TrendingUp, color: '#10B981' },
            { label: 'Total Leads', value: TOTALS.leads.toLocaleString(), icon: Users, color: '#F59E0B' },
            { label: 'Avg CPL', value: `$${TOTALS.cpl}`, icon: Award, color: '#8B5CF6' },
            { label: 'Total Web Visits', value: `${(TOTALS.visits / 1000).toFixed(0)}K`, icon: Globe, color: '#EC4899' },
          ].map((kpi, idx) => (
            <motion.div key={idx} whileHover={{ y: -2 }}
              className={`rounded-xl p-4 ${cardBg}`}
              style={{ borderTop: `3px solid ${kpi.color}` }}>
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon size={14} style={{ color: kpi.color }} />
                <span className={`text-[10px] font-bold uppercase tracking-wide ${textSecondary}`}>{kpi.label}</span>
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{kpi.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Data Quality Flags ── */}
        {dataFlags.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="mb-8 space-y-2">
            {dataFlags.map((c) => (
              <div key={c.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-amber-400 font-semibold text-sm">{c.name}: </span>
                  <span className={`text-sm ${textSecondary}`}>{c.dataFlag}</span>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Contractor Selector ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedContractor(null)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              !selectedContractor
                ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white shadow-lg shadow-orange-500/20'
                : isDark ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            All Contractors
          </button>
          {CONTRACTORS.map((c) => (
            <button key={c.id} onClick={() => { setSelectedContractor(c.id); setActiveTab('overview'); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 relative ${
                selectedContractor === c.id
                  ? 'text-white shadow-lg'
                  : isDark ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
              style={selectedContractor === c.id ? { background: c.color, boxShadow: `0 4px 14px ${c.color}50` } : {}}
            >
              {c.shortName}
              {c.organic && <span className="ml-1 text-[9px] opacity-70">○</span>}
              {c.dataFlag && <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-slate-900" />}
            </button>
          ))}
          <span className={`self-center text-[10px] ${textSecondary}`}>○ = organic (no paid spend)</span>
        </motion.div>

        <AnimatePresence mode="wait">
          {!selected ? (
            /* ══════════════ ALL CONTRACTORS VIEW ══════════════ */
            <motion.div key="all" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* Campaign Performance Leaderboard */}
              <div className={`rounded-xl p-6 mb-8 ${cardBg}`}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className={`text-lg font-bold ${textPrimary}`}>Contractors Campaign Performance Leaderboard</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textSecondary}`}>Sort by:</span>
                    {['revenue', 'leads', 'spend', 'visits', 'cpl'].map(s => (
                      <button key={s} onClick={() => setSortBy(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          sortBy === s ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white' : isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                        {s === 'cpl' ? 'CPL ↑' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b ${tableBorder}`}>
                        <th className={`text-left py-3 px-3 font-semibold ${textSecondary}`}>#</th>
                        <th className={`text-left py-3 px-3 font-semibold ${textSecondary}`}>Contractor</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Spend</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Leads</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>CPL</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Clicks</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Web Visits</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Revenue TD</th>
                        <th className={`text-right py-3 px-3 font-semibold ${textSecondary}`}>Rev/Lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedContractors.map((c, idx) => (
                        <motion.tr key={c.id} layout
                          className={`border-b ${tableBorder} ${tableRowHover} cursor-pointer transition-colors`}
                          onClick={() => { setSelectedContractor(c.id); setActiveTab('overview'); }}>
                          <td className={`py-3 px-3 ${textSecondary}`}>
                            <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold ${
                              idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                            }`}>{idx + 1}</span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                              <div>
                                <span className={`font-semibold ${textPrimary}`}>{c.name}</span>
                                {c.alias && <span className={`text-xs ml-1 ${textSecondary}`}>({c.alias})</span>}
                                {c.organic && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-400">ORGANIC</span>}
                                {c.dataFlag && <AlertTriangle size={12} className="inline ml-1 text-amber-400" />}
                              </div>
                            </div>
                          </td>
                          <td className={`text-right py-3 px-3 font-medium ${c.spend > 0 ? textPrimary : textSecondary}`}>
                            {c.spend > 0 ? fmt(c.spend, 'currency') : <span className="text-cyan-400 text-xs font-bold">ORGANIC</span>}
                          </td>
                          <td className="text-right py-3 px-3">
                            <span className={`font-bold ${c.leads > 100 ? 'text-emerald-400' : c.leads > 20 ? 'text-blue-400' : textSecondary}`}>
                              {c.leads}
                            </span>
                          </td>
                          <td className="text-right py-3 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold text-white"
                              style={{ background: getCPLColor(c.cpl) }}>
                              {c.cpl > 0 ? `$${c.cpl.toFixed(2)}` : c.organic ? '—' : '$0'}
                            </span>
                          </td>
                          <td className={`text-right py-3 px-3 ${textSecondary}`}>{fmt(c.clicks, 'number') || '—'}</td>
                          <td className={`text-right py-3 px-3 ${textSecondary}`}>{fmt(c.visits, 'visits')}</td>
                          <td className="text-right py-3 px-3">
                            <span className={`font-bold ${c.revenue > 100000 ? 'text-emerald-400' : c.revenue > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {c.revenue > 0 ? fmt(c.revenue, 'currency') : <span className="text-xs text-red-400">No data</span>}
                            </span>
                          </td>
                          <td className={`text-right py-3 px-3 ${textSecondary}`}>
                            {c.revenuePerLead > 0 ? `$${c.revenuePerLead.toLocaleString()}` : '—'}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts Row 1: CPL Efficiency + Revenue by Contractor */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* CPL Efficiency Leaderboard */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>CPL Efficiency Leaderboard</h3>
                  <p className={`text-xs mb-4 ${textSecondary}`}>Lower is better. Organic contractors excluded.</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={paidContractors.sort((a,b) => a.cpl - b.cpl)} layout="vertical" margin={{ left: 10, right: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.5)'} />
                      <XAxis type="number" stroke={isDark ? '#475569' : '#94a3b8'} tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="shortName" type="category" stroke={isDark ? '#475569' : '#94a3b8'} width={70} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toFixed(2)}`, 'Cost Per Lead']} />
                      <Bar dataKey="cpl" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', formatter: v => `$${v.toFixed(2)}` }}>
                        {paidContractors.sort((a,b) => a.cpl - b.cpl).map((c) => (
                          <Cell key={c.id} fill={getCPLColor(c.cpl)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Revenue Contribution */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Revenue Generated to Date</h3>
                  <p className={`text-xs mb-4 ${textSecondary}`}>Includes organic & paid. Total: ${(TOTALS.revenue / 1000000).toFixed(2)}M</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={revenueContractors} layout="vertical" margin={{ left: 10, right: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.5)'} />
                      <XAxis type="number" stroke={isDark ? '#475569' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="shortName" type="category" stroke={isDark ? '#475569' : '#94a3b8'} width={75} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`, 'Revenue']} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b', formatter: v => `$${(v/1000).toFixed(0)}K` }}>
                        {revenueContractors.map((c, i) => (
                          <Cell key={c.id} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Charts Row 2: Lead Velocity + Marketing Spend vs Leads */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Lead Velocity Trend */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Contractor Lead Velocity Trend</h3>
                  <p className={`text-xs mb-4 ${textSecondary}`}>Leads by quarter across top contractors</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={LEAD_VELOCITY}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.5)'} />
                      <XAxis dataKey="quarter" stroke={isDark ? '#475569' : '#94a3b8'} tick={{ fontSize: 11 }} />
                      <YAxis stroke={isDark ? '#475569' : '#94a3b8'} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="beckley" name="Beckley" fill="#3B82F6" radius={[3,3,0,0]} />
                      <Bar dataKey="tailored" name="Tailored" fill="#10B981" radius={[3,3,0,0]} />
                      <Bar dataKey="diamond" name="Diamond" fill="#EC4899" radius={[3,3,0,0]} />
                      <Bar dataKey="slg" name="SLG" fill="#F59E0B" radius={[3,3,0,0]} />
                      <Bar dataKey="columbus" name="Columbus" fill="#8B5CF6" radius={[3,3,0,0]} />
                      <Bar dataKey="tvs" name="TVS" fill="#EF4444" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Marketing Spend vs Leads Scatter */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Marketing Efficiency Matrix</h3>
                  <p className={`text-xs mb-4 ${textSecondary}`}>Spend vs. Lead Conversion Rate. Bubble size = total leads.</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.5)'} />
                      <XAxis dataKey="x" name="Spend" stroke={isDark ? '#475569' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} label={{ value: 'Ad Spend', position: 'insideBottom', offset: -5, fontSize: 11, fill: isDark ? '#64748b' : '#94a3b8' }} />
                      <YAxis dataKey="y" name="Lead Rate" stroke={isDark ? '#475569' : '#94a3b8'} tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 11 }} label={{ value: 'Lead Conv. %', angle: -90, position: 'insideLeft', fontSize: 11, fill: isDark ? '#64748b' : '#94a3b8' }} />
                      <ZAxis dataKey="z" range={[40, 400]} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className={`px-4 py-3 rounded-xl shadow-xl text-xs ${isDark ? 'bg-slate-900 border border-slate-700/50 text-white' : 'bg-white border border-slate-200 text-slate-900'}`}>
                              <p className="font-bold mb-1">{d.name}</p>
                              <p>Spend: ${d.x.toLocaleString()}</p>
                              <p>Lead Conv.: {d.y.toFixed(2)}%</p>
                              <p>Total Leads: {d.z}</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={scatterData}>
                        {scatterData.map((d, i) => (
                          <Cell key={i} fill={d.color} fillOpacity={0.85} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Charts Row 3: Web Traffic Breakdown + Engagement Quality */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Web Traffic Donut */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Website Breakdown by Total Visits</h3>
                  <p className={`text-xs mb-2 ${textSecondary}`}>Columbus dominates at 65.9% of all contractor traffic</p>
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie data={webBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                          {webBreakdown.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v.toLocaleString()} visits`]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {webBreakdown.map((w, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: w.color }} />
                            <span className={textSecondary}>{w.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} style={{ width: 60 }}>
                              <div className="h-full rounded-full" style={{ width: `${(w.value / TOTALS.visits) * 100}%`, background: w.color }} />
                            </div>
                            <span className={`font-semibold w-12 text-right ${textPrimary}`}>{fmt(w.value, 'visits')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Engagement Quality */}
                <div className={`rounded-xl p-6 ${cardBg}`}>
                  <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Engagement Quality by Contractor</h3>
                  <p className={`text-xs mb-4 ${textSecondary}`}>Avg engagement time per visit — higher = deeper content interaction</p>
                  <div className="space-y-3">
                    {webContractors.filter(c => c.avgEngagement !== '—').map((c, idx) => {
                      const mins = parseInt(c.avgEngagement.split(':')[0]);
                      const secs = parseInt(c.avgEngagement.split(':')[1]);
                      const totalSecs = mins * 60 + secs;
                      const maxSecs = 18 * 60 + 2; // Elite Pool
                      const pct = (totalSecs / maxSecs) * 100;
                      return (
                        <div key={c.id} className="flex items-center gap-3">
                          <div className="w-20 flex-shrink-0">
                            <span className={`text-xs font-medium ${textSecondary}`}>{c.shortName}</span>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className={`h-6 rounded-md flex-1 relative overflow-hidden ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 1, delay: idx * 0.08 }}
                                className="h-full rounded-md flex items-center px-2"
                                style={{ background: `linear-gradient(90deg, ${c.color}cc, ${c.color})` }}
                              >
                                <span className="text-[10px] font-bold text-white/90">{c.avgEngagement}</span>
                              </motion.div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Revenue per Lead Comparison */}
              <div className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-base font-bold mb-1 ${textPrimary}`}>Revenue per Lead by Contractor</h3>
                <p className={`text-xs mb-4 ${textSecondary}`}>How much revenue is attributed per lead generated. Organic powerhouses (Eminence, PermaSurface) standout significantly.</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={CONTRACTORS.filter(c => c.revenuePerLead > 0).sort((a,b) => b.revenuePerLead - a.revenuePerLead)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis dataKey="shortName" stroke={isDark ? '#475569' : '#94a3b8'} tick={{ fontSize: 11 }} />
                    <YAxis stroke={isDark ? '#475569' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toLocaleString()}`, 'Revenue per Lead']} />
                    <Bar dataKey="revenuePerLead" radius={[6, 6, 0, 0]}>
                      {CONTRACTORS.filter(c => c.revenuePerLead > 0).sort((a,b) => b.revenuePerLead - a.revenuePerLead).map((c) => (
                        <Cell key={c.id} fill={c.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          ) : (
            /* ══════════════ SINGLE CONTRACTOR DRILLDOWN ══════════════ */
            <motion.div key={selected.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Contractor Header Bar */}
              <div className={`rounded-xl p-5 mb-6 ${cardBg} flex flex-col md:flex-row md:items-center gap-4`}
                style={{ borderLeft: `5px solid ${selected.color}` }}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                    style={{ background: selected.color }}>
                    {selected.shortName.charAt(0)}
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${textPrimary}`}>{selected.name}</h2>
                    {selected.alias && <p className={`text-sm ${textSecondary}`}>{selected.alias}</p>}
                    {selected.organic && <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/20 text-cyan-400">ORGANIC — No paid spend</span>}
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <p className={`text-xs ${textSecondary}`}>Spend</p>
                    <p className={`font-bold ${textPrimary}`}>{selected.spend > 0 ? fmt(selected.spend, 'currency') : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-xs ${textSecondary}`}>Leads</p>
                    <p className={`font-bold ${textPrimary}`}>{selected.leads}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-xs ${textSecondary}`}>Revenue TD</p>
                    <p className={`font-bold ${selected.revenue > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {selected.revenue > 0 ? fmt(selected.revenue, 'currency') : 'No data'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className={`text-xs ${textSecondary}`}>Web Visits</p>
                    <p className={`font-bold ${textPrimary}`}>{fmt(selected.visits, 'visits')}</p>
                  </div>
                </div>
              </div>

              {/* Data flag if present */}
              {selected.dataFlag && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-6">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className={`text-sm ${textSecondary}`}><span className="text-amber-400 font-semibold">Data Quality Note: </span>{selected.dataFlag}</p>
                </div>
              )}

              {/* Sub-tabs */}
              <div className="flex gap-2 mb-6">
                {['overview', 'web', 'marketing'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      activeTab === tab ? 'text-white shadow-lg' : isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-500'
                    }`}
                    style={activeTab === tab ? { background: selected.color } : {}}>
                    {tab === 'overview' ? 'Overview' : tab === 'web' ? 'Web Analytics' : 'Marketing Spend'}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Marketing Spend', value: selected.spend > 0 ? `$${selected.spend.toLocaleString()}` : 'Organic', sub: 'Total invested' },
                    { label: 'Leads Generated', value: selected.leads, sub: `CPL: ${selected.cpl > 0 ? '$' + selected.cpl.toFixed(2) : '—'}` },
                    { label: 'Revenue to Date', value: selected.revenue > 0 ? fmt(selected.revenue, 'currency') : 'No data', sub: `Rev/Lead: ${selected.revenuePerLead > 0 ? '$' + selected.revenuePerLead.toLocaleString() : '—'}` },
                    { label: 'Web Visits', value: fmt(selected.visits, 'visits'), sub: `Avg engagement: ${selected.avgEngagement}` },
                    { label: 'Total Clicks', value: selected.clicks > 0 ? selected.clicks.toLocaleString() : '—', sub: `CPC: ${selected.cpc ? '$' + selected.cpc : '—'}` },
                    { label: 'Returning Visitors', value: selected.totalVisitors > 0 ? selected.totalVisitors.toLocaleString() : '—', sub: 'GA4 reported' },
                    { label: 'ROAS', value: selected.roas ? selected.roas + '%' : '—', sub: 'Return on ad spend' },
                    { label: 'CPL Efficiency', value: selected.cpl > 0 ? (selected.cpl < 100 ? '🟢 Excellent' : selected.cpl < 200 ? '🔵 Good' : '🔴 High') : selected.organic ? '🟣 Organic' : '—', sub: `$${selected.cpl > 0 ? selected.cpl.toFixed(2) : '—'} per lead` },
                  ].map((item, idx) => (
                    <motion.div key={idx} className={`rounded-xl p-4 ${cardBg}`} whileHover={{ y: -2 }}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary} mb-1`}>{item.label}</p>
                      <p className={`text-xl font-bold ${textPrimary}`}>{item.value}</p>
                      <p className={`text-xs mt-1 ${textSecondary}`}>{item.sub}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {activeTab === 'web' && (
                <div className="space-y-6">
                  <div className={`rounded-xl p-6 ${cardBg}`}>
                    <h3 className={`text-base font-bold mb-4 ${textPrimary}`}>Web Presence Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div><p className={`text-xs ${textSecondary}`}>Total Visits</p><p className={`text-2xl font-bold ${textPrimary}`}>{fmt(selected.visits, 'visits')}</p></div>
                      <div><p className={`text-xs ${textSecondary}`}>Total Visitors</p><p className={`text-2xl font-bold ${textPrimary}`}>{fmt(selected.totalVisitors, 'visits')}</p></div>
                      <div><p className={`text-xs ${textSecondary}`}>Avg Engagement</p><p className={`text-2xl font-bold ${textPrimary}`}>{selected.avgEngagement}</p></div>
                      <div><p className={`text-xs ${textSecondary}`}>Share of I-BOS Traffic</p>
                        <p className={`text-2xl font-bold ${textPrimary}`}>{selected.visits > 0 ? ((selected.visits / TOTALS.visits) * 100).toFixed(1) + '%' : '—'}</p>
                      </div>
                    </div>
                  </div>
                  {selected.visits === 0 && (
                    <div className={`rounded-xl p-8 text-center ${cardBgAlt}`}>
                      <Globe size={40} className="mx-auto mb-3 text-slate-500" />
                      <p className={`font-semibold ${textPrimary}`}>No web analytics data connected</p>
                      <p className={`text-sm mt-1 ${textSecondary}`}>GA4 property not yet configured or no traffic recorded for this contractor.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'marketing' && (
                <div className="space-y-6">
                  {selected.spend === 0 ? (
                    <div className={`rounded-xl p-8 text-center ${cardBgAlt}`}>
                      <DollarSign size={40} className="mx-auto mb-3 text-cyan-400" />
                      <p className={`font-semibold text-cyan-400`}>Organic Contractor</p>
                      <p className={`text-sm mt-1 ${textSecondary}`}>This contractor has no paid marketing spend on record. Revenue ({fmt(selected.revenue, 'currency')}) is attributed to organic sources, referrals, or direct sales activity.</p>
                    </div>
                  ) : (
                    <div className={`rounded-xl p-6 ${cardBg}`}>
                      <h3 className={`text-base font-bold mb-4 ${textPrimary}`}>Marketing Spend Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div><p className={`text-xs ${textSecondary}`}>Total Spend</p><p className={`text-2xl font-bold ${textPrimary}`}>${selected.spend.toLocaleString()}</p></div>
                        <div><p className={`text-xs ${textSecondary}`}>Total Clicks</p><p className={`text-2xl font-bold ${textPrimary}`}>{selected.clicks.toLocaleString()}</p></div>
                        <div><p className={`text-xs ${textSecondary}`}>Cost Per Lead</p><p className={`text-2xl font-bold`} style={{ color: getCPLColor(selected.cpl) }}>${selected.cpl.toFixed(2)}</p></div>
                        <div><p className={`text-xs ${textSecondary}`}>CPC</p><p className={`text-2xl font-bold ${textPrimary}`}>{selected.cpc ? '$' + selected.cpc : '—'}</p></div>
                      </div>
                    </div>
                  )}
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
