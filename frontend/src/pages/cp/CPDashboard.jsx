import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { CheckCircle2, AlertCircle, TrendingUp, Users, Globe, DollarSign } from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';

const CPDashboard = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = dateFrom || ytdStart;
  const to = dateTo || ytdEnd;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await dashboardAPI.getBrandSummary('cp', from, to);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };
  const _clrs = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>CP Overview</h1>
          <p className={textSec}>The Concrete Protector — Executive summary across Web, Marketing & Sales</p>
        </motion.div>

        {/* Status banner */}
        {data?.hasLiveData ? (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <CheckCircle2 size={14} /> Live Data · {data.period}
          </div>
        ) : !loading && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
            <AlertCircle size={14} /> Awaiting pipeline sync
          </div>
        )}

        {/* KPI Scorecards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {(data?.scorecards || []).map((kpi, i) => (
            <ScoreCard key={i} {...kpi} change={0} sparkData={[]} />
          ))}
        </div>

        {/* Row 2: Traffic Trend + Top Reps */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Traffic Trend — 2/3 width */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-blue-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Web Traffic Trend</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.traffic_trend || []}>
                <defs>
                  <linearGradient id="cpTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                <Area type="monotone" dataKey="visits" stroke="#3B82F6" fill="url(#cpTrendGrad)" strokeWidth={2} dot={false} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Top Reps — 1/3 width */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-violet-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Sales Reps</h3>
            </div>
            <div className="space-y-3">
              {(data?.top_reps || []).map((rep, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-amber-700 text-white'
                      : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                    }`}>{i + 1}</span>
                    <span className={`text-sm font-medium ${textPri}`}>{rep.name}</span>
                  </div>
                  <span className={`text-sm font-semibold ${textSec}`}>{(rep.deals || 0).toLocaleString()} deals</span>
                </div>
              ))}
              {(data?.top_reps || []).length === 0 && (
                <p className={`text-sm ${textSec}`}>Run HubSpot pipeline to populate</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Row 3: Top Websites + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Websites pie */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-emerald-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top CP Websites by Users</h3>
            </div>
            {(data?.top_websites || []).length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.top_websites} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="users" animationDuration={500}>
                      {data.top_websites.map((e, i) => <Cell key={i} fill={e.color || _clrs[i % _clrs.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [(v || 0).toLocaleString() + ' users']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2 max-h-[200px] overflow-y-auto">
                  {data.top_websites.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || _clrs[i % _clrs.length] }} />
                        <span className={`${textSec} truncate`}>{s.name}</span>
                      </div>
                      <span className={`font-medium ${textPri} flex-shrink-0 ml-2`}>{(s.users || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={`text-sm ${textSec} text-center py-16`}>Run GA4 pipeline to populate</p>
            )}
          </motion.div>

          {/* Quick stats grid */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Key Metrics at a Glance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Web Sessions', value: (data?.web?.visits || 0).toLocaleString(), sub: `${(data?.web?.users || 0).toLocaleString()} unique users` },
                { label: 'Bounce Rate', value: `${data?.web?.bounce_rate || 0}%`, sub: 'avg across all sites' },
                { label: 'Ad Clicks', value: (data?.ads?.clicks || 0).toLocaleString(), sub: `${(data?.ads?.impressions || 0).toLocaleString()} impressions` },
                { label: 'Ad Leads', value: (data?.ads?.leads || 0).toLocaleString(), sub: `$${((data?.ads?.spend || 0) / Math.max(data?.ads?.leads || 1, 1)).toFixed(0)} CPL` },
                { label: 'HubSpot Deals', value: (data?.crm?.deals || 0).toLocaleString(), sub: `${data?.crm?.deals_won || 0} won` },
                { label: 'Meetings', value: (data?.crm?.meetings || 0).toLocaleString(), sub: `${(data?.crm?.contacts || 0).toLocaleString()} contacts` },
              ].map((m, i) => (
                <div key={i} className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${textSec}`}>{m.label}</p>
                  <p className={`text-xl font-bold ${textPri}`}>{m.value}</p>
                  <p className={`text-[10px] mt-0.5 ${textSec}`}>{m.sub}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default CPDashboard;
