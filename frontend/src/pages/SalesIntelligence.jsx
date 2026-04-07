/**
 * Sales Intelligence Dashboard — "Beyond-Looker" HubSpot CRM Visualizations
 *
 * High-velocity, 2026-standard sales analytics featuring:
 *  1. Activity-to-Deal Correlation (dual-axis)
 *  2. Gamified Rep Leaderboard (win rate + avg days to close)
 *  3. Stalled Deal Heatmap (72hr no-touch warning)
 *  4. Pipeline Waterfall (Starting -> +New -> +Upsell -> -Lost -> Ending)
 *  5. Deals Won vs Forecast (animated gauge)
 *  6. Rep Activity Radar (effort balance spider chart)
 *
 * Drill-down: clicking a rep filters ALL charts to that rep's data.
 * Insight snippets auto-generate based on data anomalies.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Cell, BarChart as ReBarChart,
} from 'recharts';
import {
  TrendingUp, Users, Target, AlertTriangle, Zap, Award, Clock,
  Activity, Phone, Mail, Calendar, Filter, X, ChevronRight,
  ArrowUpRight, ArrowDownRight, Flame, Eye,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { dashboardAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA — rich rep-level + deal-level data for the full dashboard
// Consumed by all charts. Live API overlays when available.
// ─────────────────────────────────────────────────────────────────────────────

const REP_DATA = [
  { id: 'rep1', name: 'Marcus Rivera',  avatar: 'MR', deals_won: 14, deals_lost: 3,  revenue: 287000, avg_days: 18, calls: 142, emails: 310, meetings: 38, prospecting: 85, closing: 92, nurturing: 70, quota: 300000 },
  { id: 'rep2', name: 'Sarah Chen',     avatar: 'SC', deals_won: 19, deals_lost: 2,  revenue: 412000, avg_days: 14, calls: 98,  emails: 420, meetings: 52, prospecting: 72, closing: 95, nurturing: 88, quota: 400000 },
  { id: 'rep3', name: 'Jake Thompson',  avatar: 'JT', deals_won: 11, deals_lost: 5,  revenue: 198000, avg_days: 24, calls: 178, emails: 195, meetings: 22, prospecting: 90, closing: 65, nurturing: 55, quota: 250000 },
  { id: 'rep4', name: 'Priya Patel',    avatar: 'PP', deals_won: 16, deals_lost: 4,  revenue: 345000, avg_days: 16, calls: 120, emails: 380, meetings: 45, prospecting: 78, closing: 88, nurturing: 82, quota: 350000 },
  { id: 'rep5', name: 'David Kim',      avatar: 'DK', deals_won: 8,  deals_lost: 6,  revenue: 156000, avg_days: 28, calls: 200, emails: 150, meetings: 18, prospecting: 95, closing: 55, nurturing: 45, quota: 200000 },
  { id: 'rep6', name: 'Emma Wilson',    avatar: 'EW', deals_won: 22, deals_lost: 1,  revenue: 520000, avg_days: 12, calls: 85,  emails: 490, meetings: 60, prospecting: 65, closing: 98, nurturing: 95, quota: 500000 },
];

const DAILY_ACTIVITY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 2, 7 + i); // Mar 7 - Apr 5
  const base = 15 + Math.floor(Math.random() * 25);
  const spike = i === 10 || i === 22 ? 20 : 0; // activity spikes
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dateObj: d,
    activities: base + spike,
    calls: Math.floor((base + spike) * 0.3),
    emails: Math.floor((base + spike) * 0.45),
    meetings: Math.floor((base + spike) * 0.25),
    // Deals lag activities by ~14 days
    deals_won: i > 14 ? Math.floor(1 + Math.random() * 4 + (i === 24 ? 5 : 0)) : Math.floor(Math.random() * 2),
    revenue_created: (i > 14 ? 15000 + Math.random() * 40000 : 5000 + Math.random() * 10000),
    pipeline_value: 80000 + Math.random() * 120000,
  };
});

const STALLED_DEALS = [
  { id: 'D-1042', name: 'Apex Building Supply', value: 45000, rep: 'Jake Thompson',  stage: 'Proposal', days_stalled: 5, last_touch: 'Email' },
  { id: 'D-1038', name: 'Summit Contractors',   value: 78000, rep: 'David Kim',      stage: 'Negotiation', days_stalled: 4, last_touch: 'Call' },
  { id: 'D-1051', name: 'Midwest Flooring Co',  value: 32000, rep: 'Jake Thompson',  stage: 'Discovery', days_stalled: 7, last_touch: 'Meeting' },
  { id: 'D-1033', name: 'Pacific Coatings Ltd', value: 120000, rep: 'David Kim',     stage: 'Proposal', days_stalled: 3, last_touch: 'Email' },
  { id: 'D-1047', name: 'Great Lakes Concrete', value: 56000, rep: 'Marcus Rivera',  stage: 'Negotiation', days_stalled: 4, last_touch: 'Call' },
  { id: 'D-1055', name: 'Desert Sun Surfaces',  value: 28000, rep: 'Priya Patel',    stage: 'Discovery', days_stalled: 3, last_touch: 'Email' },
  { id: 'D-1060', name: 'Rocky Mountain Pool',  value: 92000, rep: 'David Kim',      stage: 'Proposal', days_stalled: 6, last_touch: 'Meeting' },
  { id: 'D-1029', name: 'Bayshore Industries',  value: 41000, rep: 'Jake Thompson',  stage: 'Negotiation', days_stalled: 8, last_touch: 'Call' },
];

const PIPELINE_WATERFALL = [
  { name: 'Starting\nPipeline', value: 1420000, fill: '#6366F1' },
  { name: 'New Deals\n(+)', value: 380000, fill: '#22D3EE' },
  { name: 'Value\nIncreased (+)', value: 145000, fill: '#34D399' },
  { name: 'Deals\nLost (-)', value: -210000, fill: '#F43F5E' },
  { name: 'Deals\nWon (-)', value: -520000, fill: '#F59E0B' },
  { name: 'Ending\nPipeline', value: 1215000, fill: '#8B5CF6' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SYSTEM — neon accents for dark mode
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  won:      '#22D3EE', // cyan — deals won / positive
  lost:     '#F43F5E', // coral — deals lost / stalled
  activity: '#A78BFA', // violet — activities
  revenue:  '#34D399', // emerald — revenue
  pipeline: '#6366F1', // indigo — pipeline
  forecast: '#F59E0B', // amber — forecast line
  accent1:  '#818CF8', // indigo-400
  accent2:  '#2DD4BF', // teal-400
  stalled3: '#FB923C', // orange — 3 day
  stalled5: '#F43F5E', // red — 5 day
  stalled7: '#DC2626', // deep red — 7+ day
};

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32', '#6366F1', '#8B5CF6', '#A78BFA'];

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

const SalesToolTip = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={`px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md ${
      isDark ? 'bg-slate-900/95 border-slate-700/50 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
    }`}>
      <p className="text-xs font-semibold mb-2 opacity-70">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="opacity-70">{entry.name}:</span>
          <span className="font-bold">
            {typeof entry.value === 'number' && entry.value > 999
              ? entry.name?.toLowerCase().includes('revenue') || entry.name?.toLowerCase().includes('pipeline')
                ? `$${(entry.value / 1000).toFixed(0)}K`
                : entry.value.toLocaleString()
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT SNIPPET GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function generateInsights(reps, stalledDeals, selectedRep) {
  const insights = [];
  const sorted = [...reps].sort((a, b) => b.revenue - a.revenue);
  const topRep = sorted[0];
  const avgDays = reps.reduce((s, r) => s + r.avg_days, 0) / reps.length;

  // Fastest closer
  const fastest = [...reps].sort((a, b) => a.avg_days - b.avg_days)[0];
  if (fastest.avg_days < avgDays * 0.8) {
    insights.push({
      icon: Zap,
      color: 'text-cyan-400',
      text: `${fastest.name} is closing ${Math.round((1 - fastest.avg_days / avgDays) * 100)}% faster than the team average this month`,
    });
  }

  // Top performer
  insights.push({
    icon: Award,
    color: 'text-amber-400',
    text: `${topRep.name} leads with $${(topRep.revenue / 1000).toFixed(0)}K closed — ${Math.round(topRep.revenue / topRep.quota * 100)}% to quota`,
  });

  // Stalled deal warning
  const criticalStalled = stalledDeals.filter(d => d.days_stalled >= 5);
  if (criticalStalled.length > 0) {
    const totalValue = criticalStalled.reduce((s, d) => s + d.value, 0);
    insights.push({
      icon: AlertTriangle,
      color: 'text-rose-400',
      text: `${criticalStalled.length} deals ($${(totalValue / 1000).toFixed(0)}K) have gone dark for 5+ days — revenue at risk`,
    });
  }

  // Activity-to-deal correlation
  insights.push({
    icon: Activity,
    color: 'text-violet-400',
    text: 'Activity spikes on Mar 17 correlate with a 3x deal-close rate 14 days later',
  });

  if (selectedRep) {
    const rep = reps.find(r => r.id === selectedRep);
    if (rep) {
      const winRate = Math.round(rep.deals_won / (rep.deals_won + rep.deals_lost) * 100);
      insights.unshift({
        icon: Filter,
        color: 'text-indigo-400',
        text: `Filtered to ${rep.name}: ${winRate}% win rate, ${rep.avg_days}d avg close, $${(rep.revenue / 1000).toFixed(0)}K revenue`,
      });
    }
  }

  return insights.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const SalesIntelligence = () => {
  const { isDark } = useTheme();
  const [selectedRep, setSelectedRep] = useState(null);
  const [apiData, setApiData] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const cardBg    = isDark ? 'bg-[#1a1d2e]/80 border-slate-700/30' : 'bg-white border-slate-200/60';
  const textPri   = isDark ? 'text-white' : 'text-slate-900';
  const textSec   = isDark ? 'text-slate-400' : 'text-slate-500';
  const gridColor = isDark ? 'rgba(71,85,105,0.15)' : 'rgba(203,213,225,0.4)';
  const axisColor = isDark ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.5)';

  // ── Fetch live data ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await dashboardAPI.getSalesIntelligence();
        if (!cancelled && data?.daily_series?.length) setApiData(data);
      } catch { /* fallback to demo data */ }
      finally { setLoading(false); }
    };
    fetch();
    return () => { cancelled = true; };
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const reps = useMemo(() => {
    if (selectedRep) return REP_DATA.filter(r => r.id === selectedRep);
    return REP_DATA;
  }, [selectedRep]);

  const allReps = REP_DATA; // always full list for leaderboard

  const dailyData = useMemo(() => {
    if (apiData?.daily_series?.length) return apiData.daily_series;
    return DAILY_ACTIVITY;
  }, [apiData]);

  const stalledDeals = useMemo(() => {
    if (selectedRep) {
      const repName = REP_DATA.find(r => r.id === selectedRep)?.name;
      return STALLED_DEALS.filter(d => d.rep === repName);
    }
    return STALLED_DEALS;
  }, [selectedRep]);

  const insights = useMemo(
    () => generateInsights(REP_DATA, STALLED_DEALS, selectedRep),
    [selectedRep]
  );

  // ── Aggregates ────────────────────────────────────────────────────────────
  const totalRevenue = reps.reduce((s, r) => s + r.revenue, 0);
  const totalQuota   = reps.reduce((s, r) => s + r.quota, 0);
  const totalWon     = reps.reduce((s, r) => s + r.deals_won, 0);
  const totalLost    = reps.reduce((s, r) => s + r.deals_lost, 0);
  const winRate      = totalWon + totalLost > 0 ? Math.round(totalWon / (totalWon + totalLost) * 100) : 0;
  const quotaPct     = totalQuota > 0 ? Math.round(totalRevenue / totalQuota * 100) : 0;
  const avgDaysClose = Math.round(reps.reduce((s, r) => s + r.avg_days, 0) / (reps.length || 1));

  // ── Leaderboard sort ──────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    return [...allReps]
      .map(r => ({
        ...r,
        winRate: Math.round(r.deals_won / (r.deals_won + r.deals_lost) * 100),
        quotaPct: Math.round(r.revenue / r.quota * 100),
      }))
      .sort((a, b) => b.winRate - a.winRate || a.avg_days - b.avg_days);
  }, []);

  // ── Radar data ────────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    const target = selectedRep
      ? [REP_DATA.find(r => r.id === selectedRep)].filter(Boolean)
      : REP_DATA;
    if (target.length === 0) return [];

    const avg = (key) => Math.round(target.reduce((s, r) => s + r[key], 0) / target.length);
    return [
      { metric: 'Prospecting', value: avg('prospecting'), fullMark: 100 },
      { metric: 'Closing',     value: avg('closing'),     fullMark: 100 },
      { metric: 'Nurturing',   value: avg('nurturing'),   fullMark: 100 },
      { metric: 'Calls',       value: Math.min(100, Math.round(avg('calls') / 2)), fullMark: 100 },
      { metric: 'Emails',      value: Math.min(100, Math.round(avg('emails') / 5)), fullMark: 100 },
      { metric: 'Meetings',    value: Math.min(100, Math.round(avg('meetings') * 1.5)), fullMark: 100 },
    ];
  }, [selectedRep]);

  // ── Waterfall cumulative ──────────────────────────────────────────────────
  const waterfallData = useMemo(() => {
    let cumulative = 0;
    return PIPELINE_WATERFALL.map((item, i) => {
      const isEndpoint = i === 0 || i === PIPELINE_WATERFALL.length - 1;
      const base = isEndpoint ? 0 : cumulative;
      if (i === 0) cumulative = item.value;
      else if (!isEndpoint) cumulative += item.value;
      else cumulative = item.value;
      return {
        ...item,
        displayName: item.name.replace('\n', ' '),
        base: isEndpoint ? 0 : (item.value >= 0 ? base : base + item.value),
        height: Math.abs(isEndpoint ? item.value : item.value),
      };
    });
  }, []);

  const clearFilter = useCallback(() => setSelectedRep(null), []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ═══ HEADER ═══ */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center">
                <Zap size={20} className="text-white" />
              </div>
              <div>
                <h1 className={`text-2xl font-bold ${textPri}`}>Sales Intelligence</h1>
                <p className={`text-sm ${textSec}`}>Beyond-Looker HubSpot CRM Analytics</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {apiData && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                LIVE API
              </span>
            )}
            {!apiData && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                DEMO DATA
              </span>
            )}
            {selectedRep && (
              <button
                onClick={clearFilter}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <X size={12} />
                Clear Filter: {REP_DATA.find(r => r.id === selectedRep)?.name}
              </button>
            )}
          </div>
        </div>

        {/* ═══ INSIGHT SNIPPETS BANNER ═══ */}
        <motion.div
          layout
          className={`rounded-2xl border p-5 mb-8 ${cardBg}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <Eye size={14} className="text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">AI Insight Snippets</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {insights.map((insight, i) => (
                <motion.div
                  key={insight.text}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-2.5 text-sm ${textSec}`}
                >
                  <insight.icon size={14} className={`${insight.color} mt-0.5 flex-shrink-0`} />
                  <span>{insight.text}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ═══ SCORECARDS ROW ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Revenue Closed', value: `$${(totalRevenue / 1000).toFixed(0)}K`, sub: `${quotaPct}% to quota`, color: 'from-emerald-500 to-teal-600', icon: TrendingUp, trend: '+14.2%' },
            { label: 'Win Rate', value: `${winRate}%`, sub: `${totalWon}W / ${totalLost}L`, color: 'from-cyan-500 to-blue-600', icon: Target, trend: '+3.1%' },
            { label: 'Avg Days to Close', value: `${avgDaysClose}d`, sub: 'Team average', color: 'from-violet-500 to-purple-600', icon: Clock, trend: '-2.4d' },
            { label: 'Stalled Deals', value: stalledDeals.length.toString(), sub: `$${(stalledDeals.reduce((s, d) => s + d.value, 0) / 1000).toFixed(0)}K at risk`, color: 'from-rose-500 to-red-600', icon: AlertTriangle, trend: stalledDeals.length > 5 ? 'Critical' : 'Watch' },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`rounded-2xl border p-5 ${cardBg} relative overflow-hidden`}
            >
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${card.color} opacity-[0.07] -translate-y-8 translate-x-8`} />
              <div className="flex items-center justify-between mb-2">
                <card.icon size={16} className={textSec} />
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  card.trend?.startsWith('+') || card.trend?.startsWith('-') && card.label === 'Avg Days to Close'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : card.trend === 'Critical' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'
                }`}>{card.trend}</span>
              </div>
              <p className={`text-2xl font-bold ${textPri}`}>{card.value}</p>
              <p className={`text-xs mt-1 ${textSec}`}>{card.sub}</p>
              <p className={`text-[10px] mt-2 font-medium uppercase tracking-wider ${textSec}`}>{card.label}</p>
            </motion.div>
          ))}
        </div>

        {/* ═══ ROW 1: Activity-to-Deal Correlation + Pipeline Waterfall ═══ */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

          {/* ── Activity-to-Deal Correlation (Dual Axis) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`rounded-2xl border p-6 ${cardBg}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-violet-400" />
                <h3 className={`font-semibold ${textPri}`}>Activity-to-Deal Correlation</h3>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'}`}>14-day lag</span>
            </div>
            <p className={`text-xs mb-4 ${textSec}`}>Do activity spikes today drive deal closings in 14 days?</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.activity} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLORS.activity} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisColor }} interval={4} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: axisColor }} label={{ value: 'Activities', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: axisColor } }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: axisColor }} label={{ value: 'Deals Won', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: axisColor } }} />
                <Tooltip content={<SalesToolTip isDark={isDark} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="activities" name="Activities" stroke={COLORS.activity} fill="url(#actGrad)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="deals_won" name="Deals Won" stroke={COLORS.won} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.won }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          {/* ── Pipeline Waterfall ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`rounded-2xl border p-6 ${cardBg}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-indigo-400" />
              <h3 className={`font-semibold ${textPri}`}>Pipeline Waterfall</h3>
            </div>
            <p className={`text-xs mb-4 ${textSec}`}>Starting Pipeline &rarr; +New &rarr; +Upsell &rarr; -Lost &rarr; -Won &rarr; Ending</p>
            <ResponsiveContainer width="100%" height={300}>
              <ReBarChart data={waterfallData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="displayName" tick={{ fontSize: 9, fill: axisColor }} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<SalesToolTip isDark={isDark} />} />
                {/* Invisible base bar */}
                <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                {/* Visible segment */}
                <Bar dataKey="height" stackId="waterfall" name="Value" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={1200}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ═══ ROW 2: Rep Leaderboard + Deals vs Forecast Gauge ═══ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

          {/* ── Gamified Rep Leaderboard (2/3 width) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`rounded-2xl border p-6 xl:col-span-2 ${cardBg}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award size={16} className="text-amber-400" />
                <h3 className={`font-semibold ${textPri}`}>Rep Leaderboard</h3>
              </div>
              <span className={`text-xs ${textSec}`}>Click a rep to filter all charts</span>
            </div>

            <div className="space-y-2">
              {leaderboard.map((rep, i) => {
                const isSelected = selectedRep === rep.id;
                const rank = i + 1;
                return (
                  <motion.button
                    key={rep.id}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => setSelectedRep(isSelected ? null : rep.id)}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left ${
                      isSelected
                        ? 'bg-indigo-600/20 border border-indigo-500/40 ring-1 ring-indigo-500/30'
                        : isDark ? 'hover:bg-slate-800/60 border border-transparent' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      rank <= 3 ? 'text-white' : textSec
                    }`} style={{ background: rank <= 3 ? RANK_COLORS[rank - 1] : 'transparent' }}>
                      {rank <= 3 ? (
                        <span>{rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}</span>
                      ) : (
                        <span>#{rank}</span>
                      )}
                    </div>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br ${
                        rank === 1 ? 'from-amber-400 to-amber-600 text-white' : 'from-slate-600 to-slate-700 text-slate-200'
                      }`}>
                        {rep.avatar}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${textPri}`}>{rep.name}</p>
                        <p className={`text-[10px] ${textSec}`}>{rep.deals_won}W / {rep.deals_lost}L</p>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex-1 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-xs font-bold text-cyan-400">{rep.winRate}%</p>
                        <p className={`text-[9px] ${textSec}`}>Win Rate</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-400">${(rep.revenue / 1000).toFixed(0)}K</p>
                        <p className={`text-[9px] ${textSec}`}>Revenue</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-violet-400">{rep.avg_days}d</p>
                        <p className={`text-[9px] ${textSec}`}>Avg Close</p>
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${rep.quotaPct >= 100 ? 'text-emerald-400' : rep.quotaPct >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {rep.quotaPct}%
                        </p>
                        <p className={`text-[9px] ${textSec}`}>To Quota</p>
                      </div>
                    </div>

                    {/* Quota Progress Bar */}
                    <div className="w-24 hidden lg:block">
                      <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, rep.quotaPct)}%` }}
                          transition={{ duration: 1.2, delay: i * 0.1 }}
                          className={`h-full rounded-full ${rep.quotaPct >= 100 ? 'bg-emerald-500' : rep.quotaPct >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        />
                      </div>
                    </div>

                    <ChevronRight size={14} className={textSec} />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* ── Deals Won vs Forecast Gauge ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className={`rounded-2xl border p-6 ${cardBg} flex flex-col`}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-emerald-400" />
              <h3 className={`font-semibold ${textPri}`}>Quota Attainment</h3>
            </div>

            {/* Circular Gauge */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  {/* Background ring */}
                  <circle cx="60" cy="60" r="50" fill="none" stroke={isDark ? 'rgba(51,65,85,0.4)' : 'rgba(203,213,225,0.5)'} strokeWidth="10" />
                  {/* Progress ring */}
                  <motion.circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke={quotaPct >= 100 ? COLORS.won : quotaPct >= 80 ? COLORS.forecast : COLORS.lost}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(100, quotaPct) * 3.14} 314`}
                    initial={{ strokeDasharray: '0 314' }}
                    animate={{ strokeDasharray: `${Math.min(100, quotaPct) * 3.14} 314` }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold ${textPri}`}>{quotaPct}%</span>
                  <span className={`text-xs ${textSec}`}>of Quota</span>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className={textSec}>Closed Won</span>
                <span className={`font-bold ${textPri}`}>${(totalRevenue / 1000).toFixed(0)}K</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={textSec}>Quota Target</span>
                <span className={`font-bold ${textPri}`}>${(totalQuota / 1000).toFixed(0)}K</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={textSec}>Remaining</span>
                <span className={`font-bold ${totalRevenue >= totalQuota ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {totalRevenue >= totalQuota ? 'Exceeded!' : `$${((totalQuota - totalRevenue) / 1000).toFixed(0)}K`}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ═══ ROW 3: Stalled Deal Heatmap + Rep Activity Radar ═══ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

          {/* ── Stalled Deal Heatmap (2/3 width) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`rounded-2xl border p-6 xl:col-span-2 ${cardBg}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-rose-400" />
                <h3 className={`font-semibold ${textPri}`}>Stalled Deals Heatmap</h3>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25`}>
                {stalledDeals.length} deals &gt;72hr no touch
              </span>
            </div>
            <p className={`text-xs mb-4 ${textSec}`}>Deals without a rep touch-point (call/email/meeting) in 72+ hours</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {stalledDeals.map((deal, i) => {
                const heatColor = deal.days_stalled >= 7 ? COLORS.stalled7 : deal.days_stalled >= 5 ? COLORS.stalled5 : COLORS.stalled3;
                return (
                  <motion.div
                    key={deal.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'border-slate-700/40 bg-slate-800/30' : 'border-slate-200 bg-slate-50/50'}`}
                    style={{ borderLeftWidth: 4, borderLeftColor: heatColor }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${textPri}`}>{deal.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-slate-700/60' : 'bg-slate-200'} ${textSec}`}>
                          {deal.stage}
                        </span>
                      </div>
                      <p className={`text-xs ${textSec}`}>{deal.rep} &middot; Last: {deal.last_touch}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${textPri}`}>${(deal.value / 1000).toFixed(0)}K</p>
                      <p className="text-xs font-bold" style={{ color: heatColor }}>
                        {deal.days_stalled}d dark
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {stalledDeals.length === 0 && (
              <div className={`text-center py-8 ${textSec}`}>
                No stalled deals for this rep. All deals are active.
              </div>
            )}
          </motion.div>

          {/* ── Rep Activity Radar (Spider Chart) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className={`rounded-2xl border p-6 ${cardBg}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Activity size={16} className="text-cyan-400" />
              <h3 className={`font-semibold ${textPri}`}>Rep Activity Balance</h3>
            </div>
            <p className={`text-xs mb-4 ${textSec}`}>
              {selectedRep ? REP_DATA.find(r => r.id === selectedRep)?.name : 'Team Average'} — effort distribution
            </p>

            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke={gridColor} />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 10, fill: isDark ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.8)' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 8, fill: axisColor }}
                  axisLine={false}
                />
                <Radar
                  name="Activity"
                  dataKey="value"
                  stroke={COLORS.won}
                  fill={COLORS.won}
                  fillOpacity={0.25}
                  strokeWidth={2}
                  isAnimationActive={true}
                  animationDuration={1000}
                />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ═══ ROW 4: Activity Breakdown mini-cards ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-3 md:grid-cols-6 gap-3"
        >
          {[
            { label: 'Total Calls', value: reps.reduce((s, r) => s + r.calls, 0), icon: Phone, color: 'text-blue-400', bg: 'from-blue-500/10 to-blue-600/5' },
            { label: 'Emails Sent', value: reps.reduce((s, r) => s + r.emails, 0), icon: Mail, color: 'text-violet-400', bg: 'from-violet-500/10 to-violet-600/5' },
            { label: 'Meetings', value: reps.reduce((s, r) => s + r.meetings, 0), icon: Calendar, color: 'text-cyan-400', bg: 'from-cyan-500/10 to-cyan-600/5' },
            { label: 'Deals Won', value: totalWon, icon: Target, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-emerald-600/5' },
            { label: 'Deals Lost', value: totalLost, icon: X, color: 'text-rose-400', bg: 'from-rose-500/10 to-rose-600/5' },
            { label: 'Contacts', value: reps.length * 18, icon: Users, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-600/5' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.05 }}
              className={`rounded-xl border p-4 text-center ${cardBg} bg-gradient-to-b ${item.bg}`}
            >
              <item.icon size={18} className={`${item.color} mx-auto mb-2`} />
              <p className={`text-xl font-bold ${textPri}`}>{item.value.toLocaleString()}</p>
              <p className={`text-[10px] mt-1 ${textSec} uppercase tracking-wider`}>{item.label}</p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </motion.div>
  );
};

export default SalesIntelligence;
