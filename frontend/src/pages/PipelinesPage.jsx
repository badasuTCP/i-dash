import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useDashboardConfig, ALL_CONTRACTORS } from '../context/DashboardConfigContext';
import { pipelinesAPI } from '../services/api';
import {
  Database, Activity, AlertTriangle, CheckCircle, XCircle, Clock,
  Play, RefreshCw, Settings, Zap, Terminal, Server, Loader2,
  ChevronDown, ChevronUp, Users, ToggleLeft, ToggleRight, Eye, EyeOff,
  Wifi, WifiOff, BarChart3, TrendingUp, Hash
} from 'lucide-react';

// ALL_CONTRACTORS is now imported from DashboardConfigContext

// Pipeline display metadata
const PIPELINE_META = {
  hubspot:      { icon: '🟠', label: 'HubSpot CRM',    color: 'orange', key: 'hubspot' },
  meta_ads:     { icon: '🔵', label: 'Meta Ads',        color: 'blue',   key: 'metaAds' },
  google_ads:   { icon: '🟢', label: 'Google Ads',      color: 'emerald',key: 'googleAds' },
  google_sheets:{ icon: '📊', label: 'Google Sheets',   color: 'teal',   key: 'googleSheets' },
  snapshot:     { icon: '📸', label: 'Snapshot Aggregator', color: 'violet', key: 'snapshot' },
};

const FREQ_OPTIONS = [
  { value: '30min',  label: 'Every 30 minutes' },
  { value: '1hr',    label: 'Every 1 hour' },
  { value: '2hrs',   label: 'Every 2 hours' },
  { value: '4hrs',   label: 'Every 4 hours' },
  { value: '6hrs',   label: 'Every 6 hours' },
  { value: '12hrs',  label: 'Every 12 hours' },
  { value: 'daily',  label: 'Daily (midnight)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return 'Never';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return '—'; }
}

function StatusBadge({ status, size = 'sm' }) {
  const styles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    failed:  'bg-red-500/15 text-red-400 border-red-500/25',
    running: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    error:   'bg-red-500/15 text-red-400 border-red-500/25',
    unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
    idle:    'bg-slate-500/15 text-slate-400 border-slate-500/25',
  };
  const label = status === 'success' ? 'OK' : status === 'unknown' ? 'Idle' : status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${styles[status] || styles.idle}`}>
      {status === 'running' && <Loader2 size={10} className="inline mr-1 animate-spin" />}
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const PipelinesPage = () => {
  const { isDark } = useTheme();
  const { config, updatePipeline, updateContractor, setAllContractors } = useDashboardConfig();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('pipelines'); // 'pipelines' | 'contractors' | 'logs'
  const [expandedHistory, setExpandedHistory] = useState(null);

  // ── Pipeline state ───────────────────────────────────────────────────────────
  const [pipelines, setPipelines]     = useState([]);
  const [loadingAll, setLoadingAll]   = useState(true);
  const [loadError, setLoadError]     = useState(null);
  const [runningJobs, setRunningJobs] = useState({}); // { pipelineName: true/false }
  const [runResults, setRunResults]   = useState({}); // { pipelineName: result }
  const [history, setHistory]         = useState({}); // { pipelineName: [...] }
  const [historyLoading, setHistLoading] = useState({});
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [runAllResult, setRunAllResult]   = useState(null);
  const [lastFetch, setLastFetch]     = useState(null);
  const [apiConnected, setApiConnected] = useState(null); // null = unknown, true, false
  const [countdown, setCountdown] = useState(30);
  const pollingRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Frequencies (local UI state, can later persist to backend) ───────────────
  const [frequencies, setFrequencies] = useState({
    hubspot: '2hrs', meta_ads: '2hrs', google_ads: '4hrs',
    google_sheets: '6hrs', snapshot: '4hrs',
  });

  // ── Contractor state — driven by DashboardConfigContext ──────────────────────
  const [contractorFilter, setContractorFilter] = useState('all');

  // Derive contractors array with active flag from context config
  const contractors = ALL_CONTRACTORS.map((c) => ({
    ...c,
    active: config.contractors?.[c.id] !== false,
  }));

  // ── Styles ───────────────────────────────────────────────────────────────────
  const cardBg      = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSec     = isDark ? 'text-slate-400' : 'text-slate-500';
  const border      = isDark ? 'border-slate-700/40' : 'border-slate-200';
  const rowHover    = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';
  const inputCls    = isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900';

  // ── Detect demo mode (demo tokens can't auth with the real backend) ──────────
  const isDemoMode = (() => {
    try { const t = localStorage.getItem('idash_token') || localStorage.getItem('token'); return t && t.startsWith('demo-'); } catch { return false; }
  })();

  // ── Load pipeline status from backend ────────────────────────────────────────
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoadingAll(true);
    setLoadError(null);
    try {
      const res = await pipelinesAPI.getAll();
      const data = res.data;
      setPipelines(data.pipelines || []);
      setLastFetch(new Date());
      setApiConnected(true);
    } catch (err) {
      // In demo mode, a 401 is expected — check health to confirm backend is reachable
      if (isDemoMode && err.response?.status === 401) {
        try {
          const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/api$/, '') ||
            (window.location.hostname.endsWith('.up.railway.app') ? 'https://i-dash-production.up.railway.app' : 'http://localhost:8000');
          const health = await fetch(`${baseUrl}/health`);
          if (health.ok) {
            setApiConnected(true);
            if (!silent) setLoadError('Demo mode — sign in with real credentials to control pipelines');
          } else {
            setApiConnected(false);
            if (!silent) setLoadError('Backend unreachable');
          }
        } catch {
          setApiConnected(false);
          if (!silent) setLoadError('Backend unreachable');
        }
      } else {
        if (!silent) {
          const msg = err.response?.data?.detail || err.message || 'Could not reach backend';
          setLoadError(msg);
        }
        setApiConnected(false);
      }
    } finally {
      if (!silent) setLoadingAll(false);
    }
  }, [isDemoMode]);

  // Auto-refresh every 30 seconds with countdown
  useEffect(() => {
    fetchStatus();
    setCountdown(30);
    pollingRef.current = setInterval(() => {
      fetchStatus(true);
      setCountdown(30);
    }, 30000);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => {
      clearInterval(pollingRef.current);
      clearInterval(countdownRef.current);
    };
  }, [fetchStatus]);

  // ── Run a single pipeline ────────────────────────────────────────────────────
  const handleRunNow = useCallback(async (name) => {
    setRunningJobs((p) => ({ ...p, [name]: true }));
    setRunResults((p) => ({ ...p, [name]: null }));
    try {
      const res = await pipelinesAPI.run(name);
      setRunResults((p) => ({ ...p, [name]: { success: true, ...res.data } }));
      // Refresh status after run
      setTimeout(() => fetchStatus(true), 1500);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Run failed';
      setRunResults((p) => ({ ...p, [name]: { success: false, error: detail } }));
    } finally {
      setRunningJobs((p) => ({ ...p, [name]: false }));
    }
  }, [fetchStatus]);

  // ── Run all pipelines ────────────────────────────────────────────────────────
  const handleRunAll = useCallback(async () => {
    setRunAllLoading(true);
    setRunAllResult(null);
    try {
      const res = await pipelinesAPI.runAll();
      setRunAllResult({ success: true, ...res.data });
      setTimeout(() => fetchStatus(true), 1500);
    } catch (err) {
      setRunAllResult({ success: false, error: err.response?.data?.detail || err.message });
    } finally {
      setRunAllLoading(false);
    }
  }, [fetchStatus]);

  // ── Load history for a specific pipeline ─────────────────────────────────────
  const loadHistory = useCallback(async (name) => {
    if (expandedHistory === name) { setExpandedHistory(null); return; }
    setExpandedHistory(name);
    if (history[name]) return; // already loaded
    setHistLoading((p) => ({ ...p, [name]: true }));
    try {
      const res = await pipelinesAPI.getHistory(name, 15);
      setHistory((p) => ({ ...p, [name]: res.data.history || [] }));
    } catch {
      setHistory((p) => ({ ...p, [name]: [] }));
    } finally {
      setHistLoading((p) => ({ ...p, [name]: false }));
    }
  }, [expandedHistory, history]);

  // ── Contractor toggle — writes back to DashboardConfigContext ────────────────
  const toggleContractor = useCallback((id) => {
    const current = config.contractors?.[id] !== false;
    updateContractor(id, !current);
  }, [config.contractors, updateContractor]);

  const toggleAllContractors = useCallback((active) => {
    setAllContractors(active);
  }, [setAllContractors]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeContractors   = contractors.filter((c) => c.active).length;
  const totalRecords        = pipelines.reduce((s, p) => s + (p.records_loaded || 0), 0);
  const failedCount         = pipelines.filter((p) => p.status === 'failed' || p.status === 'error').length;
  const connectedCount      = pipelines.filter((p) => p.status === 'success').length;
  const avgDuration         = pipelines.length
    ? (pipelines.reduce((s, p) => s + (p.duration_seconds || 0), 0) / pipelines.length).toFixed(1)
    : '—';

  const filteredContractors = contractors.filter((c) => {
    if (contractorFilter === 'active')   return c.active;
    if (contractorFilter === 'inactive') return !c.active;
    return true;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className={isDark ? 'text-indigo-400' : 'text-indigo-600'} size={28} />
              <div>
                <h1 className={`text-3xl font-bold ${textPrimary}`}>Data Pipelines</h1>
                <p className={textSec}>ETL pipeline control, scheduling &amp; contractor management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Connection indicator */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                apiConnected === true  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                apiConnected === false ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                'border-slate-500/30 text-slate-400 bg-slate-500/10'
              }`}>
                {apiConnected === true  ? <Wifi size={12} /> :
                 apiConnected === false ? <WifiOff size={12} /> :
                 <Loader2 size={12} className="animate-spin" />}
                {apiConnected === true
                  ? (isDemoMode ? 'Backend Online · Demo' : 'Backend Connected')
                  : apiConnected === false ? 'Backend Offline' : 'Connecting...'}
              </div>
              {/* Auto-refresh indicator + manual refresh */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${isDark ? 'border-slate-600/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                {lastFetch && (
                  <span className={textSec}>
                    Updated {relativeTime(lastFetch.toISOString())}
                  </span>
                )}
                <span className={`${textSec} opacity-60`}>·</span>
                <span className={`tabular-nums ${textSec}`}>
                  {countdown}s
                </span>
                <button
                  onClick={() => { fetchStatus(); setCountdown(30); }}
                  disabled={loadingAll}
                  className="p-1 rounded hover:bg-indigo-500/20 transition-colors"
                  title="Refresh now"
                >
                  <RefreshCw size={13} className={loadingAll ? 'animate-spin text-indigo-400' : textSec} />
                </button>
              </div>
              {/* Run All */}
              <button
                onClick={handleRunAll}
                disabled={runAllLoading || apiConnected === false}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {runAllLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run All Pipelines
              </button>
            </div>
          </div>

          {/* Run All result banner */}
          <AnimatePresence>
            {runAllResult && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${
                  runAllResult.success
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/15 border border-red-500/30 text-red-400'
                }`}
              >
                {runAllResult.success
                  ? <><CheckCircle size={15} /> All pipelines completed — {runAllResult.successful} success, {runAllResult.failed} failed in {runAllResult.duration_seconds?.toFixed(1)}s</>
                  : <><XCircle size={15} /> {runAllResult.error}</>}
                <button onClick={() => setRunAllResult(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Tab Nav ── */}
        <div className={`flex gap-1 p-1 rounded-xl mb-6 w-fit ${isDark ? 'bg-slate-800/60' : 'bg-slate-100'}`}>
          {[
            { id: 'pipelines', label: 'Pipeline Control', icon: Server },
            { id: 'contractors', label: 'Contractor Management', icon: Users },
            { id: 'logs', label: 'Run Logs', icon: Terminal },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id
                  ? `${isDark ? 'bg-indigo-600 text-white' : 'bg-white shadow text-indigo-700'}`
                  : `${textSec} hover:text-indigo-400`
              }`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: PIPELINE CONTROL
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'pipelines' && (
          <>
            {/* Health Metrics */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pipelines Online', value: loadingAll ? '—' : `${connectedCount}/${pipelines.length}`, icon: CheckCircle, color: 'text-emerald-400' },
                { label: 'Failed Pipelines', value: loadingAll ? '—' : failedCount, icon: XCircle, color: failedCount > 0 ? 'text-red-400' : 'text-slate-400' },
                { label: 'Records (last run)', value: loadingAll ? '—' : totalRecords.toLocaleString(), icon: Hash, color: 'text-blue-400' },
                { label: 'Avg Duration', value: loadingAll ? '—' : `${avgDuration}s`, icon: Clock, color: 'text-violet-400' },
              ].map((stat, idx) => (
                <div key={idx} className={`rounded-xl p-4 ${cardBg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <stat.icon size={15} className={stat.color} />
                    <span className={`text-xs ${textSec}`}>{stat.label}</span>
                  </div>
                  <span className={`text-2xl font-bold ${textPrimary}`}>{stat.value}</span>
                </div>
              ))}
            </motion.div>

            {/* Load error / demo mode banner */}
            {loadError && !loadingAll && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                isDemoMode && apiConnected
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                <AlertTriangle size={15} />
                {isDemoMode && apiConnected
                  ? <>{loadError}</>
                  : <>Backend unavailable: {loadError}. Showing last known state.</>}
              </div>
            )}

            {/* Pipeline Cards */}
            {loadingAll ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-indigo-400" size={32} />
                <span className={`ml-3 ${textSec}`}>Loading pipeline status...</span>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {Object.entries(PIPELINE_META).map(([name, meta]) => {
                  const pipe      = pipelines.find((p) => p.name === name) || {};
                  const isRunning = runningJobs[name];
                  const result    = runResults[name];
                  const isEnabled = config.pipelines[meta.key] !== false;
                  const histExpanded = expandedHistory === name;
                  const pipeHistory  = history[name];
                  const histLoad     = historyLoading[name];

                  return (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`rounded-xl overflow-hidden ${cardBg}`}
                    >
                      {/* Main row */}
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Icon + name */}
                          <span className="text-2xl">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold ${textPrimary}`}>{meta.label}</span>
                              <StatusBadge status={pipe.status || 'idle'} />
                              {!isEnabled && (
                                <span className="px-2 py-0.5 rounded-full text-xs border bg-slate-500/10 text-slate-400 border-slate-500/25">
                                  Hidden from dashboards
                                </span>
                              )}
                            </div>
                            <div className={`text-xs mt-0.5 ${textSec} flex flex-wrap gap-3`}>
                              <span>Last sync: <b className={textPrimary}>{relativeTime(pipe.last_success || pipe.last_run)}</b></span>
                              {pipe.records_loaded != null && (
                                <span>Records: <b className={textPrimary}>{pipe.records_loaded?.toLocaleString()}</b></span>
                              )}
                              {pipe.duration_seconds != null && (
                                <span>Duration: <b className={textPrimary}>{pipe.duration_seconds?.toFixed(1)}s</b></span>
                              )}
                              {pipe.error && (
                                <span className="text-red-400">Error: {pipe.error}</span>
                              )}
                            </div>
                          </div>

                          {/* Frequency picker */}
                          <select
                            value={frequencies[name] || '2hrs'}
                            onChange={(e) => setFrequencies((p) => ({ ...p, [name]: e.target.value }))}
                            className={`px-2 py-1 rounded-lg text-xs border ${inputCls}`}
                          >
                            {FREQ_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>

                          {/* Enable/disable dashboard visibility */}
                          <button
                            onClick={() => updatePipeline(meta.key, !isEnabled)}
                            title={isEnabled ? 'Visible on dashboards (click to hide)' : 'Hidden from dashboards (click to show)'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isEnabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-500/10'
                            }`}
                          >
                            {isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>

                          {/* History toggle */}
                          <button
                            onClick={() => loadHistory(name)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                              isDark ? 'border-slate-600 text-slate-300 hover:border-indigo-500/60' : 'border-slate-300 text-slate-600 hover:border-indigo-500/60'
                            }`}
                          >
                            {histExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            History
                          </button>

                          {/* Run Now */}
                          <button
                            onClick={() => handleRunNow(name)}
                            disabled={isRunning || apiConnected === false}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            {isRunning
                              ? <><Loader2 size={12} className="animate-spin" /> Running...</>
                              : <><Play size={12} /> Run Now</>}
                          </button>
                        </div>

                        {/* Per-pipeline run result */}
                        <AnimatePresence>
                          {result && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${
                                result.success
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {result.success
                                ? <><CheckCircle size={12} /> Done — {result.records_loaded} records in {result.duration_seconds?.toFixed(1)}s</>
                                : <><XCircle size={12} /> {result.error}</>}
                              <button onClick={() => setRunResults((p) => ({ ...p, [name]: null }))} className="ml-auto opacity-50 hover:opacity-100">✕</button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* History panel */}
                      <AnimatePresence>
                        {histExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className={`border-t ${border} overflow-hidden`}
                          >
                            <div className="p-4">
                              <p className={`text-xs font-semibold mb-3 ${textSec}`}>LAST 15 RUNS</p>
                              {histLoad ? (
                                <div className="flex items-center gap-2 text-sm py-3">
                                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                                  <span className={textSec}>Loading history...</span>
                                </div>
                              ) : pipeHistory && pipeHistory.length > 0 ? (
                                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                  {pipeHistory.map((run, i) => (
                                    <div key={i} className={`flex items-center justify-between text-xs p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                                      <div className="flex items-center gap-2">
                                        <StatusBadge status={run.status || 'unknown'} />
                                        <span className={textSec}>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className={textSec}>{run.records_loaded?.toLocaleString() ?? '—'} records</span>
                                        <span className={textSec}>{run.duration_seconds ? `${run.duration_seconds?.toFixed(1)}s` : '—'}</span>
                                        {run.error && <span className="text-red-400 truncate max-w-[200px]">{run.error}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className={`text-xs ${textSec} py-3`}>No history available for this pipeline yet.</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Data Health */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`rounded-xl p-5 ${cardBg}`}>
              <h3 className={`font-semibold mb-4 ${textPrimary}`}>Data Health Overview</h3>
              <div className="space-y-3">
                {Object.entries(PIPELINE_META).map(([name, meta]) => {
                  const pipe    = pipelines.find((p) => p.name === name) || {};
                  const health  = pipe.status === 'success' ? 100 : pipe.status === 'failed' || pipe.status === 'error' ? 0 : 50;
                  const barClr  = health === 100 ? 'bg-emerald-500' : health === 0 ? 'bg-red-500' : 'bg-amber-500';
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={textSec}>{meta.icon} {meta.label}</span>
                        <span className={health === 100 ? 'text-emerald-400' : health === 0 ? 'text-red-400' : 'text-amber-400'}>
                          {health}%
                        </span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${health}%` }}
                          transition={{ duration: 1.2, ease: 'easeOut' }}
                          className={`h-full rounded-full ${barClr}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: CONTRACTOR MANAGEMENT
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'contractors' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Summary bar */}
            <div className={`rounded-xl p-5 mb-5 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className={`font-semibold ${textPrimary}`}>Contractor Visibility Control</h3>
                  <p className={`text-xs mt-0.5 ${textSec}`}>
                    Active contractors feed data to all I-BOS dashboards. Disable to exclude from reports.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${textSec}`}>
                    <b className="text-emerald-400">{activeContractors}</b>/{contractors.length} active
                  </span>
                  <button
                    onClick={() => toggleAllContractors(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Enable All
                  </button>
                  <button
                    onClick={() => toggleAllContractors(false)}
                    className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Disable All
                  </button>
                </div>
              </div>
              {/* Filter tabs */}
              <div className="flex gap-2 mt-4">
                {[
                  { id: 'all',      label: `All (${contractors.length})` },
                  { id: 'active',   label: `Active (${contractors.filter((c) => c.active).length})` },
                  { id: 'inactive', label: `Inactive (${contractors.filter((c) => !c.active).length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setContractorFilter(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      contractorFilter === t.id
                        ? 'bg-indigo-600 text-white'
                        : `${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'} hover:bg-indigo-500/20`
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contractor grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredContractors.map((contractor) => (
                <motion.div
                  key={contractor.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`rounded-xl p-4 flex items-center justify-between ${cardBg} ${
                    !contractor.active ? (isDark ? 'opacity-50' : 'opacity-60') : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                      isDark ? 'bg-slate-800' : 'bg-slate-100'
                    }`}>
                      🏗️
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${textPrimary}`}>{contractor.name}</p>
                      <p className={`text-xs ${textSec}`}>
                        {contractor.active ? '✅ Visible on dashboards' : '🚫 Hidden from dashboards'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleContractor(contractor.id)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                      contractor.active ? 'bg-emerald-500' : isDark ? 'bg-slate-700' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      contractor.active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Warning if many inactive */}
            {activeContractors < 3 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
                <AlertTriangle size={15} />
                Fewer than 3 contractors active — I-BOS dashboards may show incomplete data.
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: RUN LOGS
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {Object.entries(PIPELINE_META).map(([name, meta]) => {
                const pipe       = pipelines.find((p) => p.name === name) || {};
                const pipeHistory = history[name];
                const histLoad    = historyLoading[name];

                return (
                  <div key={name} className={`rounded-xl ${cardBg}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.icon}</span>
                        <span className={`font-semibold text-sm ${textPrimary}`}>{meta.label}</span>
                        <StatusBadge status={pipe.status || 'idle'} />
                      </div>
                      <button
                        onClick={() => {
                          // Force reload history
                          setHistory((p) => ({ ...p, [name]: undefined }));
                          setHistLoading((p) => ({ ...p, [name]: true }));
                          pipelinesAPI.getHistory(name, 15)
                            .then((res) => setHistory((p) => ({ ...p, [name]: res.data.history || [] })))
                            .catch(() => setHistory((p) => ({ ...p, [name]: [] })))
                            .finally(() => setHistLoading((p) => ({ ...p, [name]: false })));
                        }}
                        className={`p-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors ${textSec}`}
                        title="Reload history"
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                    <div className={`border-t ${border} p-3`}>
                      {histLoad ? (
                        <div className="flex items-center gap-2 py-4 justify-center">
                          <Loader2 size={14} className="animate-spin text-indigo-400" />
                          <span className={`text-sm ${textSec}`}>Loading...</span>
                        </div>
                      ) : pipeHistory && pipeHistory.length > 0 ? (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                          {pipeHistory.map((run, i) => (
                            <div key={i} className={`text-xs p-2.5 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                              <div className="flex items-center justify-between mb-0.5">
                                <StatusBadge status={run.status || 'unknown'} />
                                <span className={textSec}>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</span>
                              </div>
                              <div className={`flex gap-3 mt-1 ${textSec}`}>
                                <span>{run.records_loaded?.toLocaleString() ?? 0} records</span>
                                <span>{run.duration_seconds ? `${run.duration_seconds?.toFixed(1)}s` : '—'}</span>
                              </div>
                              {run.error && <p className="text-red-400 mt-1 truncate">{run.error}</p>}
                            </div>
                          ))}
                        </div>
                      ) : pipeHistory && pipeHistory.length === 0 ? (
                        <p className={`text-xs text-center py-4 ${textSec}`}>No run history found.</p>
                      ) : (
                        <button
                          onClick={() => {
                            setHistLoading((p) => ({ ...p, [name]: true }));
                            pipelinesAPI.getHistory(name, 15)
                              .then((res) => setHistory((p) => ({ ...p, [name]: res.data.history || [] })))
                              .catch(() => setHistory((p) => ({ ...p, [name]: [] })))
                              .finally(() => setHistLoading((p) => ({ ...p, [name]: false })));
                          }}
                          className="w-full py-4 text-xs text-center text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Load history
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

      </div>
    </motion.div>
  );
};

export default PipelinesPage;
