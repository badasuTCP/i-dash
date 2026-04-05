import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import ScoreCard from '../components/scorecards/ScoreCard';
import ChartCard from '../components/charts/ChartCard';
import DateRangePicker from '../components/common/DateRangePicker';
import { TrendingUp, DollarSign, Users, Target, BarChart3, Activity } from 'lucide-react';

const ExecutiveDashboard = () => {
  const { isDark } = useTheme();

  const scorecards = [
    { label: 'Combined Total Revenue', value: 8480000, change: 14.2, color: 'blue', format: 'currency', sparkData: [6200000, 6800000, 7100000, 7500000, 7900000, 8200000, 8480000] },
    { label: 'Marketing Spend', value: 237220, change: -5.3, color: 'violet', format: 'currency', sparkData: [245000, 252000, 248000, 242000, 239000, 238000, 237220] },
    { label: 'Total Leads', value: 677, change: 18.5, color: 'emerald', format: 'number', sparkData: [420, 480, 520, 560, 610, 645, 677] },
    { label: 'Cost Per Lead', value: 106.88, change: -12.1, color: 'amber', format: 'currency', sparkData: [135, 128, 122, 118, 114, 110, 106.88] },
  ];

  const quarterlyKPIs = [
    { metric: 'Total Revenue', q1_24: '$1.82M', q2_24: '$2.05M', q3_24: '$2.18M', q4_24: '$2.43M', q1_25: '$2.12M' },
    { metric: 'Contractor Revenue', q1_24: '$680K', q2_24: '$720K', q3_24: '$810K', q4_24: '$890K', q1_25: '$780K' },
    { metric: 'Retail Sales', q1_24: '$420K', q2_24: '$485K', q3_24: '$510K', q4_24: '$560K', q1_25: '$490K' },
    { metric: 'Cost of Mistakes', q1_24: '$12.5K', q2_24: '$9.8K', q3_24: '$8.2K', q4_24: '$7.1K', q1_25: '$6.4K' },
    { metric: 'Training Sign Ups', q1_24: '145', q2_24: '168', q3_24: '192', q4_24: '210', q1_25: '185' },
    { metric: 'Equipment Sold', q1_24: '89', q2_24: '102', q3_24: '118', q4_24: '135', q1_25: '112' },
    { metric: 'YOY Sales %', q1_24: '+8.2%', q2_24: '+12.5%', q3_24: '+15.1%', q4_24: '+18.3%', q1_25: '+14.2%' },
    { metric: 'Marketing Spend', q1_24: '$58K', q2_24: '$62K', q3_24: '$55K', q4_24: '$62.2K', q1_25: '$57K' },
    { metric: 'Marketing Leads', q1_24: '142', q2_24: '168', q3_24: '185', q4_24: '182', q1_25: '165' },
    { metric: 'CPL', q1_24: '$128', q2_24: '$115', q3_24: '$108', q4_24: '$102', q1_25: '$106.88' },
    { metric: 'ROAS', q1_24: '3.1x', q2_24: '3.4x', q3_24: '3.8x', q4_24: '4.1x', q1_25: '3.6x' },
  ];

  const revenueByQuarter = [
    { quarter: 'Q1 2024', cp: 720000, retail: 420000, contractor: 680000 },
    { quarter: 'Q2 2024', cp: 845000, retail: 485000, contractor: 720000 },
    { quarter: 'Q3 2024', cp: 860000, retail: 510000, contractor: 810000 },
    { quarter: 'Q4 2024', cp: 980000, retail: 560000, contractor: 890000 },
    { quarter: 'Q1 2025', cp: 850000, retail: 490000, contractor: 780000 },
  ];

  const yoySales = [
    { month: 'Jan', current: 820000, previous: 710000 },
    { month: 'Feb', current: 780000, previous: 690000 },
    { month: 'Mar', current: 910000, previous: 780000 },
    { month: 'Apr', current: 850000, previous: 740000 },
    { month: 'May', current: 920000, previous: 810000 },
    { month: 'Jun', current: 980000, previous: 850000 },
  ];

  const salesByRep = [
    { name: 'Mike T.', sales: 1250000 },
    { name: 'Sarah K.', sales: 1080000 },
    { name: 'James R.', sales: 980000 },
    { name: 'Linda P.', sales: 870000 },
    { name: 'David W.', sales: 760000 },
    { name: 'Amy C.', sales: 650000 },
  ];

  const performanceSummary = [
    { metric: 'Revenue', cp: '$3.41M', retail: '$2.07M', contractor: '$3.00M' },
    { metric: 'Growth %', cp: '+14.8%', retail: '+11.2%', contractor: '+16.5%' },
    { metric: 'Leads', cp: '285', retail: '180', contractor: '212' },
    { metric: 'Conversion Rate', cp: '4.2%', retail: '3.8%', contractor: '5.1%' },
    { metric: 'ROAS', cp: '3.8x', retail: '3.2x', contractor: '4.1x' },
    { metric: 'Customer Satisfaction', cp: '92%', retail: '88%', contractor: '94%' },
  ];

  const DIVISION_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

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
            <p className={textSecondary}>Combined performance across all divisions</p>
          </div>
          <DateRangePicker onApply={() => {}} />
        </motion.div>

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
              Revenue is up <span className="text-emerald-400 font-semibold">14.2% YoY</span> driven by strong I-BOS contractor growth (+16.5%).
              Cost per lead dropped to <span className="text-emerald-400 font-semibold">$106.88</span>, a 12.1% improvement.
              Consider scaling the top-performing retargeting campaigns which are delivering 5.1x ROAS.
              Sani-Tred's Amazon channel is growing fastest at <span className="text-emerald-400 font-semibold">+22.4%</span>.
            </p>
          </div>

          {/* Division Health Cards */}
          {[
            { name: 'CP', color: '#3B82F6', revenue: '$3.41M', growth: '+14.8%', status: 'Strong' },
            { name: 'Sani-Tred', color: '#10B981', revenue: '$2.07M', growth: '+11.2%', status: 'Steady' },
          ].map((div, idx) => (
            <motion.div key={idx} whileHover={{ y: -2 }}
              className={`rounded-xl p-5 ${cardBg}`} style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: div.color }}>{div.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  div.status === 'Strong' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                }`}>{div.status}</span>
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{div.revenue}</p>
              <p className="text-sm text-emerald-400 font-semibold">{div.growth}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Quarterly KPI Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Quarterly KPI Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q1 2024</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q2 2024</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q3 2024</th>
                  <th className={`text-right py-3 px-4 font-semibold ${textSecondary}`}>Q4 2024</th>
                  <th className={`text-right py-3 px-4 font-semibold text-blue-500`}>Q1 2025</th>
                </tr>
              </thead>
              <tbody>
                {quarterlyKPIs.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q1_24}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q2_24}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q3_24}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.q4_24}</td>
                    <td className={`text-right py-3 px-4 font-semibold ${textPrimary}`}>{row.q1_25}</td>
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
              <BarChart data={revenueByQuarter}>
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
              <ComposedChart data={yoySales}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
                <Legend />
                <Area type="monotone" dataKey="current" name="2025" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="previous" name="2024" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Charts Row 2: Sales by Rep + Marketing Spend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Sales by Business Rep</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByRep} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <YAxis dataKey="name" type="category" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v/1000).toFixed(0)}K`]} />
                <Bar dataKey="sales" fill="url(#salesGradient)" radius={[0, 6, 6, 0]}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#4F46E5" />
                      <stop offset="100%" stopColor="#7C3AED" />
                    </linearGradient>
                  </defs>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
