import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { pipelinesAPI, dashboardAPI, aiAPI } from '../services/api';
import {
  Shield, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp,
  RefreshCw, Loader2, Star, Clock, Zap, MessageSquare, X, Send, Bot,
  User as UserIcon, Sparkles, Activity, Database,
} from 'lucide-react';

// ─── Static pipeline intelligence docs ──────────────────────────────────────
const PIPELINE_DOCS = {
  hubspot: {
    icon: '🟠',
    label: 'HubSpot CRM',
    color: '#FF7A59',
    purpose: 'Customer relationship data — contacts, deals, pipeline and activity tracking.',
    // Expected max hours between successful runs before we flag "stale"
    stalenessThresholdHours: 8,
    dataPoints: [
      { field: 'Contacts Created / Updated',  confidence: 99, note: 'Direct API — every record sync\'d' },
      { field: 'Deals (Won / Lost / Open)',    confidence: 97, note: 'Real-time deal stage changes' },
      { field: 'Revenue (Closed-Won)',         confidence: 95, note: 'From deal amount × close date' },
      { field: 'Pipeline Value (Open Deals)',  confidence: 90, note: 'Probability-weighted estimate' },
      { field: 'Meetings Booked',              confidence: 93, note: 'From engagement API' },
      { field: 'Emails Sent',                  confidence: 88, note: 'Engagement events — sent only, not delivered' },
      { field: 'Tasks Completed',              confidence: 91, note: 'HubSpot task activity feed' },
    ],
    limitations: [
      'Email delivery/open rates not tracked (sent count only)',
      'Contact deduplication relies on HubSpot merging — check for dupes',
      'Pipeline value uses raw deal amounts, not weighted by close probability',
    ],
    decisionValue: 'HIGH — use for sales forecasting, lead follow-up velocity, and rep performance.',
    refreshWindow: 'Fetches last 30 days on each run. Run daily for current-day accuracy.',
  },
  meta_ads: {
    icon: '🔵',
    label: 'Meta (Facebook) Ads',
    color: '#1877F2',
    purpose: 'Paid social advertising — spend, impressions, clicks, and lead conversions.',
    stalenessThresholdHours: 6,
    dataPoints: [
      { field: 'Impressions',        confidence: 99, note: 'Meta-reported, highly accurate' },
      { field: 'Clicks',             confidence: 99, note: 'Meta-reported link clicks' },
      { field: 'Ad Spend',           confidence: 99, note: 'Billed spend — exact to the cent' },
      { field: 'Conversions',        confidence: 82, note: 'Pixel-based — affected by iOS 14+ tracking limits' },
      { field: 'Conversion Value',   confidence: 78, note: 'Modelled after iOS 14 changes, not exact' },
      { field: 'CTR',                confidence: 99, note: 'Clicks ÷ Impressions — direct calculation' },
      { field: 'CPC / CPM',          confidence: 99, note: 'Direct from Meta API' },
      { field: 'ROAS',               confidence: 75, note: 'Based on modelled conversion value — treat as directional' },
      { field: 'Reach / Frequency',  confidence: 97, note: 'Audience reach data from Meta' },
    ],
    limitations: [
      'iOS 14+ privacy changes reduce conversion visibility by ~20–35%',
      'ROAS is modelled (not exact) — cross-check with HubSpot revenue',
      'Conversion window is typically 7-day click, 1-day view — may count delayed conversions',
      'Data for the last 3 days may be revised as Meta finalises attribution',
    ],
    decisionValue: 'HIGH for spend/reach decisions. MEDIUM for revenue attribution — cross-check with HubSpot.',
    refreshWindow: 'Fetches last 30 days. Run at least every 2 hours for intraday monitoring.',
  },
  google_ads: {
    icon: '🟢',
    label: 'Google Ads',
    color: '#4285F4',
    purpose: 'Search & display advertising — keyword performance, cost, and conversion tracking.',
    stalenessThresholdHours: 6,
    dataPoints: [
      { field: 'Impressions',             confidence: 99, note: 'Google-reported, exact' },
      { field: 'Clicks',                  confidence: 99, note: 'Exact click data from Google' },
      { field: 'Ad Cost',                 confidence: 99, note: 'Billed cost — exact' },
      { field: 'Conversions',             confidence: 88, note: 'Google tag-based — better than Meta post-iOS14' },
      { field: 'Conversion Value',        confidence: 85, note: 'Tag-tracked — accurate when tag is firing correctly' },
      { field: 'CTR',                     confidence: 99, note: 'Direct calculation' },
      { field: 'CPC',                     confidence: 99, note: 'Direct from Google Ads API' },
      { field: 'ROAS',                    confidence: 85, note: 'Better than Meta — Google tag tracks more reliably' },
      { field: 'Search Impression Share', confidence: 95, note: 'Competitive visibility metric from Google' },
    ],
    limitations: [
      'Conversion tag must be correctly placed on all thank-you/confirmation pages',
      'Cross-device conversions estimated by Google — not exact',
      'Data finalised after 72 hours — recent 3 days may shift slightly',
      'Customer ID must cover all active accounts (CP + individual contractors)',
    ],
    decisionValue: 'HIGH — Google Ads data is the most reliable of all ad platforms. Use confidently.',
    refreshWindow: 'Fetches last 30 days via GAQL. Run every 4 hours for near-real-time.',
  },
  google_sheets: {
    icon: '📊',
    label: 'Google Sheets',
    color: '#0F9D58',
    purpose: 'Manual data entry — revenue overrides, contractor KPIs, cost inputs that don\'t exist in APIs.',
    stalenessThresholdHours: 36,
    dataPoints: [
      { field: 'Revenue (Manual Entry)',    confidence: 70, note: 'Depends entirely on who\'s entering data and how often' },
      { field: 'Contractor Commissions',    confidence: 75, note: 'Updated manually — verify with accounting' },
      { field: 'Cost of Mistakes',          confidence: 65, note: 'Subjective entries — define a standard' },
      { field: 'Training Sign Ups',         confidence: 80, note: 'Usually current if someone maintains it' },
      { field: 'Equipment Sales',           confidence: 72, note: 'Cross-check with actual sales system' },
    ],
    limitations: [
      'Confidence is ONLY as good as the person updating the sheet',
      'No change tracking — if someone edits a cell, history is lost',
      'Date column auto-detection: sheet MUST have a column with parseable dates (YYYY-MM-DD preferred)',
      'No validation — typos and wrong formats will cause pipeline failures',
      'Sheet ID must be set in GOOGLE_SHEET_ID environment variable',
    ],
    decisionValue: 'MEDIUM — useful for data not available via API, but build a validation habit (weekly review).',
    refreshWindow: 'Fetches full sheet on each run. Changes take effect on next run.',
  },
  google_analytics: {
    icon: '📈',
    label: 'Google Analytics (GA4)',
    color: '#06B6D4',
    purpose: 'Website traffic and user behavior — sessions, page views, bounce rate, traffic sources, and device breakdown per division.',
    stalenessThresholdHours: 8,
    dataPoints: [
      { field: 'Sessions / Total Users',        confidence: 99, note: 'Direct GA4 Data API — exact counts' },
      { field: 'New Users / Returning Users',    confidence: 97, note: 'GA4 user identification model' },
      { field: 'Page Views',                     confidence: 99, note: 'Screen + page views from GA4' },
      { field: 'Bounce Rate',                    confidence: 95, note: 'GA4 engaged sessions calculation' },
      { field: 'Avg Session Duration',           confidence: 90, note: 'Weighted by session count per day' },
      { field: 'Traffic Source/Medium Breakdown', confidence: 97, note: 'sessionDefaultChannelGroup dimension' },
      { field: 'Device Category Breakdown',      confidence: 98, note: 'Desktop / Mobile / Tablet from GA4' },
    ],
    limitations: [
      'GA4 data can have 24-48 hour processing delay for some properties',
      'Per-division property IDs must be set (GA4_PROPERTY_ID_CP, _SANITRED, _IBOS) or auto-discovered',
      'Service account must have at least Viewer access to each GA4 property',
      'Traffic source attribution follows GA4 default channel grouping rules',
    ],
    decisionValue: 'HIGH — foundational for understanding website performance per division.',
    refreshWindow: 'Runs every 4 hours. GA4 data may lag real-time by up to 48 hours.',
  },
  snapshot: {
    icon: '📸',
    label: 'Snapshot Aggregator',
    color: '#8B5CF6',
    purpose: 'Combines all pipeline data into a single daily summary record for dashboard display.',
    stalenessThresholdHours: 6,
    dataPoints: [
      { field: 'Total Revenue (aggregated)',  confidence: 90, note: 'Sum of HubSpot + Sheets — weighted by their confidence' },
      { field: 'Combined Ad Spend',           confidence: 99, note: 'Meta + Google direct figures' },
      { field: 'Total Leads',                 confidence: 94, note: 'HubSpot contacts marked as leads' },
      { field: 'Blended ROAS',                confidence: 80, note: 'Combined revenue ÷ combined spend' },
      { field: 'Data Freshness Score',        confidence: 95, note: 'Internal calculation based on last sync times' },
    ],
    limitations: [
      'Only as fresh as the last pipeline run — if pipelines are stale, snapshot is stale',
      'Revenue blending across HubSpot and Sheets can double-count if the same deal appears in both',
      'Run snapshot AFTER all other pipelines or it aggregates incomplete data',
    ],
    decisionValue: 'HIGH for executive overview. Run it last, always.',
    refreshWindow: 'Runs after all pipelines complete. Should run every 4 hours minimum.',
  },
};

const CONFIDENCE_COLOR = (score) => {
  if (score >= 90) return { text: 'text-emerald-400', bg: 'bg-emerald-500', label: 'High', star: '★★★' };
  if (score >= 75) return { text: 'text-blue-400',    bg: 'bg-blue-500',    label: 'Good', star: '★★☆' };
  if (score >= 60) return { text: 'text-amber-400',   bg: 'bg-amber-500',   label: 'Medium', star: '★☆☆' };
  return               { text: 'text-red-400',     bg: 'bg-red-500',     label: 'Low', star: '☆☆☆' };
};

const ConfidenceBar = ({ score, isDark }) => {
  const { bg, text, label } = CONFIDENCE_COLOR(score);
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full rounded-full ${bg}`}
        />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${text}`}>{score}%</span>
      <span className={`text-xs ${text}`}>{label}</span>
    </div>
  );
};

// ─── Freshness helpers ──────────────────────────────────────────────────────
const hoursSince = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 36e5;
};

const formatAge = (hrs) => {
  if (hrs == null) return 'never';
  if (hrs < 1) return `${Math.round(hrs * 60)}m ago`;
  if (hrs < 48) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const freshnessBadge = (hrs, threshold) => {
  if (hrs == null) return { color: 'text-slate-400 bg-slate-500/10 border-slate-500/25', text: 'never', tone: 'idle' };
  if (hrs <= threshold) return { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', text: formatAge(hrs), tone: 'fresh' };
  if (hrs <= threshold * 3) return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/25', text: formatAge(hrs), tone: 'aging' };
  return { color: 'text-red-400 bg-red-500/10 border-red-500/25', text: formatAge(hrs), tone: 'stale' };
};

// ─── Embedded AI chat (floating, collapsible) ──────────────────────────────
const AnalystChat = ({ isDark, pipelines }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `Hi ${user?.first_name || 'there'} — I'm your data-quality analyst. Ask me things like "which pipelines haven't run in 24h?", "why is Meta ROAS 75% confidence?", or "what should I verify before a board meeting?"`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setSending(true);
    try {
      const { data } = await aiAPI.chat(q);
      setMessages((m) => [...m, { role: 'assistant', text: data?.answer || 'No response.' }]);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'AI request failed';
      setMessages((m) => [...m, { role: 'assistant', text: `Sorry — ${detail}` }]);
    } finally {
      setSending(false);
    }
  };

  // Context-aware quick prompts derived from what's actually loaded.
  const quickPrompts = useMemo(() => {
    const prompts = [
      'Which pipelines have the lowest data confidence?',
      'What should I verify before a board meeting?',
    ];
    const stale = (pipelines || []).filter((p) => {
      const h = hoursSince(p.last_run);
      const thr = PIPELINE_DOCS[p.name]?.stalenessThresholdHours ?? 8;
      return h != null && h > thr;
    });
    if (stale.length > 0) {
      prompts.unshift(`Why might ${stale[0].name} be stale (last ran ${formatAge(hoursSince(stale[0].last_run))})?`);
    }
    const failed = (pipelines || []).find((p) => p.status === 'failed' || p.status === 'error');
    if (failed) {
      prompts.unshift(`Explain the ${failed.name} pipeline failure in plain English.`);
    }
    return prompts.slice(0, 3);
  }, [pipelines]);

  const panelBg = isDark ? 'bg-[#1e2235] border border-slate-700/40' : 'bg-white border border-slate-200 shadow-xl';
  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputCls = isDark
    ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-indigo-500/60 placeholder-slate-500'
    : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-indigo-400 placeholder-slate-400';

  return (
    <>
      {/* Floating launcher — positioned bottom-LEFT so it doesn't collide
          with the main AI chatbot that lives at bottom-right on every page. */}
      {!open && (
        <motion.button
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg hover:shadow-indigo-500/30"
        >
          <Sparkles size={16} />
          <span className="text-sm font-semibold">Ask the Analyst</span>
        </motion.button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 left-6 z-40 w-[min(420px,calc(100vw-2rem))] h-[min(640px,calc(100vh-6rem))] rounded-2xl ${panelBg} flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
                  <Bot size={15} className="text-white" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${textPri}`}>Ask the Analyst</p>
                  <p className={`text-[11px] ${textSec}`}>Scoped to this page's data-quality context</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className={`p-1 rounded hover:bg-white/5 ${textSec}`}>
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    m.role === 'user'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'bg-violet-500/20 text-violet-400'
                  }`}>
                    {m.role === 'user' ? <UserIcon size={13} /> : <Bot size={13} />}
                  </div>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? (isDark ? 'bg-indigo-500/15 text-indigo-100' : 'bg-indigo-50 text-indigo-900')
                      : (isDark ? 'bg-slate-800/60 text-slate-200' : 'bg-slate-100 text-slate-800')
                  }`}>
                    <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 className="animate-spin text-violet-400" size={13} />
                  <span className={textSec}>Thinking…</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick prompts */}
            {messages.length <= 2 && quickPrompts.length > 0 && (
              <div className={`px-4 py-2 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'} flex flex-wrap gap-1.5`}>
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      isDark
                        ? 'border-slate-700 text-slate-300 hover:border-indigo-500/60'
                        : 'border-slate-300 text-slate-600 hover:border-indigo-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className={`px-3 py-3 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'} flex items-center gap-2`}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about the data…"
                className={`flex-1 px-3 py-2 rounded-lg text-sm outline-none ${inputCls}`}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="p-2 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white disabled:opacity-50"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const DataIntelligence = () => {
  const { isDark } = useTheme();
  const [pipelines, setPipelines]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState('hubspot');
  const [, setOverview]             = useState(null);

  const cardBg      = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSec     = isDark ? 'text-slate-400' : 'text-slate-500';
  const border      = isDark ? 'border-slate-700/40' : 'border-slate-200';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pipRes, ovRes] = await Promise.allSettled([
        pipelinesAPI.getAll(),
        dashboardAPI.getOverview(),
      ]);
      if (pipRes.status === 'fulfilled') setPipelines(pipRes.value.data.pipelines || []);
      if (ovRes.status === 'fulfilled')  setOverview(ovRes.value.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Overall platform confidence = weighted average
  const overallConfidence = Math.round(
    Object.values(PIPELINE_DOCS).flatMap((d) => d.dataPoints.map((p) => p.confidence))
      .reduce((a, b) => a + b, 0) /
    Object.values(PIPELINE_DOCS).flatMap((d) => d.dataPoints).length
  );

  const pipelineStatus = (name) => pipelines.find((p) => p.name === name) || {};

  // ─── Live data-quality signals ────────────────────────────────────────
  const qualitySignals = useMemo(() => {
    const rows = Object.entries(PIPELINE_DOCS).map(([name, doc]) => {
      const pipe = pipelineStatus(name);
      const hrs  = hoursSince(pipe.last_run);
      const thr  = doc.stalenessThresholdHours;
      const badge = freshnessBadge(hrs, thr);
      const records = pipe.records_fetched ?? pipe.records_loaded ?? null;
      const failed = pipe.status === 'failed' || pipe.status === 'error';
      return {
        name,
        label: doc.label,
        icon: doc.icon,
        status: pipe.status || 'idle',
        lastRunIso: pipe.last_run || null,
        hrs, threshold: thr, badge,
        records, failed,
        error: pipe.error || null,
        duration: pipe.duration_seconds ?? null,
      };
    });
    return {
      rows,
      stale: rows.filter((r) => r.badge.tone === 'stale' || r.badge.tone === 'aging'),
      errors: rows.filter((r) => r.failed),
      fresh: rows.filter((r) => r.badge.tone === 'fresh').length,
      total: rows.length,
      totalRecords: rows.reduce((a, r) => a + (r.records || 0), 0),
    };
  }, [pipelines]); // eslint-disable-line react-hooks/exhaustive-deps

  const healthScore = qualitySignals.total
    ? Math.round((qualitySignals.fresh / qualitySignals.total) * 100)
    : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <Shield className="text-white" size={20} />
                </div>
                <h1 className={`text-3xl font-bold ${textPrimary}`}>Data Intelligence</h1>
              </div>
              <p className={textSec}>
                What every pipeline pulls, data confidence levels, and what management can trust for decisions.
              </p>
            </div>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600/40 hover:border-indigo-500/60 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-400' : textSec} />
            </button>
          </div>
        </motion.div>

        {/* Platform-level confidence summary */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-6 mb-6 ${cardBg}`}
          style={{ borderLeft: `4px solid ${overallConfidence >= 85 ? '#10B981' : overallConfidence >= 70 ? '#3B82F6' : '#F59E0B'}` }}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${textSec}`}>Platform Data Confidence</p>
              <div className="flex items-end gap-2">
                <span className={`text-5xl font-black ${CONFIDENCE_COLOR(overallConfidence).text}`}>{overallConfidence}%</span>
                <span className={`text-sm mb-1 ${textSec}`}>weighted average across all pipelines</span>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Ad Spend & Clicks',   score: 99, note: 'Direct from ad platforms — trustworthy' },
                { label: 'CRM / Deal Data',     score: 95, note: 'HubSpot API — high confidence' },
                { label: 'Revenue Attribution', score: 82, note: 'Cross-platform — some modelling involved' },
                { label: 'Manual Sheet Data',   score: 70, note: 'Only as good as who updates it' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`text-xs w-44 ${textSec}`}>{row.label}</span>
                  <ConfidenceBar score={row.score} isDark={isDark} />
                  <span className={`text-xs hidden sm:block ${textSec}`}>{row.note}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`mt-4 pt-4 border-t ${border} text-sm ${textSec}`}>
            <span className="font-semibold text-violet-400">Bottom line for management: </span>
            Ad spend, CTR, and CRM pipeline data can be trusted for decisions today. Revenue numbers should be cross-validated between HubSpot (deals closed) and Google Sheets (manual entries) before board-level reporting.
          </div>
        </motion.div>

        {/* ─── LIVE Data Quality Signals (new) ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`rounded-xl p-6 mb-6 ${cardBg}`}
          style={{ borderLeft: `4px solid ${healthScore >= 80 ? '#10B981' : healthScore >= 50 ? '#F59E0B' : '#EF4444'}` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="text-indigo-400" size={18} />
              <div>
                <h3 className={`font-semibold ${textPrimary}`}>Live Data Quality Signals</h3>
                <p className={`text-xs ${textSec}`}>Actual sync freshness + records — updates every refresh.</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className={textSec}>Fresh</span>
                <span className={`ml-1 font-semibold ${healthScore >= 80 ? 'text-emerald-400' : healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {qualitySignals.fresh}/{qualitySignals.total}
                </span>
              </div>
              <div>
                <span className={textSec}>Records pulled</span>
                <span className={`ml-1 font-semibold ${textPrimary}`}>{qualitySignals.totalRecords.toLocaleString()}</span>
              </div>
              {qualitySignals.errors.length > 0 && (
                <div>
                  <span className={textSec}>Errors</span>
                  <span className="ml-1 font-semibold text-red-400">{qualitySignals.errors.length}</span>
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="animate-spin text-indigo-400" size={16} />
              <span className={`text-xs ${textSec}`}>Reading pipeline logs…</span>
            </div>
          )}

          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left text-xs uppercase tracking-wider ${textSec}`}>
                    <th className="py-2 pr-3">Pipeline</th>
                    <th className="py-2 pr-3">Last Sync</th>
                    <th className="py-2 pr-3">Expected Cadence</th>
                    <th className="py-2 pr-3 text-right">Records</th>
                    <th className="py-2 pr-3 text-right">Duration</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {qualitySignals.rows.map((r, i) => (
                    <tr key={r.name} className={`border-t ${border} ${i % 2 === 0 ? '' : (isDark ? 'bg-slate-800/20' : 'bg-slate-50/50')}`}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span>{r.icon}</span>
                          <span className={textPrimary}>{r.label}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${r.badge.color}`}>
                          {r.badge.text}
                        </span>
                      </td>
                      <td className={`py-2 pr-3 text-xs ${textSec}`}>≤ {r.threshold}h</td>
                      <td className={`py-2 pr-3 text-right ${textPrimary}`}>
                        {r.records != null ? r.records.toLocaleString() : '—'}
                      </td>
                      <td className={`py-2 pr-3 text-right ${textSec}`}>
                        {r.duration != null ? `${r.duration.toFixed(1)}s` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {r.failed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400">
                            <AlertTriangle size={11} /> failed
                          </span>
                        ) : r.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle size={11} /> ok
                          </span>
                        ) : (
                          <span className={`text-xs ${textSec}`}>{r.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Alert rollup */}
          {(qualitySignals.stale.length > 0 || qualitySignals.errors.length > 0) && !loading && (
            <div className="mt-4 space-y-2">
              {qualitySignals.errors.map((e) => (
                <div key={`err-${e.name}`} className="text-xs p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">{e.label}</span> last run failed.
                    {e.error && <span className={`block mt-0.5 ${textSec}`}>{e.error}</span>}
                  </div>
                </div>
              ))}
              {qualitySignals.stale.map((s) => (
                <div key={`stale-${s.name}`} className="text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-start gap-2">
                  <Clock size={13} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold">{s.label}</span> hasn't synced in {formatAge(s.hrs)} (expected ≤ {s.threshold}h). Numbers may be out of date.
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Live pipeline status strip */}
        {!loading && pipelines.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {Object.entries(PIPELINE_DOCS).map(([name, doc]) => {
              const pipe = pipelineStatus(name);
              const ok   = pipe.status === 'success';
              const err  = pipe.status === 'failed' || pipe.status === 'error';
              return (
                <div key={name} className={`rounded-lg p-3 ${cardBg} text-center`}>
                  <span className="text-xl block mb-1">{doc.icon}</span>
                  <p className={`text-xs font-medium ${textPrimary} truncate`}>{doc.label}</p>
                  <span className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full border ${
                    ok  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
                    err ? 'text-red-400 bg-red-500/10 border-red-500/25' :
                          'text-slate-400 bg-slate-500/10 border-slate-500/25'
                  }`}>
                    {ok ? 'OK' : err ? 'Error' : 'Idle'}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Per-pipeline accordion */}
        <div className="space-y-3">
          {Object.entries(PIPELINE_DOCS).map(([name, doc], idx) => {
            const pipe    = pipelineStatus(name);
            const isOpen  = expanded === name;
            const avgConf = Math.round(doc.dataPoints.reduce((s, p) => s + p.confidence, 0) / doc.dataPoints.length);
            const { text: confText, label: confLabel } = CONFIDENCE_COLOR(avgConf);
            const records = pipe.records_fetched ?? pipe.records_loaded ?? null;

            return (
              <motion.div key={name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className={`rounded-xl overflow-hidden ${cardBg}`}>

                {/* Accordion header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : name)}
                  className="w-full p-5 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{doc.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold ${textPrimary}`}>{doc.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          pipe.status === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
                          pipe.status === 'failed' || pipe.status === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/25' :
                          'text-slate-400 bg-slate-500/10 border-slate-500/25'
                        }`}>
                          {pipe.status || 'idle'}
                        </span>
                        <span className={`text-xs font-semibold ${confText}`}>
                          Avg confidence: {avgConf}% ({confLabel})
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${textSec}`}>{doc.purpose}</p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} className={textSec} /> : <ChevronDown size={16} className={textSec} />}
                </button>

                {/* Accordion body */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className={`border-t ${border} overflow-hidden`}
                    >
                      <div className="p-5 space-y-5">

                        {/* Data points table */}
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textSec}`}>Fields Pulled & Confidence</p>
                          <div className="space-y-2">
                            {doc.dataPoints.map((dp, i) => {
                              return (
                                <div key={i} className={`flex flex-wrap items-center gap-3 p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                                  <div className="flex-1 min-w-[180px]">
                                    <p className={`text-sm font-medium ${textPrimary}`}>{dp.field}</p>
                                    <p className={`text-xs mt-0.5 ${textSec}`}>{dp.note}</p>
                                  </div>
                                  <ConfidenceBar score={dp.confidence} isDark={isDark} />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Limitations */}
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${textSec}`}>Known Limitations</p>
                          <ul className="space-y-1.5">
                            {doc.limitations.map((lim, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                <span className={textSec}>{lim}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Decision value + refresh cadence */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}
                            style={{ borderLeft: `3px solid ${doc.color}` }}>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${textSec}`}>Decision Value</p>
                            <p className={`text-sm ${textPrimary}`}>{doc.decisionValue}</p>
                          </div>
                          <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}
                            style={{ borderLeft: '3px solid #6366F1' }}>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${textSec}`}>Refresh Window</p>
                            <p className={`text-sm ${textPrimary}`}>{doc.refreshWindow}</p>
                            {pipe.last_run && (
                              <p className={`text-xs mt-1 ${textSec}`}>
                                Last run: {new Date(pipe.last_run).toLocaleString()}
                                {records != null && ` · ${records.toLocaleString()} records`}
                                {pipe.duration_seconds != null && ` · ${pipe.duration_seconds.toFixed(1)}s`}
                              </p>
                            )}
                            {pipe.error && (
                              <p className={`text-xs mt-1 text-red-400`}>Error: {pipe.error}</p>
                            )}
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Management decision guide */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className={`rounded-xl p-6 mt-6 ${cardBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-violet-400" />
            <h3 className={`font-semibold ${textPrimary}`}>Management Decision Guide</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                question: 'Can I trust the ad spend numbers?',
                answer: 'YES — 99% confidence. Meta and Google both report billed spend directly. No modelling involved.',
                icon: CheckCircle, color: 'text-emerald-400',
              },
              {
                question: 'Can I trust the revenue figures?',
                answer: 'MOSTLY — HubSpot closed deals (95%) are reliable. Google Sheets (70%) needs a weekly human review before board use.',
                icon: AlertTriangle, color: 'text-amber-400',
              },
              {
                question: 'Can I trust Meta ROAS?',
                answer: 'USE AS DIRECTIONAL — iOS 14+ privacy changes mean Meta under-reports conversions ~20–35%. Cross-check with HubSpot deal data.',
                icon: Info, color: 'text-blue-400',
              },
              {
                question: 'Can I trust Google Ads ROAS?',
                answer: 'YES with conditions — Google tag tracking is more reliable than Meta. Verify the conversion tag is on all confirmation pages.',
                icon: CheckCircle, color: 'text-emerald-400',
              },
              {
                question: 'Are contractor numbers accurate?',
                answer: 'HIGH confidence for web traffic (GA4 direct), MEDIUM for lead counts (HubSpot tag required on their sites). Revenue requires Google Sheets updates.',
                icon: Info, color: 'text-blue-400',
              },
              {
                question: 'What should I do before a board meeting?',
                answer: '1. Run all pipelines fresh. 2. Review Google Sheets entries. 3. Cross-check HubSpot revenue vs Sheet totals. 4. Note any data with < 80% confidence.',
                icon: Star, color: 'text-violet-400',
              },
            ].map((item, i) => (
              <div key={i} className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                <div className="flex items-start gap-2 mb-2">
                  <item.icon size={15} className={`${item.color} mt-0.5 flex-shrink-0`} />
                  <p className={`text-sm font-semibold ${textPrimary}`}>{item.question}</p>
                </div>
                <p className={`text-xs ${textSec} leading-relaxed`}>{item.answer}</p>
              </div>
            ))}
          </div>
        </motion.div>

      </div>

      {/* Floating analyst chat */}
      <AnalystChat isDark={isDark} pipelines={pipelines} />
    </motion.div>
  );
};

export default DataIntelligence;
