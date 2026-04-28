import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { useDashboardConfig } from '../context/DashboardConfigContext';
import ScoreCard from '../components/scorecards/ScoreCard';
import {
  Activity, AlertCircle, Wifi, WifiOff, Loader2,
  Globe, Target, BarChart3,
} from 'lucide-react';
import { useDashboardDateFilter, parseLabel } from '../hooks/useDashboardDateFilter';
import { dashboardAPI } from '../services/api';
import PageInsight from '../components/common/PageInsight';
import SortableBarChart from '../components/common/SortableBarChart';
import { useExport } from '../context/ExportContext';

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
  const { isPipelineVisible } = useDashboardConfig();
  const showHubspot      = isPipelineVisible('hubspot');
  const showMetaAds      = isPipelineVisible('metaAds');
  const showGoogleAds    = isPipelineVisible('googleAds');
  const showGA4          = isPipelineVisible('ga4');
  const showGoogleSheets = isPipelineVisible('googleSheets');
  const showWooCommerce  = isPipelineVisible('woocommerce');
  const showShopify      = isPipelineVisible('shopify');
  const { dateRange } = useDashboardDateFilter();
  const { registerExport, clearExport } = useExport();

  const [summary, setSummary]               = useState(null);
  const [brandSummaries, setBrandSummaries] = useState({ cp: null, sanitred: null, ibos: null });
  const [webByBrand, setWebByBrand]         = useState({ cp: null, sanitred: null, ibos: null });
  const [mktByBrand, setMktByBrand]         = useState({ cp: null, sanitred: null, ibos: null });
  const [wcStore, setWcStore]               = useState(null);
  const [hubspot, setHubspot]               = useState(null);
  const [contractorRev, setContractorRev]   = useState(null);
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
        const [summaryRes, brandsRes, webRes, mktRes, wcRes, hubRes, contRevRes] = await Promise.all([
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
          dashboardAPI.getWCStore(start, end).catch(() => null),
          dashboardAPI.getHubspot(start, end).catch(() => null),
          dashboardAPI.getContractorRevenue(start, end).catch(() => null),
        ]);
        if (cancelled) return;

        setSummary(summaryRes?.data || null);
        setWcStore(wcRes?.data || null);
        setHubspot(hubRes?.data || null);
        setContractorRev(contRevRes?.data || null);
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

  // Equipment Sold — quarter-overlap filter like Combined Total Revenue.
  // Previously summed every quarter in the table, so picking "today"
  // showed 59 (sum of Q1 2025 + Q2 2025 + Q3 2025 + Q4 2025 + Q1 2026)
  // instead of ~3 (the quarter that overlaps Apr 24 2026).
  const equipmentSoldFromTable = useMemo(() => {
    const liveRows = summary?.quarterly_kpis?.rows;
    const liveQuarters = summary?.quarterly_kpis?.quarters;

    let quartersList, rowValue;
    if (liveRows?.length && liveQuarters?.length) {
      const row = liveRows.find((r) => (r.metric || '').toLowerCase() === 'equipment sold');
      if (!row) return 0;
      quartersList = liveQuarters;
      rowValue = (q) => Number(row[q]) || 0;
    } else {
      const fbRow = FALLBACK_QUARTERLY.find((r) => r.metric.toLowerCase() === 'equipment sold');
      if (!fbRow) return 0;
      quartersList = FALLBACK_QUARTERS;
      rowValue = (q) => {
        const v = fbRow.values[quartersList.indexOf(q)];
        const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
        return isNaN(n) ? 0 : n;
      };
    }

    // Restrict to quarters that overlap the centralised date picker.
    // No picker range → include every quarter (matches legacy behavior
    // only when the user truly wants an all-time view).
    const filterStart = dateRange?.start ? new Date(dateRange.start) : null;
    const filterEnd   = dateRange?.end   ? new Date(dateRange.end)   : null;
    const included = quartersList.filter((q) => {
      if (!filterStart || !filterEnd) return true;
      const qRange = parseLabel(q);
      if (!qRange) return true;
      return qRange.start <= filterEnd && qRange.end >= filterStart;
    });

    return included.reduce((sum, q) => sum + rowValue(q), 0);
  }, [summary, dateRange]);

  // Combined Total Revenue is the sum of the "Total Revenue" row from the
  // TCP MAIN Quarterly KPI table, restricted to the quarters that overlap
  // the currently-selected centralised date range. This matches the big
  // number leadership reports every quarter. Atomic-quarter semantics:
  // if ANY part of a quarter overlaps the picker's range, include the
  // whole quarter (quarters are the smallest unit on the sheet).
  const combinedTotalRevenueFromTable = useMemo(() => {
    const parseMoney = (v) => {
      if (v === null || v === undefined || v === '—') return 0;
      let s = String(v).replace(/[$,%\s⚠★]/g, '').trim();
      let mult = 1;
      if (s.endsWith('M')) { mult = 1_000_000; s = s.slice(0, -1); }
      else if (s.endsWith('K')) { mult = 1_000; s = s.slice(0, -1); }
      else if (s.endsWith('B')) { mult = 1_000_000_000; s = s.slice(0, -1); }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n * mult;
    };

    const liveRows = summary?.quarterly_kpis?.rows;
    const liveQuarters = summary?.quarterly_kpis?.quarters;

    // Quarter label → raw value resolver (live TCP MAIN first, fallback snapshot otherwise)
    let quartersList, rowValue;
    if (liveRows?.length && liveQuarters?.length) {
      const row = liveRows.find((r) => (r.metric || '').toLowerCase() === 'total revenue');
      if (!row) return 0;
      quartersList = liveQuarters;
      rowValue = (q) => row[q];
    } else {
      const fbRow = FALLBACK_QUARTERLY.find((r) => r.metric.toLowerCase() === 'total revenue');
      if (!fbRow) return 0;
      quartersList = FALLBACK_QUARTERS;
      rowValue = (q) => fbRow.values[quartersList.indexOf(q)];
    }

    // Quarters to include: those whose date range overlaps the picker.
    // No picker range → include every quarter in the table.
    const filterStart = dateRange?.start ? new Date(dateRange.start) : null;
    const filterEnd   = dateRange?.end   ? new Date(dateRange.end)   : null;
    const included = quartersList.filter((q) => {
      if (!filterStart || !filterEnd) return true;
      const qRange = parseLabel(q);
      if (!qRange) return true;
      return qRange.start <= filterEnd && qRange.end >= filterStart;
    });

    return included.reduce((sum, q) => sum + parseMoney(rowValue(q)), 0);
  }, [summary, dateRange]);

  const scorecards = useMemo(() => {
    if (summary?.scorecards?.length) {
      const palette = ['blue', 'violet', 'emerald', 'amber'];
      return summary.scorecards.map((s, idx) => {
        // The backend currently returns YTD totals on the quarterly
        // scorecards (sums every quarter in the TCP MAIN sheet
        // unconditionally). That ignores the date picker. Override
        // both Total Revenue and Equipment Sold with frontend-computed
        // values that apply quarter-overlap filtering against the
        // active date range.
        let value = s.value ?? 0;
        let label = s.label;
        let source = s.source;
        let infoNote = null;
        if (s.label === 'Equipment Sold') {
          value = equipmentSoldFromTable;
          source = 'Google Sheets · TCP MAIN · Equipment Sold row';
          infoNote = 'Total from the quarterly datasheet. Summed across quarters that overlap the selected date range (quarters are the smallest unit on this sheet).';
        }
        if (s.label === 'Combined Total Revenue') {
          label = 'Total Revenue';
          value = combinedTotalRevenueFromTable;
          source = 'Google Sheets · TCP MAIN · Total Revenue row';
          infoNote = 'Amount from the quarterly datasheet (QB) — reported by Molly Quick. Summed across quarters that overlap the selected date range.';
        }
        return {
          label,
          value,
          change: s.change ?? 0,
          color: palette[idx % palette.length],
          format: s.format || 'currency',
          source,
          infoNote,
        };
      });
    }
    // Fallback: derive from per-brand marketing data when TCP MAIN isn't up yet.
    const spend = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalSpend || 0), 0);
    const leads = Object.values(mktByBrand).reduce((a, m) => a + (m?.scorecards?.totalLeads || 0), 0);
    return [
      { label: 'Total Revenue', value: combinedTotalRevenueFromTable, change: null, color: 'blue',    format: 'currency',
        source: 'Google Sheets · TCP MAIN · Total Revenue row',
        infoNote: 'Amount from the quarterly datasheet (QB) — reported by Molly Quick. Summed across quarters that overlap the selected date range.' },
      { label: 'Marketing Spend',        value: spend,   change: null, color: 'violet',  format: 'currency' },
      { label: 'Marketing Leads',        value: leads,   change: null, color: 'emerald', format: 'number'   },
      { label: 'Equipment Sold',         value: equipmentSoldFromTable, change: null, color: 'amber',  format: 'number'   },
    ];
  }, [summary, mktByBrand, equipmentSoldFromTable, combinedTotalRevenueFromTable]);

  const quarters       = hasExecData ? summary.quarterly_kpis.quarters : FALLBACK_QUARTERS;
  // ── Quarterly KPI table sort ─────────────────────────────────────
  const [kpiSortBy, setKpiSortBy] = useState('metric'); // 'metric' | quarter label
  const [kpiSortDir, setKpiSortDir] = useState('asc');

  // Parse a display value like "$1.41M", "-21%", "1,331", "$11,130" → number
  const parseDisplayValue = (v) => {
    if (v === null || v === undefined || v === '—') return null;
    let s = String(v).replace(/[$,%\s⚠★]/g, '').trim();
    let mult = 1;
    if (s.endsWith('M')) { mult = 1_000_000; s = s.slice(0, -1); }
    else if (s.endsWith('K')) { mult = 1_000; s = s.slice(0, -1); }
    else if (s.endsWith('B')) { mult = 1_000_000_000; s = s.slice(0, -1); }
    const n = parseFloat(s);
    return isNaN(n) ? null : n * mult;
  };

  // Manual-only metrics: rows Molly keys into TCP MAIN that do NOT have
  // a live API source. Every other row in the sheet (Contractor Revenue,
  // Retail Sales, Marketing Leads / Spend, Total Revenue, Training Sign
  // Ups, etc.) is now ingested live from QB / WC / Shopify / Meta /
  // Google / HubSpot and rendered by the live scorecards above. Showing
  // them again here creates drift between what Molly keys monthly vs the
  // live feeds. The full sheet data is still preserved in the database
  // and is viewable on the admin Documents page.
  const MANUAL_ONLY_METRICS = ['cost of mistakes', 'equipment sold'];

  const quarterlyRowsRaw = useMemo(() => {
    if (hasExecData) {
      return summary.quarterly_kpis.rows
        .filter((row) => MANUAL_ONLY_METRICS.includes((row.metric || '').trim().toLowerCase()))
        .map((row) => ({
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
    return FALLBACK_QUARTERLY.filter((row) => MANUAL_ONLY_METRICS.includes((row.metric || '').trim().toLowerCase()));
  }, [hasExecData, summary]);

  // Register the Quarterly KPI table for CSV export
  useEffect(() => {
    if (!quarterlyRowsRaw?.length) return;
    const qs = hasExecData ? (summary?.quarterly_kpis?.quarters || []) : FALLBACK_QUARTERS;
    const rows = quarterlyRowsRaw.map((r) => {
      const obj = { metric: r.metric };
      qs.forEach((q, i) => { obj[q] = r.values[i]; });
      return obj;
    });
    const columns = [
      { key: 'metric', label: 'Metric' },
      ...qs.map((q) => ({ key: q, label: q })),
    ];
    registerExport({ title: 'Executive Summary - Quarterly KPIs', rows, columns });
    return () => clearExport();
  }, [quarterlyRowsRaw, hasExecData, summary, registerExport, clearExport]);

  // Apply sort to the KPI table
  const quarterlyRows = useMemo(() => {
    const arr = [...quarterlyRowsRaw];
    if (kpiSortBy === 'metric') {
      arr.sort((a, b) => {
        const cmp = a.metric.localeCompare(b.metric);
        return kpiSortDir === 'asc' ? cmp : -cmp;
      });
    } else {
      // Sort by a quarter column (identified by index)
      const qIdx = (() => {
        const quartersArr = hasExecData ? summary.quarterly_kpis.quarters : FALLBACK_QUARTERS;
        return quartersArr.indexOf(kpiSortBy);
      })();
      if (qIdx >= 0) {
        arr.sort((a, b) => {
          const av = parseDisplayValue(a.values[qIdx]);
          const bv = parseDisplayValue(b.values[qIdx]);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;  // nulls always at the bottom
          if (bv === null) return -1;
          return kpiSortDir === 'asc' ? av - bv : bv - av;
        });
      }
    }
    return arr;
  }, [quarterlyRowsRaw, kpiSortBy, kpiSortDir, hasExecData, summary]);

  const revenueByQuarterIsLive = !!(hasExecData && summary?.revenue_by_quarter?.length);
  const revenueByQuarter = revenueByQuarterIsLive
    ? summary.revenue_by_quarter
    : FALLBACK_REVENUE_BY_QUARTER;
  const yoySalesIsLive = !!(hasExecData && summary?.yoy_sales?.length);
  const yoySales = yoySalesIsLive ? summary.yoy_sales : FALLBACK_YOY;

  // Revenue per division, computed from live sources:
  //   CP        → Shopify store revenue (canonical for the CP tile)
  //   Sani-Tred → WooCommerce store revenue
  //   I-BOS     → sum of QB revenue for active contractors
  // If the backend exposes a pre-aggregated `summary.division_revenue`
  // block, that wins — it's the single source of truth. Otherwise we
  // assemble from the per-pipeline responses. Missing values stay null
  // so the table renders "—" instead of a made-up number.
  const divisionRevenue = useMemo(() => {
    if (summary?.division_revenue) return summary.division_revenue;
    return {
      cp:       summary?.cp_shopify?.revenue ?? null,
      sanitred: wcStore?.scorecards?.totalRevenue ?? null,
      ibos:     summary?.qb_revenue?.active_total ?? contractorRev?.totalRevenue ?? null,
    };
  }, [summary, wcStore, contractorRev]);

  const divisionRevenueIsLive = useMemo(() => {
    // All three sources present → live; otherwise we annotate the row.
    return (
      divisionRevenue.cp != null &&
      divisionRevenue.sanitred != null &&
      divisionRevenue.ibos != null
    );
  }, [divisionRevenue]);

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

  // Cross-Division table sort state
  const [cdSortBy, setCdSortBy] = useState('label');
  const [cdSortDir, setCdSortDir] = useState('asc');
  const sortedCrossDivisionRows = useMemo(() => {
    const arr = [...crossDivisionRows];
    arr.sort((a, b) => {
      if (cdSortBy === 'label') {
        const cmp = a.label.localeCompare(b.label);
        return cdSortDir === 'asc' ? cmp : -cmp;
      }
      const av = parseDisplayValue(a[cdSortBy]);
      const bv = parseDisplayValue(b[cdSortBy]);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return cdSortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [crossDivisionRows, cdSortBy, cdSortDir]);

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
    const wcRev = wcStore?.scorecards?.totalRevenue || 0;
    const wcOrders = wcStore?.scorecards?.totalOrders || 0;

    if (allSpend > 0) {
      const cpl = allLeads > 0 ? (allSpend / allLeads).toFixed(2) : '—';
      bullets.push(`Combined marketing: ${fmtCurrency(allSpend)} spend · ${fmtNumber(allLeads)} leads · CPL ${cpl === '—' ? '—' : `$${cpl}`}.`);
    }
    if (allVisits > 0) {
      bullets.push(`Combined web traffic: ${fmtNumber(allVisits)} visits across all divisions (GA4 live).`);
    }
    if (wcRev > 0) {
      bullets.push(`Sani-Tred Store: ${fmtCurrency(wcRev)} revenue from ${fmtNumber(wcOrders)} orders (WooCommerce live).`);
    }
    const qbRev = contractorRev?.totalRevenue || 0;
    const qbCount = contractorRev?.contractorCount || 0;
    if (qbRev > 0) {
      const topName = contractorRev?.contractors?.[0]?.name || 'Unknown';
      bullets.push(`Contractor revenue (QB): ${fmtCurrency(qbRev)} from ${qbCount} contractors · Top: ${topName}.`);
    }
    // Only assert "top division" when we actually have numbers across all
    // three — Math.max on a null drags the answer to NaN, which would
    // silently mislabel the leader.
    if (divisionRevenueIsLive) {
      const topRev = Math.max(divisionRevenue.cp, divisionRevenue.sanitred, divisionRevenue.ibos);
      const topName = topRev === divisionRevenue.cp ? 'CP' : topRev === divisionRevenue.sanitred ? 'Sani-Tred' : 'I-BOS';
      bullets.push(`${topName} is top-revenue division at ${fmtCurrency(topRev)} cumulative.`);
    }
    if (!hasExecData) {
      bullets.push('TCP MAIN sheet pending pivot-detection — quarterly table showing curated snapshot.');
    }
    return bullets.slice(0, 5);
  }, [mktByBrand, webByBrand, divisionRevenue, divisionRevenueIsLive, hasExecData, wcStore, contractorRev]);

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
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">

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

        {/* ── ROW 2 SCORECARDS (operational KPIs) ──────────────────────── */}
        {(showWooCommerce || showShopify || showGA4 || showHubspot) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {showWooCommerce && (
              <ScoreCard label="Sani-Tred Store Revenue"
                value={wcStore?.scorecards?.totalRevenue || 0}
                color="emerald" format="currency" />
            )}
            {showShopify && (
              <ScoreCard label="CP Store Revenue"
                value={summary?.cp_shopify?.revenue || 0}
                color="violet" format="currency" />
            )}
            {showGA4 && (
              <ScoreCard label="Total Web Visits"
                value={Object.values(webByBrand).reduce((a, w) => a + (w?.scorecards?.totalVisits || 0), 0)}
                color="cyan" format="number" />
            )}
            {showHubspot && (
              <ScoreCard label="HubSpot Deals Won"
                value={hubspot?.scorecards?.deals_won || hubspot?.scorecards?.dealsWon || 0}
                color="amber" format="number" />
            )}
          </motion.div>
        )}

        {/* ── ROW 3 SCORECARDS — QB Revenue breakdown ─────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.115 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <ScoreCard label="Total QB Revenue"
            value={summary?.qb_revenue?.grand_total || contractorRev?.totalRevenue || 0}
            color="emerald" format="currency" />
          <ScoreCard label="Active I-BOS Contractors Revenue"
            value={summary?.qb_revenue?.active_total || 0}
            change={summary?.qb_revenue?.active_pct}
            color="blue" format="currency" />
          <ScoreCard label="In-Active I-BOS Contractors Revenue"
            value={summary?.qb_revenue?.inactive_total || 0}
            color="amber" format="currency"
            sub={summary?.qb_revenue?.inactive_count ? `${summary.qb_revenue.inactive_count} legacy accounts` : undefined} />
          <ScoreCard label="Total QB Customers"
            value={(summary?.qb_revenue?.active_count || 0) + (summary?.qb_revenue?.inactive_count || 0) + (summary?.qb_revenue?.retail_count || 0)}
            color="violet" format="number" />
        </motion.div>

        {/* ── LIVE SUMMARY (full width) ────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className={`rounded-xl p-5 mb-8 ${cardBg}`} style={{ borderLeft: '4px solid #8B5CF6' }}>
          <div className="flex items-center gap-2 mb-3">
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
        </motion.div>

        {/* ── QUARTERLY KPI TABLE (TCP MAIN) ───────────────────────────── */}
        {showGoogleSheets && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Manual Operational Metrics</h3>
              <p className={`text-xs mt-0.5 ${textSecondary}`}>Entered by finance (Molly Quick) monthly — no live API equivalent</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">
              Source: Google Sheets · TCP MAIN · {hasExecData ? 'Live' : 'Curated'} · ⚠ = data flag
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th
                    className={`text-left py-3 px-4 font-semibold cursor-pointer select-none hover:text-indigo-400 transition-colors ${kpiSortBy === 'metric' ? 'text-indigo-400' : textSecondary}`}
                    onClick={() => {
                      if (kpiSortBy === 'metric') setKpiSortDir(kpiSortDir === 'asc' ? 'desc' : 'asc');
                      else { setKpiSortBy('metric'); setKpiSortDir('asc'); }
                    }}
                  >
                    Metric{kpiSortBy === 'metric' ? (kpiSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                  {quarters.map((q, qIdx) => (
                    <th
                      key={q}
                      className={`text-right py-3 px-4 font-semibold cursor-pointer select-none hover:text-indigo-400 transition-colors ${
                        kpiSortBy === q ? 'text-indigo-400' : (isLatestCol(qIdx) ? 'text-blue-500' : textSecondary)
                      }`}
                      onClick={() => {
                        if (kpiSortBy === q) setKpiSortDir(kpiSortDir === 'asc' ? 'desc' : 'asc');
                        else { setKpiSortBy(q); setKpiSortDir('desc'); }
                      }}
                    >
                      {q}{isLatestCol(qIdx) ? ' ★' : ''}
                      {kpiSortBy === q ? (kpiSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quarterlyRows.map((row, idx) => {
                  // Per-cell anomaly detection: flag any value that swung
                  // by > 90% vs the prior quarter. Skips YoY / growth rows
                  // (those are ratios, not absolutes) and empty ("—") cells.
                  // The warning stays soft — we just annotate, so the CEO
                  // knows to verify before quoting the number.
                  const metricLower = (row.metric || '').toLowerCase();
                  const skipAnomaly = metricLower.includes('yoy')
                    || metricLower.includes('growth');
                  const numericValues = row.values.map(parseDisplayValue);
                  return (
                    <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover} transition-colors`}>
                      <td className={`py-3 px-4 font-medium ${textPrimary}`}>{row.metric}</td>
                      {row.values.map((v, qIdx) => {
                        let warn = false;
                        let warnTitle = null;
                        if (!skipAnomaly && qIdx > 0) {
                          const cur  = numericValues[qIdx];
                          const prev = numericValues[qIdx - 1];
                          if (cur != null && prev != null && prev !== 0) {
                            const pct = Math.abs((cur - prev) / prev);
                            if (pct > 0.9) {
                              warn = true;
                              warnTitle = `Large swing vs prior quarter (${(pct * 100).toFixed(0)}% change) — verify before quoting. May indicate a data gap.`;
                            }
                          }
                        }
                        return (
                          <td key={qIdx} className={`text-right py-3 px-4 ${isLatestCol(qIdx) ? `font-semibold ${textPrimary}` : textSecondary}`}
                              title={warnTitle || undefined}>
                            {v}
                            {warn && <span className="ml-1 text-amber-400">⚠</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`text-[10px] mt-2 ${textSecondary}`}>💡 Click any column header to sort</p>
        </motion.div>
        )}

        {/* ── CROSS-DIVISION LIVE KPIS (NEW) ───────────────────────────── */}
        {(showGA4 || showMetaAds || showGoogleAds) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-indigo-400" size={18} />
            <h3 className={`text-lg font-semibold ${textPrimary}`}>Cross-Division Live Metrics</h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 ml-auto">
              Source: {[showGA4 && 'GA4', showMetaAds && 'Meta Ads', showGoogleAds && 'Google Ads'].filter(Boolean).join(' + ')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  {[
                    { key: 'label',    label: 'Metric',             align: 'left',  color: textSecondary },
                    { key: 'cp',       label: 'CP (Main)',          align: 'right', color: 'text-blue-500' },
                    { key: 'sanitred', label: 'Sani-Tred (Retail)', align: 'right', color: 'text-emerald-500' },
                    { key: 'ibos',     label: 'I-BOS (Contractor)', align: 'right', color: 'text-amber-500' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      className={`py-3 px-4 font-semibold cursor-pointer select-none hover:text-indigo-400 transition-colors text-${col.align} ${cdSortBy === col.key ? 'text-indigo-400' : col.color}`}
                      onClick={() => {
                        if (cdSortBy === col.key) setCdSortDir(cdSortDir === 'asc' ? 'desc' : 'asc');
                        else { setCdSortBy(col.key); setCdSortDir(col.key === 'label' ? 'asc' : 'desc'); }
                      }}
                    >
                      {col.label}
                      {cdSortBy === col.key ? (cdSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCrossDivisionRows.map((row, idx) => (
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
        )}

        {/* ── ROW 1: Revenue by Quarter + YOY ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Revenue by Quarter & Division</h3>
              {!revenueByQuarterIsLive && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wider">
                  Curated Snapshot
                </span>
              )}
            </div>
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>YOY Sales Comparison</h3>
              {!yoySalesIsLive && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase tracking-wider">
                  Curated Snapshot
                </span>
              )}
            </div>
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
        {((showMetaAds || showGoogleAds) || showGA4) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {(showMetaAds || showGoogleAds) && (
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
          )}

          {showGA4 && (
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
          )}
        </div>
        )}

        {/* ── ROW 2.5: CP Store (Shopify) — daily revenue trend ────────
            Additive: backend ships cp_shopify_daily with one row per
            day in the selected range. Empty array → don't render. */}
        {showShopify && Array.isArray(summary?.cp_shopify_daily) && summary.cp_shopify_daily.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}
            className={`rounded-xl p-6 mb-8 ${cardBg}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛍️</span>
                <h3 className={`text-lg font-semibold ${textPrimary}`}>CP Store — Daily Revenue</h3>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">
                Source: Shopify · The Concrete Protector Store
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={summary.cp_shopify_daily}>
                <defs>
                  <linearGradient id="cpStoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => (name === 'orders' ? v : fmtCurrency(v))}
                  labelFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#cpStoreGrad)" strokeWidth={2} name="Revenue" />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* ── ROW 3: Sani-Tred Store Revenue + HubSpot Summary ──────── */}
        {((showWooCommerce && wcStore?.monthly?.length > 0) || (showHubspot && hubspot)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {showWooCommerce && wcStore?.monthly?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🛒</span>
                  <h3 className={`text-lg font-semibold ${textPrimary}`}>Sani-Tred Store — Monthly Revenue</h3>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={wcStore.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                    <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}
            {showHubspot && hubspot && (() => {
              // Resolve an "as of" timestamp the CEO can quote. Prefer an
              // explicit last_synced / updated_at / as_of field on the
              // HubSpot response; fall back to the page's lastUpdated.
              const asOfRaw =
                hubspot?.last_synced
                || hubspot?.updated_at
                || hubspot?.as_of
                || hubspot?.scorecards?.last_synced
                || (lastUpdated ? lastUpdated.toISOString() : null);
              let asOfDisplay = null;
              if (asOfRaw) {
                try {
                  const d = new Date(asOfRaw);
                  if (!isNaN(d)) asOfDisplay = d.toLocaleString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  });
                } catch { /* noop */ }
              }
              return (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🟠</span>
                  <h3 className={`text-lg font-semibold ${textPrimary}`}>HubSpot CRM Snapshot</h3>
                  {asOfDisplay && (
                    <span className={`ml-auto text-[10px] ${textSecondary}`}>
                      As of {asOfDisplay}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Contacts Created',  value: hubspot?.scorecards?.contacts_created || hubspot?.scorecards?.contactsCreated || 0 },
                    { label: 'Deals Won',         value: hubspot?.scorecards?.deals_won || hubspot?.scorecards?.dealsWon || 0 },
                    { label: 'Revenue Won',       value: hubspot?.scorecards?.revenue_won || hubspot?.scorecards?.revenueWon || 0, fmt: 'currency' },
                    { label: 'Meetings Booked',   value: hubspot?.scorecards?.meetings_booked || hubspot?.scorecards?.meetingsBooked || 0 },
                    { label: 'Pipeline Value',    value: hubspot?.scorecards?.pipeline_value || hubspot?.scorecards?.pipelineValue || 0, fmt: 'currency' },
                    { label: 'Tasks Completed',   value: hubspot?.scorecards?.tasks_completed || hubspot?.scorecards?.tasksCompleted || 0 },
                  ].map((kpi, idx) => (
                    <div key={idx} className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                      <p className={`text-xs uppercase tracking-wide mb-1 ${textSecondary}`}>{kpi.label}</p>
                      <p className={`text-lg font-bold ${textPrimary}`}>
                        {kpi.fmt === 'currency' ? fmtCurrency(kpi.value) : fmtNumber(kpi.value)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className={`text-[10px] mt-3 ${textSecondary}`}>
                  Scoped to the current date range · sourced from HubSpot pipeline
                </p>
              </motion.div>
              );
            })()}
          </div>
        )}

        {/* ── ROW 4: Top Contractors by Revenue + Spend vs Revenue ────── */}
        {contractorRev?.contractors?.length > 0 && (() => {
          // Filter out aggregate rows (TOTAL, GRAND TOTAL, etc.) — these are
          // sheet summary rows, not real contractors.
          const _isAggregate = (name) => {
            const n = (name || '').trim().toLowerCase();
            return !n || n === 'total' || n === 'grand total' || n === 'subtotal'
              || n === 'net income' || n === 'gross profit' || n === 'n/a';
          };
          const cleanContractors = contractorRev.contractors.filter(c => !_isAggregate(c.name));
          // Active contractors only = those who have ad spend (only active
          // contractors run Meta/Google ads, inactive have no ad data).
          const activeOnly = cleanContractors.filter(c => (c.ad_spend || 0) > 0);
          return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.49 }}
              className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">💰</span>
                <h3 className={`text-lg font-semibold ${textPrimary}`}>Top Contractors by Revenue (QB)</h3>
              </div>
              <SortableBarChart
                data={cleanContractors}
                nameKey="name"
                metrics={[{ key: 'revenue', label: 'Revenue (QB)', color: '#F59E0B', format: 'currency' }]}
              />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📊</span>
                <h3 className={`text-lg font-semibold ${textPrimary}`}>Ad Spend vs Revenue (Active Contractors)</h3>
              </div>
              <SortableBarChart
                data={activeOnly}
                nameKey="name"
                metrics={[
                  { key: 'revenue',  label: 'Revenue (QB)', color: '#F59E0B', format: 'currency' },
                  { key: 'ad_spend', label: 'Ad Spend',     color: '#8B5CF6', format: 'currency' },
                ]}
                emptyMessage="No active contractors with ad spend in this period"
              />
            </motion.div>
          </div>
          );
        })()}

        {/* ── QB Monthly Contractor Revenue Trend ─────────────────────── */}
        {contractorRev?.monthly?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.51 }}
            className={`rounded-xl p-6 mb-8 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📈</span>
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Contractor Revenue Trend (QuickBooks)</h3>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={contractorRev.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                <Bar dataKey="revenue" name="Revenue" fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

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
                  <td className={`py-3 px-4 font-medium ${textPrimary}`}>
                    Revenue · cumulative
                    {!divisionRevenueIsLive && (
                      <span className="ml-1.5 text-amber-400" title="Partial data — one or more pipelines have no recent sync">⚠</span>
                    )}
                  </td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{divisionRevenue.cp != null ? fmtCurrency(divisionRevenue.cp) : '—'}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{divisionRevenue.sanitred != null ? fmtCurrency(divisionRevenue.sanitred) : '—'}</td>
                  <td className={`text-right py-3 px-4 ${textSecondary}`}>{divisionRevenue.ibos != null ? fmtCurrency(divisionRevenue.ibos) : '—'}</td>
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
