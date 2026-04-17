import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { HardHat, Globe, TrendingUp, ChevronDown, ChevronUp, DollarSign, Users, Target, RefreshCw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { dashboardAPI } from '../../services/api';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';
import SortableBarChart from '../../components/common/SortableBarChart';
import { useExport } from '../../context/ExportContext';

const IBOSContractors = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const { registerExport, clearExport } = useExport();
  const [data, setData] = useState(null);
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [tab, setTab] = useState('all'); // all, paid, organic
  const [view, setView] = useState('traffic'); // traffic | revenue
  const [sortBy, setSortBy] = useState('visits'); // visits | spend | leads | revenue
  const [sortDir, setSortDir] = useState('desc'); // desc | asc
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  // Exact period-unique reach per contractor id (lazy-loaded from Meta on expand)
  const [exactReach, setExactReach] = useState({});      // { contractorId: number }
  const [exactReachLoading, setExactReachLoading] = useState({}); // { contractorId: bool }

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
      const [bd, rev] = await Promise.all([
        dashboardAPI.getContractorBreakdown(from, to),
        dashboardAPI.getAllContractorsRevenue(from, to, 15).catch(() => ({ data: null })),
      ]);
      setData(bd.data);
      setRevenueData(rev.data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Trigger Meta pipeline re-ingest for the currently selected date range.
  // Used to flush archived-campaign rows and populate account_reach when the
  // numbers drift from Meta Ads Manager.
  const handleSyncMeta = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg('Syncing Meta… this takes ~1-3 min');
    try {
      await dashboardAPI.runMetaPipeline(from, to);
      setSyncMsg('Sync started. Refreshing data in 60s…');
      setTimeout(async () => {
        await fetchData();
        setSyncMsg('Data refreshed. Re-open a card to see new numbers.');
        setTimeout(() => setSyncMsg(''), 5000);
      }, 60000);
    } catch (e) {
      setSyncMsg(`Sync failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSyncing(false);
    }
  }, [syncing, from, to, fetchData]);

  // Fetch exact period-unique reach for a contractor when its card opens.
  const fetchExactReach = useCallback(async (contractorId, metaAccountId) => {
    if (!metaAccountId) return;
    if (exactReach[contractorId] !== undefined) return;      // already loaded
    if (exactReachLoading[contractorId]) return;             // in flight
    setExactReachLoading(prev => ({ ...prev, [contractorId]: true }));
    try {
      const r = await dashboardAPI.getMetaPeriodReach(metaAccountId, from, to);
      setExactReach(prev => ({ ...prev, [contractorId]: r.data?.reach ?? null }));
    } catch {
      setExactReach(prev => ({ ...prev, [contractorId]: null }));
    } finally {
      setExactReachLoading(prev => ({ ...prev, [contractorId]: false }));
    }
  }, [exactReach, exactReachLoading, from, to]);

  // Reset exact-reach cache when the date range changes (old values are stale)
  useEffect(() => {
    setExactReach({});
    setExactReachLoading({});
  }, [from, to]);

  // Register CSV export data based on the current view
  useEffect(() => {
    if (view === 'revenue' && revenueData) {
      const rows = [
        ...(revenueData.top_active || []).map(r => ({ ...r, kind: 'Active' })),
        ...(revenueData.top_inactive || []).map(r => ({ ...r, kind: 'In-Active' })),
      ];
      registerExport({
        title: 'Contractor Breakdown - QB Revenue',
        rows,
        columns: [
          { key: 'kind',    label: 'Status' },
          { key: 'name',    label: 'Contractor' },
          { key: 'revenue', label: 'QB Revenue' },
        ],
      });
    } else if (data?.contractors?.length) {
      registerExport({
        title: 'Contractor Breakdown',
        rows: data.contractors,
        columns: [
          { key: 'name',    label: 'Contractor' },
          { key: 'visits',  label: 'Visits' },
          { key: 'users',   label: 'Users' },
          { key: 'spend',   label: 'Ad Spend' },
          { key: 'leads',   label: 'Leads' },
          { key: 'cpl',     label: 'CPL' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'sources', label: 'Sources' },
        ],
      });
    }
    return () => clearExport();
  }, [view, data, revenueData, registerExport, clearExport]);

  const contractors = data?.contractors || [];
  const filtered = useMemo(() => {
    let base = contractors;
    if (tab === 'paid') base = contractors.filter(c => c.spend > 100);
    else if (tab === 'organic') base = contractors.filter(c => c.spend <= 100);
    // Apply sort
    const arr = [...base];
    arr.sort((a, b) => {
      const av = a[sortBy] || 0;
      const bv = b[sortBy] || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [contractors, tab, sortBy, sortDir]);

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

  // AI Insights — computed from real live data (no hardcoded numbers)
  const insights = useMemo(() => {
    const out = [];
    if (view === 'traffic' && contractors.length) {
      const top = [...contractors].sort((a, b) => b.visits - a.visits)[0];
      if (top && top.visits > 0) {
        const share = totalVisits > 0 ? ((top.visits / totalVisits) * 100).toFixed(1) : '0';
        out.push(`${top.name} drives ${share}% of total traffic (${top.visits.toLocaleString()} visits).`);
      }
      const topSpender = [...contractors].sort((a, b) => b.spend - a.spend)[0];
      if (topSpender && topSpender.spend > 0) {
        const cpl = topSpender.leads > 0 ? (topSpender.spend / topSpender.leads).toFixed(2) : '—';
        out.push(`${topSpender.name} leads ad spend at $${topSpender.spend.toLocaleString()} · CPL $${cpl}.`);
      }
      const noTraffic = contractors.filter(c => c.visits === 0).length;
      if (noTraffic > 0) {
        out.push(`${noTraffic} active contractor${noTraffic > 1 ? 's have' : ' has'} no GA4 traffic this period.`);
      }
    }
    if (view === 'revenue' && revenueData) {
      const rd = revenueData;
      out.push(`QB revenue: $${(rd.grand_total || 0).toLocaleString()} across ${(rd.active_count || 0) + (rd.inactive_count || 0)} customers.`);
      out.push(`Active contractors contribute ${rd.active_pct || 0}% · In-active / past: ${rd.inactive_pct || 0}%.`);
      if (rd.top_active?.[0]) {
        out.push(`Top active: ${rd.top_active[0].name} at $${(rd.top_active[0].revenue || 0).toLocaleString()}.`);
      }
    }
    return out;
  }, [view, contractors, revenueData, totalVisits]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>Contractor Breakdown</h1>
            <p className={textSec}>I-BOS Division — {contractors.length} contractors · {data?.period || 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSyncMeta}
              disabled={syncing}
              title="Re-ingest Meta Ads data for the selected date range so the dashboard matches Meta Ads Manager"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                syncing
                  ? 'bg-slate-400 text-white cursor-not-allowed'
                  : isDark
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-blue-500 hover:bg-blue-400 text-white'
              }`}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Meta'}
            </button>
            <div className={`inline-flex rounded-lg overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <button onClick={() => setView('traffic')} className={`px-4 py-2 text-xs font-semibold transition-all ${view === 'traffic' ? 'bg-amber-500 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600'}`}>
                Traffic & Spend
              </button>
              <button onClick={() => setView('revenue')} className={`px-4 py-2 text-xs font-semibold transition-all ${view === 'revenue' ? 'bg-emerald-500 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600'}`}>
                QB Revenue
              </button>
            </div>
          </div>
        </motion.div>

        {syncMsg && (
          <div className="mb-4 p-3 rounded-lg text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
            {syncMsg}
          </div>
        )}

        {data?.hasLiveData && view === 'traffic' && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Data · {contractors.length} contractor sites · ${(data?.total_spend || 0).toLocaleString()} total spend
          </div>
        )}

        <PageInsight insights={insights} />

        {/* ─── REVENUE VIEW ─── */}
        {view === 'revenue' && revenueData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <ScoreCard label="Total QB Revenue" value={revenueData.grand_total || 0} change={0} color="emerald" format="currency" sparkData={[]} />
              <ScoreCard label="Active Contractors Revenue" value={revenueData.active_total || 0} change={revenueData.active_pct} color="blue" format="currency" sparkData={[]} />
              <ScoreCard label="In-Active Contractors Revenue" value={revenueData.inactive_total || 0} change={revenueData.inactive_pct} color="amber" format="currency" sparkData={[]} />
              <ScoreCard label="Total QB Customers" value={(revenueData.active_count || 0) + (revenueData.inactive_count || 0)} change={0} color="violet" format="number" sparkData={[]} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Top Active Contractors */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={16} className="text-blue-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Top Active Contractors</h3>
                  <span className={`ml-auto text-xs ${textSec}`}>{revenueData.active_count} total</span>
                </div>
                <SortableBarChart
                  data={revenueData.top_active}
                  nameKey="name"
                  metrics={[{ key: 'revenue', label: 'Revenue (QB)', color: '#3B82F6', format: 'currency' }]}
                  emptyMessage="No active contractor revenue"
                />
              </motion.div>

              {/* Top Inactive Contractors */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-amber-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Top In-Active Contractors</h3>
                  <span className={`ml-auto text-xs ${textSec}`}>{revenueData.inactive_count} total</span>
                </div>
                <SortableBarChart
                  data={revenueData.top_inactive}
                  nameKey="name"
                  metrics={[{ key: 'revenue', label: 'Revenue (QB)', color: '#F59E0B', format: 'currency' }]}
                  emptyMessage="No inactive contractor revenue"
                />
              </motion.div>
            </div>

            {/* Split banner */}
            <div className={`mb-8 p-4 rounded-xl ${cardBg}`}>
              <p className={`text-xs ${textSec} mb-2 uppercase tracking-wide`}>Revenue Split</p>
              <div className="flex items-center gap-1 h-8 rounded-lg overflow-hidden">
                <div className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-bold transition-all" style={{ width: `${revenueData.active_pct || 0}%` }}>
                  {revenueData.active_pct >= 10 && `Active ${revenueData.active_pct}%`}
                </div>
                <div className="bg-amber-500 h-full flex items-center justify-center text-white text-xs font-bold transition-all" style={{ width: `${revenueData.inactive_pct || 0}%` }}>
                  {revenueData.inactive_pct >= 10 && `In-Active ${revenueData.inactive_pct}%`}
                </div>
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className={textSec}>Active: ${(revenueData.active_total || 0).toLocaleString()}</span>
                <span className={textSec}>In-Active: ${(revenueData.inactive_total || 0).toLocaleString()}</span>
              </div>
            </div>
          </>
        )}

        {view === 'revenue' && !revenueData && (
          <div className={`p-8 rounded-xl ${cardBg} text-center ${textSec}`}>
            Loading QB revenue data...
          </div>
        )}

        {view === 'traffic' && (
        <>
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
            <SortableBarChart
              data={contractors.filter(c => c.spend > 50)}
              nameKey="name"
              metrics={[
                { key: 'spend',   label: 'Ad Spend', color: '#10B981', format: 'currency' },
                { key: 'leads',   label: 'Leads',    color: '#8B5CF6', format: 'number' },
                { key: 'visits',  label: 'Visits',   color: '#3B82F6', format: 'number' },
              ]}
              emptyMessage="No spend data for this period"
            />
          </motion.div>
        </div>

        {/* Tab filter + Sort controls */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <HardHat size={16} className="text-amber-400" />
          <h3 className={`text-lg font-semibold ${textPri}`}>All Contractors ({filtered.length})</h3>
          {/* Sort dropdown */}
          <div className="ml-auto flex items-center gap-2">
            <label className={`text-xs ${textSec}`}>Sort:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'}`}
            >
              <option value="visits">Visits</option>
              <option value="spend">Ad Spend</option>
              <option value="leads">Leads</option>
              <option value="revenue">Revenue</option>
            </select>
            <button
              onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              className={`px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'}`}
              title={sortDir === 'desc' ? 'High \u2192 Low' : 'Low \u2192 High'}
            >
              {sortDir === 'desc' ? '\u2193' : '\u2191'}
            </button>
            <div className="flex gap-1 ml-2">
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
                  onClick={() => {
                    const nextId = isExpanded ? null : (c.id || i);
                    setExpandedId(nextId);
                    if (nextId && c.meta_account_id) {
                      fetchExactReach(c.id || i, c.meta_account_id);
                    }
                  }}>
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
                        {/* GA4 row */}
                        <p className={`text-[10px] uppercase tracking-wider mb-2 ${textSec}`}>Website (GA4)</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
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
                          <div>
                            <p className={`text-[10px] uppercase ${textSec}`}>CPL</p>
                            <p className={`text-lg font-bold ${textPri}`}>${c.cpl > 0 ? c.cpl.toFixed(2) : '—'}</p>
                          </div>
                        </div>

                        {/* Meta Ads row (only if we have a Meta account linked) */}
                        {c.meta_account_id && (
                          <>
                            <p className={`text-[10px] uppercase tracking-wider mb-2 ${textSec}`}>Meta Ads</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              <div>
                                <p className={`text-[10px] uppercase ${textSec}`}>Ad Spend</p>
                                <p className={`text-lg font-bold ${textPri}`}>${c.spend > 0 ? c.spend.toLocaleString() : '0'}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase ${textSec}`}>Impressions</p>
                                <p className={`text-lg font-bold ${textPri}`}>{(c.impressions || 0).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase ${textSec} flex items-center gap-1`}>
                                  Reach
                                  {exactReachLoading[c.id || i] && (
                                    <RefreshCw size={10} className="animate-spin opacity-60" />
                                  )}
                                  {exactReach[c.id || i] != null && (
                                    <span className="text-[9px] text-emerald-400 normal-case font-normal">(live)</span>
                                  )}
                                </p>
                                <p className={`text-lg font-bold ${textPri}`}>
                                  {(exactReach[c.id || i] ?? c.reach ?? 0).toLocaleString()}
                                </p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase ${textSec}`}>CPM</p>
                                <p className={`text-lg font-bold ${textPri}`}>${(c.cpm || 0).toFixed(2)}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase ${textSec}`}>Frequency</p>
                                <p className={`text-lg font-bold ${textPri}`}>
                                  {(() => {
                                    const liveReach = exactReach[c.id || i];
                                    if (liveReach && liveReach > 0 && c.impressions > 0) {
                                      return (c.impressions / liveReach).toFixed(2);
                                    }
                                    return (c.frequency || 0).toFixed(2);
                                  })()}
                                </p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase ${textSec}`}>CTR</p>
                                <p className={`text-lg font-bold ${textPri}`}>{(c.ctr || 0).toFixed(2)}%</p>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="mt-3 flex items-center gap-4 text-[10px] flex-wrap">
                          <span className={textSec}>Property: {c.property_id || '—'}</span>
                          {c.meta_account_id && <span className={textSec}>Meta Account: {c.meta_account_id}</span>}
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
        </>
        )}
      </div>
    </motion.div>
  );
};

export default IBOSContractors;
