import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { HardHat, Globe, TrendingUp, ChevronDown, ChevronUp, DollarSign, Users, Target, Zap, X, GitCompareArrows } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { dashboardAPI } from '../../services/api';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';
import SortableBarChart from '../../components/common/SortableBarChart';
import { useExport } from '../../context/ExportContext';

// ─────────────────────────────────────────────────────────────────────────
// High-signal pill toggle — Traffic & Spend vs QB Revenue, with a live
// revenue teaser under the Revenue side so execs know what's behind the click.
// ─────────────────────────────────────────────────────────────────────────
const ViewToggle = ({ view, setView, isDark, revenueTotal }) => {
  const isRevenue = view === 'revenue';
  const formatRev = (v) => {
    const n = Number(v) || 0;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };
  const shellBg = isDark ? 'bg-slate-900/70 border border-slate-700/60' : 'bg-slate-100 border border-slate-200';
  return (
    <div className={`relative inline-flex items-center rounded-full p-1 ${shellBg} backdrop-blur-md shadow-sm`}
         style={{ minWidth: '360px' }}>
      {/* Animated slider */}
      <motion.div
        className={`absolute top-1 bottom-1 rounded-full ${
          isRevenue
            ? 'bg-gradient-to-r from-emerald-500 to-amber-500 shadow-lg shadow-emerald-500/30'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
        }`}
        initial={false}
        animate={{ left: isRevenue ? '50%' : '0.25rem', right: isRevenue ? '0.25rem' : '50%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      />
      {/* Traffic & Spend */}
      <button
        onClick={() => setView('traffic')}
        className={`relative z-10 flex-1 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
          !isRevenue ? 'text-white' : isDark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        <Globe size={14} />
        <span>Traffic &amp; Spend</span>
      </button>
      {/* QB Revenue */}
      <button
        onClick={() => setView('revenue')}
        className={`relative z-10 flex-1 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex flex-col items-center justify-center leading-tight ${
          isRevenue ? 'text-white' : isDark ? 'text-emerald-300' : 'text-emerald-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <DollarSign size={14} />
          <span>QB Revenue</span>
        </div>
        {revenueTotal > 0 && (
          <span className={`text-[10px] font-bold tracking-wide mt-0.5 ${isRevenue ? 'text-white/90' : isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
            {formatRev(revenueTotal)}
          </span>
        )}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// KPI Anchors — four colored tiles acting as the page's visual header.
// Blue=Visits, Violet=Spend, Emerald=Leads, Amber=Sites.
// ─────────────────────────────────────────────────────────────────────────
const KPIAnchors = ({ isDark, textPri, textSec, stats, live }) => {
  const palette = {
    blue:    { bg: isDark ? 'from-blue-500/15 to-blue-500/5'       : 'from-blue-50 to-blue-100/60',        border: 'border-blue-500/40',    ring: 'bg-blue-500',    text: 'text-blue-400',    shadow: 'shadow-blue-500/10' },
    violet:  { bg: isDark ? 'from-violet-500/15 to-violet-500/5'   : 'from-violet-50 to-violet-100/60',    border: 'border-violet-500/40',  ring: 'bg-violet-500',  text: 'text-violet-400',  shadow: 'shadow-violet-500/10' },
    emerald: { bg: isDark ? 'from-emerald-500/15 to-emerald-500/5' : 'from-emerald-50 to-emerald-100/60',  border: 'border-emerald-500/40', ring: 'bg-emerald-500', text: 'text-emerald-400', shadow: 'shadow-emerald-500/10' },
    amber:   { bg: isDark ? 'from-amber-500/15 to-amber-500/5'     : 'from-amber-50 to-amber-100/60',      border: 'border-amber-500/40',   ring: 'bg-amber-500',   text: 'text-amber-400',   shadow: 'shadow-amber-500/10' },
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="mb-5"
    >
      {live && (
        <div className="flex items-center gap-1.5 mb-2 pl-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400">Live Data</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          const p = palette[s.color] || palette.blue;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              className={`relative rounded-xl px-4 py-3 bg-gradient-to-br ${p.bg} border ${p.border} backdrop-blur-md ${p.shadow} shadow-lg overflow-hidden`}
            >
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${p.ring}`} />
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-900/40' : 'bg-white/70'} ${p.text}`}>
                  <Icon size={18} />
                </div>
                <div className="leading-tight min-w-0">
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${textSec}`}>{s.label}</p>
                  <p className={`text-xl font-bold ${textPri} truncate`}>{s.value}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Floating Compare action bar — appears when 2+ contractors are selected.
// ─────────────────────────────────────────────────────────────────────────
const CompareBar = ({ count, isDark, onClear, onOpen }) => (
  <AnimatePresence>
    {count >= 1 && (
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl ${
          isDark
            ? 'bg-slate-900/95 border border-slate-700/60 shadow-black/40'
            : 'bg-white/95 border border-slate-200 shadow-slate-400/30'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <GitCompareArrows size={16} />
            </div>
            <div className="leading-tight">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Selected</p>
              <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {count} Contractor{count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onOpen}
            disabled={count < 2}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              count >= 2
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:brightness-110'
                : isDark ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {count >= 2 ? `Compare ${count}` : 'Pick one more'}
          </button>
          <button
            onClick={onClear}
            title="Clear selection"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─────────────────────────────────────────────────────────────────────────
// Compare modal — side-by-side comparison of selected contractors across
// Spend, Leads, CPL, Revenue, Efficiency, Meta/Google split, visits.
// Each metric row highlights the winning contractor.
// ─────────────────────────────────────────────────────────────────────────
const CompareModal = ({ open, onClose, isDark, textPri, textSec, cardBg, selected, efficiencyOf }) => {
  if (!selected || selected.length < 2) return null;

  const fmtMoney = (v) => `$${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtNum   = (v) => (v || 0).toLocaleString();
  const fmtRatio = (v) => (v >= 1 ? `${v.toFixed(2)}x` : v > 0 ? v.toFixed(1) : '—');

  const rows = [
    { key: 'spend',       label: 'Ad Spend',         fmt: fmtMoney, winBy: 'min',        get: c => c.spend || 0 },
    { key: 'leads',       label: 'Leads',            fmt: fmtNum,   winBy: 'max',        get: c => c.leads || 0 },
    { key: 'cpl',         label: 'Cost per Lead',    fmt: fmtMoney, winBy: 'min-nonzero',get: c => c.cpl || 0 },
    { key: 'revenue',     label: 'Revenue (QB/est)', fmt: fmtMoney, winBy: 'max',        get: c => c.revenue || 0 },
    { key: 'efficiency',  label: 'Efficiency (ROI)', fmt: fmtRatio, winBy: 'max',        get: c => efficiencyOf(c) },
    { key: 'meta_spend',  label: 'Meta Spend',       fmt: fmtMoney, winBy: 'none',       get: c => c.meta_spend || 0 },
    { key: 'google_spend',label: 'Google Ads Spend', fmt: fmtMoney, winBy: 'none',       get: c => c.google_spend || 0 },
    { key: 'visits',      label: 'Website Visits',   fmt: fmtNum,   winBy: 'max',        get: c => c.visits || 0 },
  ];

  const winnerFor = (row) => {
    const vals = selected.map(c => row.get(c));
    if (row.winBy === 'none') return -1;
    if (row.winBy === 'max') {
      const m = Math.max(...vals);
      return m > 0 ? vals.indexOf(m) : -1;
    }
    if (row.winBy === 'min') {
      const m = Math.min(...vals);
      return m > 0 ? vals.indexOf(m) : -1;
    }
    if (row.winBy === 'min-nonzero') {
      const nonZero = vals.filter(v => v > 0);
      if (nonZero.length === 0) return -1;
      const m = Math.min(...nonZero);
      return vals.indexOf(m);
    }
    return -1;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className={`relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl ${cardBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                  <GitCompareArrows size={18} />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${textPri}`}>Contractor Comparison</h3>
                  <p className={`text-xs ${textSec}`}>{selected.length} contractors · highlighted = winner per metric</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Comparison table */}
            <div className="overflow-auto max-h-[calc(90vh-80px)]">
              <table className="w-full">
                <thead className={`sticky top-0 ${isDark ? 'bg-[#1e2235]' : 'bg-white'}`}>
                  <tr className={`border-b ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    <th className={`text-left px-6 py-3 text-[10px] uppercase tracking-wider font-semibold ${textSec}`}>Metric</th>
                    {selected.map((c, i) => (
                      <th key={i} className="px-4 py-3 text-left">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || '#64748B' }} />
                          <span className={`text-xs font-semibold ${textPri} truncate`}>{c.name}</span>
                        </div>
                        <div className="flex gap-1 mt-1 ml-4">
                          {(c.sources || []).filter(s => s === 'META' || s === 'G-ADS').map(s => (
                            <span key={s} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                              s === 'META'
                                ? isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                                : isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                            }`}>{s === 'META' ? 'Meta' : 'Google'}</span>
                          ))}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => {
                    const winnerIdx = winnerFor(row);
                    return (
                      <tr key={row.key} className={`border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'} ${ri % 2 === 0 ? '' : isDark ? 'bg-slate-900/20' : 'bg-slate-50/50'}`}>
                        <td className={`px-6 py-3 text-sm ${textSec}`}>{row.label}</td>
                        {selected.map((c, ci) => {
                          const v = row.get(c);
                          const isWinner = ci === winnerIdx;
                          return (
                            <td key={ci} className="px-4 py-3">
                              <span className={`text-sm font-semibold ${
                                isWinner
                                  ? 'text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md'
                                  : textPri
                              }`}>
                                {v > 0 || row.key === 'google_spend' || row.key === 'meta_spend' ? row.fmt(v) : '—'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Performance Matrix card — glassmorphism, sparkline, status pulse, hover
// overlay with Meta / Google Ads spend split.
// ─────────────────────────────────────────────────────────────────────────
const MatrixCard = ({ c, i, isDark, textPri, textSec, _clrs, efficiency, isExpanded, onToggle, isSelected, onCompareToggle }) => {
  const [hover, setHover] = useState(false);
  const accent = c.color || _clrs[i % _clrs.length];
  const daily = Array.isArray(c.daily) ? c.daily : [];
  const hasSpark = daily.some(d => (d.spend || 0) > 0 || (d.leads || 0) > 0);

  // Status pulse — green (converting), amber (spending, no leads), gray (dormant)
  const pulse = c.spend > 0 && c.leads > 0
    ? { color: '#10B981', label: 'Converting', pulse: true }
    : c.spend > 0
    ? { color: '#F59E0B', label: 'Spending · 0 leads', pulse: false }
    : { color: '#64748B', label: 'Dormant', pulse: false };

  const spendSources = (c.sources || []).filter(s => s === 'META' || s === 'G-ADS');
  const metaSpend = c.meta_spend || 0;
  const googleSpend = c.google_spend || 0;
  const hasSplit = metaSpend > 0 && googleSpend > 0;

  // Glassmorphism surface
  const glass = isDark
    ? 'bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/40 backdrop-blur-xl'
    : 'bg-gradient-to-br from-white/80 to-slate-50/80 border border-slate-200/60 backdrop-blur-xl shadow-sm';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * i, duration: 0.3 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggle}
      className={`relative rounded-2xl p-5 cursor-pointer overflow-hidden group ${glass} hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-transparent' : ''}`}
      style={{ boxShadow: hover ? `0 10px 40px -10px ${accent}40` : undefined }}
    >
      {/* Accent strip */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}80)` }} />

      {/* Compare checkbox — top-right, stopPropagation so it doesn't toggle expand */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onCompareToggle(); }}
        title={isSelected ? 'Remove from comparison' : 'Add to comparison'}
        className={`absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-amber-500 border-2 border-amber-500 text-white shadow-md shadow-amber-500/40'
            : isDark
              ? 'bg-slate-900/60 border-2 border-slate-600 hover:border-amber-400 text-transparent hover:text-amber-400'
              : 'bg-white/80 border-2 border-slate-300 hover:border-amber-500 text-transparent hover:text-amber-500'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Header: status pulse + name + source pills */}
      <div className="flex items-center gap-2 mb-4 pr-6">
        <span className="relative flex items-center justify-center w-3 h-3 flex-shrink-0" title={pulse.label}>
          {pulse.pulse && (
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: pulse.color }} />
          )}
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: pulse.color }} />
        </span>
        <p className={`text-sm font-semibold ${textPri} truncate flex-1`} title={c.name}>{c.name}</p>
        {spendSources.length >= 2 && (
          <span className="flex gap-1 flex-shrink-0" title="Meta + Google Ads combined">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>M</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>G</span>
          </span>
        )}
      </div>

      {/* KPI row — big numbers */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <p className={`text-[9px] uppercase tracking-wider ${textSec}`}>Spend</p>
          <p className={`text-xl font-bold ${textPri} leading-tight`}>
            {c.spend > 0 ? `$${c.spend >= 1000 ? (c.spend/1000).toFixed(1)+'k' : c.spend.toFixed(0)}` : '—'}
          </p>
        </div>
        <div>
          <p className={`text-[9px] uppercase tracking-wider ${textSec}`}>Leads</p>
          <p className={`text-xl font-bold ${textPri} leading-tight`}>{c.leads > 0 ? c.leads : '—'}</p>
        </div>
        <div>
          <p className={`text-[9px] uppercase tracking-wider ${textSec}`}>CPL</p>
          <p className={`text-xl font-bold leading-tight ${c.cpl > 0 && c.cpl < 30 ? 'text-emerald-400' : c.cpl >= 30 && c.cpl < 80 ? 'text-amber-400' : c.cpl >= 80 ? 'text-rose-400' : textPri}`}>
            {c.cpl > 0 ? `$${c.cpl.toFixed(0)}` : '—'}
          </p>
        </div>
      </div>

      {/* Efficiency bar */}
      <div className="flex items-center gap-1.5 mb-3 text-[10px]">
        <Zap size={10} className={efficiency > 0 ? 'text-amber-400' : textSec} />
        <span className={textSec}>Efficiency</span>
        <span className={`font-semibold ml-auto ${efficiency > 0 ? textPri : textSec}`}>
          {efficiency > 0 ? (efficiency >= 1 ? efficiency.toFixed(2) + 'x' : efficiency.toFixed(1)) : '—'}
        </span>
      </div>

      {/* Sparkline — daily spend trend */}
      <div className="h-12 -mx-1">
        {hasSpark ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`spark-${c.id || i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: accent, strokeOpacity: 0.3 }}
                contentStyle={{
                  backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                  border: `1px solid ${accent}60`, borderRadius: '6px',
                  color: isDark ? '#e2e8f0' : '#1e293b', fontSize: '11px', padding: '4px 8px',
                }}
                formatter={(v, name) => name === 'spend' ? [`$${(v || 0).toFixed(0)}`, 'Spend'] : [v || 0, 'Leads']}
                labelFormatter={(l) => l}
              />
              <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={1.5} fill={`url(#spark-${c.id || i})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className={`h-full flex items-center justify-center text-[10px] ${textSec} italic opacity-60`}>
            No daily activity
          </div>
        )}
      </div>

      {/* Hover overlay: Meta vs Google Ads breakdown (only when hasSplit) */}
      <AnimatePresence>
        {hover && hasSplit && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className={`absolute bottom-3 left-3 right-3 rounded-lg px-3 py-2 text-[10px] pointer-events-none
              ${isDark ? 'bg-slate-950/95 border border-slate-700/50' : 'bg-white/95 border border-slate-200'}
              shadow-lg backdrop-blur-md`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className={textSec}>Meta</span>
                <span className={`font-semibold ${textPri}`}>${metaSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className={textSec}>Google</span>
                <span className={`font-semibold ${textPri}`}>${googleSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="flex gap-0.5 h-1 mt-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-400" style={{ width: `${(metaSpend / (metaSpend + googleSpend)) * 100}%` }} />
              <div className="bg-emerald-400" style={{ width: `${(googleSpend / (metaSpend + googleSpend)) * 100}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded drill-down — GA4 + Meta detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div>
                  <p className={`uppercase ${textSec}`}>Sessions</p>
                  <p className={`font-bold ${textPri}`}>{c.visits.toLocaleString()}</p>
                </div>
                <div>
                  <p className={`uppercase ${textSec}`}>Users</p>
                  <p className={`font-bold ${textPri}`}>{c.users.toLocaleString()}</p>
                </div>
                <div>
                  <p className={`uppercase ${textSec}`}>Bounce</p>
                  <p className={`font-bold ${textPri}`}>{c.bounce_rate}%</p>
                </div>
                <div>
                  <p className={`uppercase ${textSec}`}>Revenue {c.revenue_source === 'quickbooks' ? '(QB)' : '(est)'}</p>
                  <p className={`font-bold ${c.revenue_source === 'quickbooks' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ${(c.revenue || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className={`uppercase ${textSec}`}>Impressions</p>
                  <p className={`font-bold ${textPri}`}>{(c.impressions || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className={`uppercase ${textSec}`}>CTR</p>
                  <p className={`font-bold ${textPri}`}>{(c.ctr || 0).toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

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
  const [compareIds, setCompareIds] = useState(() => new Set());
  const [showCompare, setShowCompare] = useState(false);

  const toggleCompare = useCallback((id) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearCompare = useCallback(() => setCompareIds(new Set()), []);

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

  // Efficiency score: revenue/spend when revenue > 0, else leads per $100 spent.
  // Higher = better. Contractors with zero spend get 0 (sort to bottom on desc).
  const efficiencyOf = (c) => {
    const spend = c.spend || 0;
    if (spend <= 0) return 0;
    if ((c.revenue || 0) > 0) return c.revenue / spend;
    return ((c.leads || 0) / spend) * 100;
  };

  const filtered = useMemo(() => {
    let base = contractors;
    if (tab === 'paid') base = contractors.filter(c => c.spend > 100);
    else if (tab === 'organic') base = contractors.filter(c => c.spend <= 100);
    // Apply sort
    const arr = [...base];
    arr.sort((a, b) => {
      const av = sortBy === 'efficiency' ? efficiencyOf(a) : (a[sortBy] || 0);
      const bv = sortBy === 'efficiency' ? efficiencyOf(b) : (b[sortBy] || 0);
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
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>Contractor Breakdown</h1>
            <p className={textSec}>I-BOS Division — {contractors.length} contractors · {data?.period || 'Loading...'}</p>
          </div>
          <ViewToggle
            view={view}
            setView={setView}
            isDark={isDark}
            revenueTotal={revenueData?.grand_total || 0}
          />
        </motion.div>

        <PageInsight insights={insights} />

        {/* View transition — smooth cross-fade/slide between Traffic and Revenue */}
        <AnimatePresence mode="wait">
        {/* ─── REVENUE VIEW ─── */}
        {view === 'revenue' && revenueData && (
          <motion.div
            key="revenue"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
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
          </motion.div>
        )}

        {view === 'revenue' && !revenueData && (
          <motion.div
            key="revenue-loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`p-8 rounded-xl ${cardBg} text-center ${textSec}`}
          >
            Loading QB revenue data...
          </motion.div>
        )}

        {view === 'traffic' && (
        <motion.div
          key="traffic"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
        {/* KPI color anchors — visual page header */}
        <KPIAnchors
          isDark={isDark}
          textPri={textPri}
          textSec={textSec}
          live={!!data?.hasLiveData}
          stats={[
            { icon: Globe,      label: 'Visits',       value: (data?.total_visits || 0).toLocaleString(),                                                      color: 'blue'    },
            { icon: DollarSign, label: 'Ad Spend',     value: `$${(data?.total_spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,           color: 'violet'  },
            { icon: Target,     label: 'Leads',        value: (data?.total_leads || 0).toLocaleString(),                                                       color: 'emerald' },
            { icon: HardHat,    label: 'Active Sites', value: contractors.length,                                                                              color: 'amber'   },
          ]}
        />

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
              <option value="efficiency">Efficiency (ROI)</option>
              <option value="spend">Total Spend</option>
              <option value="leads">Lead Volume</option>
              <option value="visits">Visits</option>
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

        {/* Performance Matrix — glassmorphism grid of contractor cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c, i) => (
            <MatrixCard
              key={c.id || i}
              c={c}
              i={i}
              isDark={isDark}
              textPri={textPri}
              textSec={textSec}
              _clrs={_clrs}
              efficiency={efficiencyOf(c)}
              isExpanded={expandedId === (c.id || i)}
              onToggle={() => setExpandedId(expandedId === (c.id || i) ? null : (c.id || i))}
              isSelected={compareIds.has(c.id || String(i))}
              onCompareToggle={() => toggleCompare(c.id || String(i))}
            />
          ))}
        </div>
        </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Floating Compare action bar */}
      <CompareBar
        count={compareIds.size}
        isDark={isDark}
        onClear={clearCompare}
        onOpen={() => setShowCompare(true)}
      />

      {/* Compare modal */}
      <CompareModal
        open={showCompare && compareIds.size >= 2}
        onClose={() => setShowCompare(false)}
        isDark={isDark}
        textPri={textPri}
        textSec={textSec}
        cardBg={cardBg}
        selected={contractors.filter(c => compareIds.has(c.id || String(contractors.indexOf(c))))}
        efficiencyOf={efficiencyOf}
      />
    </motion.div>
  );
};

export default IBOSContractors;
