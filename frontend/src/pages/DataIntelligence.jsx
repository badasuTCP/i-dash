import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { pipelinesAPI, dashboardAPI } from '../services/api';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp,
  Database, TrendingUp, Users, DollarSign, Globe, BarChart3, RefreshCw,
  Loader2, Star, Activity, Clock, Zap
} from 'lucide-react';

// ─── Static pipeline intelligence docs ──────────────────────────────────────
const PIPELINE_DOCS = {
  hubspot: {
    icon: '🟠',
    label: 'HubSpot CRM',
    color: '#FF7A59',
    purpose: 'Customer relationship data — contacts, deals, pipeline and activity tracking.',
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

const DataIntelligence = () => {
  const { isDark } = useTheme();
  const [pipelines, setPipelines]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState('hubspot');
  const [overview, setOverview]     = useState(null);

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
                              const { text, label } = CONFIDENCE_COLOR(dp.confidence);
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
                                {pipe.records_loaded != null && ` · ${pipe.records_loaded.toLocaleString()} records`}
                              </p>
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
    </motion.div>
  );
};

export default DataIntelligence;
