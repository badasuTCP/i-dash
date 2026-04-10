import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { HardHat, Globe, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { dashboardAPI } from '../../services/api';
import ScoreCard from '../../components/scorecards/ScoreCard';

const IBOSContractors = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = dateFrom || ytdStart;
  const to = dateTo || ytdEnd;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await dashboardAPI.getContractorBreakdown(from, to);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const contractors = data?.contractors || [];
  const totalVisits = data?.total_visits || 0;
  const totalUsers = data?.total_users || 0;

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };

  // Top 10 for pie chart
  const pieData = useMemo(() => contractors.slice(0, 10).map(c => ({
    name: c.name, value: c.visits, color: c.color,
  })), [contractors]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>Contractor Breakdown</h1>
          <p className={textSec}>I-BOS Division — per-contractor web traffic and performance · {data?.period || 'Loading...'}</p>
        </motion.div>

        {data?.hasLiveData && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live GA4 Data · {contractors.length} contractor sites
          </div>
        )}

        {/* KPI Scorecards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <ScoreCard label="Total Visits" value={totalVisits} change={0} color="amber" format="number" sparkData={[]} />
          <ScoreCard label="Total Users" value={totalUsers} change={0} color="blue" format="number" sparkData={[]} />
          <ScoreCard label="Active Sites" value={contractors.length} change={0} color="emerald" format="number" sparkData={[]} />
          <ScoreCard label="Avg Bounce Rate" value={contractors.length > 0 ? Math.round(contractors.reduce((s, c) => s + c.bounce_rate, 0) / contractors.length) : 0} change={0} color="violet" format="percent" sparkData={[]} />
        </div>

        {/* Traffic Distribution + Top Sites */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-start">
          {/* Pie Chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Traffic Distribution</h3>
            </div>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" animationDuration={500}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [(v || 0).toLocaleString() + ' visits']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2 max-h-[240px] overflow-y-auto">
                  {pieData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className={`${textSec} truncate`}>{s.name}</span>
                      </div>
                      <span className={`font-medium ${textPri} flex-shrink-0 ml-2`}>{s.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={`text-sm text-center py-16 ${textSec}`}>No data for this period</p>
            )}
          </motion.div>

          {/* Bar Chart — Top 10 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-blue-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Contractor Sites by Visits</h3>
            </div>
            {contractors.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(250, Math.min(contractors.slice(0, 10).length * 32, 400))}>
                <BarChart data={contractors.slice(0, 10)} layout="vertical">
                  <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} />
                  <YAxis dataKey="name" type="category" width={180} stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                  <Bar dataKey="visits" radius={[0, 6, 6, 0]} animationDuration={500}>
                    {contractors.slice(0, 10).map((c, i) => <Cell key={i} fill={c.color || '#F59E0B'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className={`text-sm text-center py-16 ${textSec}`}>No data for this period</p>
            )}
          </motion.div>
        </div>

        {/* Individual Contractor Cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <HardHat size={16} className="text-amber-400" />
            <h3 className={`text-lg font-semibold ${textPri}`}>All Contractors ({contractors.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contractors.map((c, i) => {
              const isExpanded = expandedId === c.id;
              const pct = totalVisits > 0 ? ((c.visits / totalVisits) * 100).toFixed(1) : 0;
              return (
                <motion.div key={c.id || i}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                  className={`rounded-xl p-4 ${cardBg} cursor-pointer hover:shadow-lg transition-shadow`}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || '#F59E0B' }} />
                      <span className={`text-sm font-semibold ${textPri} truncate`}>{c.name}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className={textSec} /> : <ChevronDown size={14} className={textSec} />}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className={`text-[10px] uppercase ${textSec}`}>Visits</p>
                      <p className={`text-lg font-bold ${textPri}`}>{c.visits.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase ${textSec}`}>Users</p>
                      <p className={`text-lg font-bold ${textPri}`}>{c.users.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase ${textSec}`}>Share</p>
                      <p className={`text-lg font-bold ${textPri}`}>{pct}%</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      className="mt-3 pt-3 border-t border-slate-700/20 grid grid-cols-2 gap-2">
                      <div>
                        <p className={`text-[10px] uppercase ${textSec}`}>Bounce Rate</p>
                        <p className={`text-sm font-semibold ${textPri}`}>{c.bounce_rate}%</p>
                      </div>
                      <div>
                        <p className={`text-[10px] uppercase ${textSec}`}>Property ID</p>
                        <p className={`text-sm font-mono ${textSec}`}>{c.property_id}</p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default IBOSContractors;
