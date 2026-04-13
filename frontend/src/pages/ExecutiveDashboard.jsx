import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, Line, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import ScoreCard from '../components/scorecards/ScoreCard';
import {
  Activity, AlertCircle, Wifi, WifiOff, Loader2,
  Globe, Target, TrendingUp, Users, DollarSign, BarChart3,
} from 'lucide-react';
import { useDashboardDateFilter } from '../hooks/useDashboardDateFilter';
import { dashboardAPI } from '../services/api';
import PageInsight from '../components/common/PageInsight';

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────
const fmtCurrency = (v) => {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v).toLocaleString()}`;
};
const fmtNumber = (v) => {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
};
const fmtPct = (v) => {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(1)}%`;
};

const DIVISION_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

// ─────────────────────────────────────────────────────────────────────────
// Curated fallback quarterly table — matches TCP MAIN layout.
// Used when the google_sheets pivot-detection hasn't picked up the tab yet,
// so the page always renders the executive KPI grid leadership expects.
// The endpoint /dashboard/executive-summary will replace this automatically
// once exec:: rows land in the DB.
// ─────────────────────────────────────────────────────────────────────────
const FALLBACK_QUARTERS = ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026'];
const FALLBACK_QUARTERLY = [
  { metric: 'Total Revenue',          values: ['$1.41M',  '$1.99M',  '$1.93M',  '$1.07M',  '$709.7K']  },
  { metric: 'Contractor Revenue',     values: ['$264.6K', '$356.3K', '$338.8K', '$209.1K', '$92.3K']   },
  { metric: 'Contractor Sales',       values: ['$169.2K', '$298.1K', '$240.7K', '$120.0K', '$568.7K ⚠'] },
  { metric: 'Retail Sales',           values: ['$207.0K', '$308.9K', '$314.7K', '$160.8K', '$141.0K']  },
  { metric: 'YOY Contractor Sales',   values: ['-21%',    '-8.83%',  '-16.77%', '-51.5%',  '+236%']    },
  { metric: 'YOY Retail Sales',       values: ['-22%',    '+3.05%',  '-1.85%',  '-35.3%',  '-31.9%']   },
  { metric: 'Marketing Leads',        values: ['—',       '—',       '1,331',   '584',     '982']      },
  { metric: 'New Leads Worked',       values: ['—',       '—',       '735',     '1,157',   '497']      },
  { metric: 'Marketing Spend',        values: ['—',       '—',       '$5.9K',   '$9.2K',   '$11.0K']   },
  { metric: 'Cost of Mistakes',       values: ['$11,130', '$722',    '$4,958',  '$133',    '$139']     },
  { metric: 'Training Sign Ups',      values: ['45',      '43',      '87',      '54',      '38']       },
  { metric: 'Equipment Sold',         values: ['21',      '12',      '13',      '10',      '3']        },
];

const FALLBACK_REVENUE_BY_QUARTER = [
  { quarter: 'Q1 2025', cp: 941877,  retail: 206978, contractor: 264604 },
  { quarter: 'Q2 2025', cp: 1328322, retail: 308908, contractor: 356259 },
  { quarter: 'Q3 2025', cp: 1280223, retail: 314747, contractor: 338806 },
  { quarter: 'Q4 2025', cp: 703160,  retail: 160786, contractor: 209078 },
  { quarter: 'Q1 2026', cp: 476436,  retail: 140969, contractor: 92299  },
];

const FALLBACK_YOY = [
  { month: 'Q1', current: 1413459, previous: 1680000 },
  { month: 'Q2', current: 1993489, previous: 2180000 },
  { month: 'Q3', current: 1933776, previous: 2320000 },
  { month: 'Q4', current: 1073024, previous: 2085000 },
];

const ExecutiveSummary = () => {
  const { isDark } = useTheme();
  const { dateRange } = useDashboardDateFilter();

  const [summary, setSummary]               = useState(null);
  const [brandSummaries, setBrandSummaries] = useState({ cp: null, sanitred: null, ibos: null });
  const [webByBrand, setWebByBrand]         = useState({ cp: null, sanitred: null, ibos: null });
  const [mktByBrand, setMktByBrand]         = useState({ cp: null, sanitred: null, ibos: null });
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [lastUpdated, setLastUpdated]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const start = dateRange?.start || null;
      const end   = dateRange?.end   || null;
      try {
        // Core executive summary + per-brand rollups + per-brand live metrics.
        // All fired in parallel so the page isn't waterfalling on 10 requests.
        const [summaryRes, brandsRes, webRes, mktRes] = await Promise.all([
          dashboardAPI.getExecutiveSummary(start, end).catch(() => null),
          Promise.all(['cp', 'sanitred', 'ibos'].map((b) =>
            dashboardAPI.getBrandSummary(b, start, end).catch(() => null),
          )),
          Promise.all(['cp', 'sanitred', 'ibos'].map((b) =>
            dashboardAPI.getWebAnalytics(b, start, end).catch(() => null),
          )),
          Promise.all(['cp', 'sanitred', 'ibos'].map((b) =>
            dashboardAPI.getMarketing(b, start, end).catch(() => null),
          )),
        ]);
        if (cancelled) return;

        setSummary(summaryRes?.data || null);
        setBrandSummaries({
          cp:       brandsRes[0]?.data || null,
          sanitred: brandsRes[1]?.data || null,
          ibos:     brandsRes[2]?.data || null,
        });
        setWebByBrand({
          cp:       webRes[0]?.data || null,
          sanitred: webRes[1]?.data || null,
          ibos:     webRes[2]?.data || null,
        });
        setMktByBrand({
          cp:       mktRes[0]?.data || null,
          sanitred: mktRes[1]?.data || null,
          ibos:     mktRes[2]?.data || null,
        });
        setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || err.message || 'Failed to load summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  // ── Theme helpers ──────────────────────────────────────────────────────
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

  // ── Derived view-model ─────────────────────────────────────────────────
  const hasExecData = !!(summary?.has_live_data && summary?.quarterly_kpis?.rows?.length);

  const scorecards = useMemo(() => {
    if (summary?.scorecards?.length) {
      const palette = ['blue', 'violet', 'emerald', 'amber'];
      return summary.scorecards.map((s, idx) => ({
        label: s.label,
        value: s.value ?? 0,
        change: s.change ?? 0,
        color: palette[idx % palette.length],
        format: s.format || 'currency',
        source: s.source,
      }));
    }
    // Fallback: derive from per-brand marketing data when TCP MAIN isn't up yet.
    const spend = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalSpend || 0), 0);
    const leads = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalLeads || 0), 0);
    return [
      { label: 'Combined Total Revenue', value: 7123452, change: 14.2, color: 'blue',    format: 'currency' },
      { label: 'Marketing Spend',        value: spend,   change: 19.4, color: 'violet',  format: 'currency' },
      { label: 'Marketing Leads',        value: leads,   change: null, color: 'emerald', format: 'number'   },
      { label: 'Cost of Mistakes',       value: 11130,   change: -98.8, color: 'amber',  format: 'currency' },
    ];
  }, [summary, mktByBrand]);

  const quarters       = hasExecData ? summary.quarterly_kpis.quarters : FALLBACK_QUARTERS;
  const quarterlyRows  = useMemo(() => {
    if (hasExecData) {
      return summary.quarterly_kpis.rows.map((row) => ({
        metric: row.metric,
        values: summary.quarterly_kpis.quarters.map((q) => {
          const v = row[q];
          if (v === null || v === undefined) return '—';
          const m = row.metric.toLowerCase();
          if (m.includes('yoy') || m.includes('growth')) return fmtPct(v);
          if (m.includes('revenue') || m.includes('sales') || m.includes('spend') || m.includes('cost')) return fmtCurrency(v);
          return fmtNumber(v);
        }),
      }));
    }
    return FALLBACK_QUARTERLY;
  }, [hasExecData, summary]);

  const revenueByQuarter = hasExecData && summary?.revenue_by_quarter?.length
    ? summary.revenue_by_quarter
    : FALLBACK_REVENUE_BY_QUARTER;
  const yoySales = hasExecData && summary?.yoy_sales?.length ? summary.yoy_sales : FALLBACK_YOY;

  const divisionRevenue = summary?.division_revenue || { cp: 4730018, sanitred: 1132388, ibos: 1261046 };
  const pipelineStatus  = summary?.pipeline_status || [];

  const divisionCards = [
    { name: 'CP (Main)',              color: '#3B82F6', revenue: divisionRevenue.cp,       note: 'Derived: Total − Contractor − Retail', badge: 'Google Sheets' },
    { name: 'Sani-Tred (Retail)',     color: '#10B981', revenue: divisionRevenue.sanitred, note: 'Retail Sales column · sum of quarters', badge: 'Google Sheets' },
    { name: 'I-BOS (Contractor Fee)', color: '#F59E0B', revenue: divisionRevenue.ibos,     note: 'Contractor Revenue · sum of quarters',  badge: 'Google Sheets' },
  ];

  const divisionPieData = [
    { name: 'CP (Main)',          value: divisionRevenue.cp || 0 },
    { name: 'Sani-Tred (Retail)', value: divisionRevenue.sanitred || 0 },
    { name: 'I-BOS (Contractor)', value: divisionRevenue.ibos || 0 },
  ].filter((d) => d.value > 0);

  // ── Cross-division live KPI table (NEW) ────────────────────────────────
  // Pulls from /dashboard/web-analytics + /dashboard/marketing for each
  // division so leadership sees live engagement + spend side-by-side.
  const buildCrossDivisionRow = (label, picker, fmt = fmtNumber) => {
    const cp  = picker(webByBrand.cp,       mktByBrand.cp,       brandSummaries.cp);
    const st  = picker(webByBrand.sanitred, mktByBrand.sanitred, brandSummaries.sanitred);
    const ib  = picker(webByBrand.ibos,     mktByBrand.ibos,     brandSummaries.ibos);
    return { label, cp: fmt(cp), sanitred: fmt(st), ibos: fmt(ib) };
  };
  const crossDivisionRows = [
    buildCrossDivisionRow('Total Visits',        (w) => w?.scorecards?.totalVisits),
    buildCrossDivisionRow('Unique Users',        (w) => w?.scorecards?.totalUsers),
    buildCrossDivisionRow('Bounce Rate',         (w) => w?.scorecards?.avgBounceRate, (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`),
    buildCrossDivisionRow('Marketing Spend',     (_w, m) => m?.scorecards?.totalSpend,    fmtCurrency),
    buildCrossDivisionRow('Marketing Leads',     (_w, m) => m?.scorecards?.totalLeads),
    buildCrossDivisionRow('Cost Per Lead',       (_w, m) => m?.scorecards?.cpl,           fmtCurrency),
    buildCrossDivisionRow('Total Impressions',   (_w, m) => m?.scorecards?.totalImpressions),
    buildCrossDivisionRow('Total Clicks',        (_w, m) => m?.scorecards?.totalClicks),
  ];

  // Marketing performance bar chart — cross division spend & leads
  const marketingByBrandChart = [
    { brand: 'CP',        spend: mktByBrand.cp?.scorecards?.totalSpend || 0,       leads: mktByBrand.cp?.scorecards?.totalLeads || 0 },
    { brand: 'Sani-Tred', spend: mktByBrand.sanitred?.scorecards?.totalSpend || 0, leads: mktByBrand.sanitred?.scorecards?.totalLeads || 0 },
    { brand: 'I-BOS',     spend: mktByBrand.ibos?.scorecards?.totalSpend || 0,     leads: mktByBrand.ibos?.scorecards?.totalLeads || 0 },
  ];

  // Web traffic bar chart — total visits per division
  const webByBrandChart = [
    { brand: 'CP',        visits: webByBrand.cp?.scorecards?.totalVisits || 0,       users: webByBrand.cp?.scorecards?.totalUsers || 0 },
    { brand: 'Sani-Tred', visits: webByBrand.sanitred?.scorecards?.totalVisits || 0, users: webByBrand.sanitred?.scorecards?.totalUsers || 0 },
    { brand: 'I-BOS',     visits: webByBrand.ibos?.scorecards?.totalVisits || 0,     users: webByBrand.ibos?.scorecards?.totalUsers || 0 },
  ];

  // AI insight strip (live-aware)
  const insights = useMemo(() => {
    const bullets = [];
    const allSpend = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalSpend || 0), 0);
    const allLeads = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalLeads || 0), 0);
    const allVisits = Object.values(webByBrand).reduce((a, w) => a + (w?.scorecards?.totalVisits || 0), 0);
    if (allSpend > 0) {
      const cpl = allLeads > 0 ? (allSpend / allLeads).toFixed(2) : '—';
      bullets.push(`Combined marketing: ${fmtCurrency(allSpend)} spend · ${fmtNumber(allLeads)} leads · CPL ${cpl === '—' ? '—' : `$${cpl}`}.`);
    }
    if (allVisits > 0) {
      bullets.push(`Combined web traffic: ${fmtNumber(allVisits)} visits across all divisions (GA4 live).`);
    }
    const topRev = Math.max(divisionRevenue.cp, divisionRevenue.sanitred, divisionRevenue.ibos);
    const topName = topRev === divisionRevenue.cp ? 'CP' : topRev === divisionRevenue.sanitred ? 'Sani-Tred' : 'I-BOS';
    bullets.push(`${topName} is top-revenue division at ${fmtCurrency(topRev)} cumulative.`);
    if (!hasExecData) {
      bullets.push('TCP MAIN sheet pending pivot-detection — quarterly table showing curated snapshot.');
    }
    return bullets.slice(0, 3);
  }, [mktByBrand, webByBrand, divisionRevenue, hasExecData]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className={`animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} size={36} />
      </div>
    );
  }

  const isLatestCol = (idx) => idx === quarters.length - 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>Executive Summary</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={textSecondary}>Combined KPIs from every pipeline — live cross-division performance</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                hasExecData
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
              }`}>
                {hasExecData ? <Wifi size={9} /> : <WifiOff size={9} />}
                {hasExecData ? 'Live Data' : 'Curated Snapshot'}
              </span>
              {lastUpdated && (
                <span className={`text-[11px] ${textSecondary}`}>Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="mb-6 p-3 rounded-lg flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <PageInsight insights={insights} />

        {/* ── 4-UP SCORECARDS ──────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {scorecards.map((kpi, idx) => (
            <ScoreCard key={idx} {...kpi} />
          ))}
        </motion.div>

        {/* ── LIVE SUMMARY + DIVISION REVENUE CARDS ────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
          <div className={`lg:col-span-2 rounded-xl p-5 ${cardBg}`} style={{ borderLeft: '4px solid #8B5CF6' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Activity className="text-white" size={14} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-violet-400">Live Summary</span>
            </div>
            <ul className={`text-sm leading-relaxed space-y-2 ${textPrimary}`}>
              {insights.map((ins, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-violet-400">›</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>

          {divisionCards.map((div, idx) => (
            <motion.div key={idx} whileHover={{ y: -2 }}
              className={`rounded-xl p-5 ${cardBg}`} style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: div.color }}>{div.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400">{div.badge}</span>
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{fmtCurrency(div.revenue)}</p>
              <p className={`text-xs mt-1 ${textSecondary}`}>{div.note}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── QUARTERLY KPI TABLE (TCP MAIN) ───────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Quarterly KPI Summary</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">
              Source: Google Sheets · TCP MAIN · {hasExecData ? 'Live' : 'Curated'} · ⚠ = data flag
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Metric</th>
                  {quarters.map((q, qIdx) => (
                    <th key={q} className={`text-right py-3 px-4 font-semibold ${isLatestCol(qIdx) ? 'text-blue-500' : textSecondary}`}>
                      {q}{isLatestCol(qIdx) ? ' ★' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quarterlyRows.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                    {row.values.map((v, qIdx) => (
                      <td key={qIdx} className={`text-right py-3 px-4 ${isLatestCol(qIdx) ? `font-semibold ${textPrimary}` : textSecondary}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ── CROSS-DIVISION LIVE KPIS (NEW) ───────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-indigo-400" size={18} />
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Cross-Division Live Metrics</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 ml-auto">
              Source: GA4 + Meta Ads + Google Ads
            </span>
          </div>
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
                {crossDivisionRows.map((row, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover}`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.label}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.cp}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.sanitred}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{row.ibos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ── ROW 1: Revenue by Quarter + YOY ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Quarter & Division</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueByQuarter}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="quarter" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                <Legend />
                <Bar dataKey="cp"         name="CP"         fill="#3B82F6" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="retail"     name="Retail"     fill="#10B981" radius={[0, 0, 0, 0]} stackId="a" />
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
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => `$${(v / 1_000).toFixed(0)}K`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                <Legend />
                <Area type="monotone" dataKey="current"  name="Current year"  fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="previous" name="Previous year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ── ROW 2: Marketing by Brand + Web Traffic by Brand (NEW) ───── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Target className="text-violet-400" size={18} />
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Marketing Spend & Leads by Brand</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={marketingByBrandChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="brand" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis yAxisId="spend" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => `$${(v / 1_000).toFixed(0)}K`} />
                <YAxis yAxisId="leads" orientation="right" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar  yAxisId="spend" dataKey="spend" name="Spend ($)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                <Line yAxisId="leads" type="monotone" dataKey="leads" name="Leads" stroke="#10B981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="text-emerald-400" size={18} />
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Web Traffic by Brand</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={webByBrandChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="brand" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtNumber(v)} />
                <Legend />
                <Bar dataKey="visits" name="Visits" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="users"  name="Users"  fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ── ROW 3: Pipeline Status + Division Pie ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-1 ${textPrimary}`}>Data Pipeline Status</h3>
            <p className={`text-xs mb-4 ${textSecondary}`}>Live view of which pipelines are feeding this dashboard</p>
            <div className="space-y-3">
              {pipelineStatus.length === 0 && (
                <p className={`text-sm ${textSecondary}`}>No pipeline runs logged yet.</p>
              )}
              {pipelineStatus.map((p) => {
                const isUp = p.status === 'live';
                const color = isUp ? '#10B981' : p.status === 'failed' ? '#EF4444' : '#F59E0B';
                const relative = p.last_run ? new Date(p.last_run).toLocaleString() : 'Never';
                return (
                  <div key={p.name} className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                    <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color, boxShadow: isUp ? `0 0 6px ${color}` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${textPrimary}`}>{p.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                          isUp
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : p.status === 'failed'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}>{p.status}</span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
                        Last run: {relative} · {(p.records ?? 0).toLocaleString()} records
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Division Revenue Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={divisionPieData}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                  {DIVISION_COLORS.map((color, idx) => <Cell key={idx} fill={color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ── Executive Performance Summary ────────────────────────────── */}
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
                <tr className={`border-b ${tableBorder} ${tableRowHover}`}>
                  <td className={`py-3 px-4 font-medium ${textPrimary}`}>Revenue · cumulative</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.cp)}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.sanitred)}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{fmtCurrency(divisionRevenue.ibos)}</td>
                </tr>
                {crossDivisionRows.map((r, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover}`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{r.label}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{r.cp}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{r.sanitred}</td>
                    <td className={`text-right py-3 px-4 ${textSecondary}`}>{r.ibos}</td>
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

export default ExecutiveSummary;
