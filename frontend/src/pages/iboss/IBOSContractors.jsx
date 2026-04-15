import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { HardHat, Globe, TrendingUp, ChevronDown, ChevronUp, DollarSign, Users, Target } from 'lucide-react';
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
  const [tab, setTab] = useState('all'); // all, paid, organic

  // Normalize dates to strings for stable dependency comparison
  const _fmt = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d;
    return d.toISOString().slice(0, 10);
  };
  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = _fmt(dateFrom) || ytdStart;
  const to = _fmt(dateTo) || ytdEnd;

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
  const filtered = useMemo(() => {
    if (tab === 'paid') return contractors.filter(c => c.spend > 100);
    if (tab === 'organic') return contractors.filter(c => c.spend <= 100);
    return contractors;
  }, [contractors, tab]);

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };
  const _clrs = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1'];
  const totalVisits = data?.total_visits || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>Contractor Breakdown</h1>
          <p className={textSec}>I-BOS Division — {contractors.length} contractors · {data?.period || 'Loading...'}</p>
        </motion.div>

        {data?.hasLiveData && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Data · {contractors.length} contractor sites · ${(data?.total_spend || 0).toLocaleString()} total spend
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <ScoreCard label="Total Visits" value={data?.total_visits || 0} change={0} color="amber" format="number" sparkData={[]} />
          <ScoreCard label="Total Ad Spend" value={data?.total_spend || 0} change={0} color="violet" format="currency" sparkData={[]} />
          <ScoreCard label="Total Leads" value={data?.total_leads || 0} change={0} color="emerald" format="number" sparkData={[]} />
          <ScoreCard label="Active Sites" value={contractors.length} change={0} color="blue" format="number" sparkData={[]} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-start">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Traffic Share</h3>
            </div>
            {contractors.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={contractors.slice(0, 10)} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="visits" animationDuration={500}>
                      {contractors.slice(0, 10).map((c, i) => <Cell key={i} fill={c.color || _clrs[i % _clrs.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2 max-h-[200px] overflow-y-auto">
                  {contractors.slice(0, 10).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || _clrs[i % _clrs.length] }} />
                        <span className={`${textSec} truncate`}>{c.name}</span>
                      </div>
                      <span className={`font-medium ${textPri} ml-2`}>{c.visits.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={16} className="text-emerald-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Contractors by Spend</h3>
            </div>
            {contractors.filter(c => c.spend > 0).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.min(contractors.filter(c => c.spend > 50).length * 35, 350)}>
                <BarChart data={contractors.filter(c => c.spend > 50).slice(0, 10)} layout="vertical">
                  <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" width={160} stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${(v || 0).toLocaleString()}`]} />
                  <Bar dataKey="spend" radius={[0, 6, 6, 0]} animationDuration={500}>
                    {contractors.filter(c => c.spend > 50).slice(0, 10).map((c, i) => <Cell key={i} fill={c.color || _clrs[i % _clrs.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className={`text-sm text-center py-16 ${textSec}`}>No spend data for this period</p>
            )}
          </motion.div>
        </div>

        {/* Tab filter */}
        <div className="flex items-center gap-2 mb-4">
          <HardHat size={16} className="text-amber-400" />
          <h3 className={`text-lg font-semibold ${textPri}`}>All Contractors ({filtered.length})</h3>
          <div className="ml-auto flex gap-1">
            {[
              { id: 'all', label: `All (${contractors.length})` },
              { id: 'paid', label: `Paid (${contractors.filter(c => c.spend > 100).length})` },
              { id: 'organic', label: `Organic (${contractors.filter(c => c.spend <= 100).length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.id
                    ? 'bg-amber-500 text-white'
                    : isDark ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Contractor rows — expandable */}
        <div className="space-y-2">
          {filtered.map((c, i) => {
            const isExpanded = expandedId === (c.id || i);
            const pct = totalVisits > 0 ? ((c.visits / totalVisits) * 100).toFixed(1) : 0;
            return (
              <motion.div key={c.id || i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }}
                className={`rounded-xl ${cardBg} overflow-hidden`}
              >
                {/* Row header — always visible */}
                <div className="flex items-center px-5 py-4 cursor-pointer hover:bg-slate-800/10 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : (c.id || i))}>
                  <div className="w-3 h-3 rounded-full mr-3 flex-shrink-0" style={{ backgroundColor: c.color || _clrs[i % _clrs.length] }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${textPri} truncate`}>{c.name}</p>
                  </div>
                  <div className="flex items-center gap-6 text-xs">
                    <div className="text-center w-20">
                      <p className={textSec}>Visits</p>
                      <p className={`font-bold ${textPri}`}>{c.visits.toLocaleString()}</p>
                    </div>
                    <div className="text-center w-20">
                      <p className={textSec}>Spend</p>
                      <p className={`font-bold ${textPri}`}>${c.spend > 0 ? c.spend.toLocaleString() : '—'}</p>
                    </div>
                    <div className="text-center w-16">
                      <p className={textSec}>Leads</p>
                      <p className={`font-bold ${textPri}`}>{c.leads > 0 ? c.leads : '—'}</p>
                    </div>
                    <div className="text-center w-16">
                      <p className={textSec}>Share</p>
                      <p className={`font-bold text-amber-400`}>{pct}%</p>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className={textSec} /> : <ChevronDown size={16} className={textSec} />}
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`px-5 py-4 border-t ${isDark ? 'border-slate-700/30 bg-slate-800/20' : 'border-slate-200 bg-slate-50/50'}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>Sessions</p>
                            <p className={`text-lg font-bold ${textPri}`}>{c.visits.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>Users</p>
                            <p className={`text-lg font-bold ${textPri}`}>{c.users.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>Bounce Rate</p>
                            <p className={`text-lg font-bold ${textPri}`}>{c.bounce_rate}%</p>
                          </div>
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>Ad Spend</p>
                            <p className={`text-lg font-bold ${textPri}`}>${c.spend > 0 ? c.spend.toLocaleString() : '0'}</p>
                          </div>
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>Leads</p>
                            <p className={`text-lg font-bold ${textPri}`}>{c.leads || 0}</p>
                          </div>
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>
                              {c.revenue_source === 'quickbooks' ? 'QB Revenue' : 'Est. Revenue'}
                            </p>
                            <p className={`text-lg font-bold ${c.revenue_source === 'quickbooks' ? 'text-emerald-400' : 'text-amber-400'}`}>
                              ${c.revenue > 0 ? c.revenue.toLocaleString() : '0'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-[10px]">
                          <span className={textSec}>CPL: ${c.cpl > 0 ? c.cpl.toFixed(2) : '—'}</span>
                          <span className={textSec}>Property: {c.property_id}</span>
                          <span className={textSec}>Traffic Share: {pct}%</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default IBOSContractors;
