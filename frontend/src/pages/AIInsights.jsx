/**
 * AI Insights Page
 *
 * Replaces the prior /dashboard/ai route that used to re-render the
 * Executive Summary component. This is a dedicated page with three
 * sections:
 *
 *   1. Key Findings — auto-generated insights from /api/ai/insights
 *      (summary, anomalies, recommendations), respects the date picker
 *      via the `days` query param.
 *   2. Ask the AI — inline chat with I-Dash AI (calls /api/ai/chat).
 *   3. Generate Report — date-bound narrative report via /api/ai/report.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles, AlertTriangle, Lightbulb, TrendingUp, Send, Loader2,
  FileText, RefreshCw, Bot, User as UserIcon,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useDashboardDateFilter } from '../hooks/useDashboardDateFilter';
import { aiAPI } from '../services/api';
import toast from 'react-hot-toast';

// Compute days-of-lookback from the centralised date range so the
// insights endpoint matches what the user asked for. Backend accepts
// 1-1095d (~3 years) so a full-year pick lands as 365, not silently
// clamped down to 90.
function rangeToDays(dateRange) {
  if (!dateRange?.start || !dateRange?.end) return 7;
  const start = new Date(dateRange.start);
  const end = new Date(dateRange.end);
  const ms = end - start;
  const days = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
  return Math.min(days, 1095);
}

const AIInsights = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { dateRange } = useDashboardDateFilter();

  // ── Styles ───────────────────────────────────────────────────────────
  const cardBg      = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPri     = isDark ? 'text-white' : 'text-slate-900';
  const textSec     = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputCls    = isDark ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-indigo-500/60 placeholder-slate-500' : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-indigo-400 placeholder-slate-400';

  // ── Insights ─────────────────────────────────────────────────────────
  const days = useMemo(() => rangeToDays(dateRange), [dateRange]);
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [insightsError, setInsightsError] = useState(null);

  const fetchInsights = useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const { data } = await aiAPI.getInsights(days);
      setInsights(data);
    } catch (err) {
      setInsightsError(err?.response?.data?.detail || err?.message || 'Failed to load insights');
      setInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  }, [days]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  // ── Chat ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `Hi ${user?.first_name || 'there'} — I'm your I-Dash AI analyst. Ask me anything about the dashboards, trends, or campaign performance.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendChat = async (text) => {
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

  const quickQuestions = [
    "What's driving revenue this period?",
    'Compare Meta Ads vs Google Ads',
    'Any anomalies I should know about?',
    'Summarise the executive dashboard',
  ];

  // ── Report generation ────────────────────────────────────────────────
  const [report, setReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const generateReport = async () => {
    if (!dateRange?.start || !dateRange?.end) {
      toast.error('Pick a date range in the header first');
      return;
    }
    setGeneratingReport(true);
    try {
      const { data } = await aiAPI.generateReport(dateRange.start, dateRange.end, 'summary');
      // Backend envelope: { report_type, period_start, period_end, content, generated_at }
      // Render only the markdown `content` — previously the panel showed
      // the raw JSON envelope because the fallback chain ended in
      // JSON.stringify(data).
      const body = data?.content || data?.report || data?.text || '';
      if (!body.trim()) {
        toast.error('Report came back empty — try a different date range.');
        setReport(null);
      } else {
        setReport(body);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600"
            >
              <Sparkles className="text-white" size={22} />
            </motion.div>
            <div>
              <h1 className={`text-3xl font-bold ${textPri}`}>AI Insights</h1>
              <p className={textSec}>
                Auto-generated findings and natural-language Q&amp;A over your dashboard data — scoped to the selected date range ({days}d window)
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Key Findings ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`rounded-xl p-6 mb-6 ${cardBg}`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-indigo-400" size={18} />
              <h2 className={`text-lg font-semibold ${textPri}`}>Key Findings</h2>
            </div>
            <button
              onClick={fetchInsights}
              disabled={loadingInsights}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                isDark ? 'border-slate-700 text-slate-300 hover:border-indigo-500/60' : 'border-slate-300 text-slate-600 hover:border-indigo-400'
              } ${loadingInsights ? 'opacity-60 cursor-wait' : ''}`}
            >
              <RefreshCw size={12} className={loadingInsights ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {loadingInsights && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 className="animate-spin text-indigo-400" size={24} />
              <span className={textSec}>Analyzing {days} days of data…</span>
            </div>
          )}

          {!loadingInsights && insightsError && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Could not generate insights</p>
                <p>{insightsError}</p>
                <p className="mt-2 text-xs opacity-80">Check that GROQ_API_KEY is configured on the backend and that pipelines have recent data.</p>
              </div>
            </div>
          )}

          {!loadingInsights && !insightsError && insights && (
            <div className="space-y-4">
              {insights.summary && (
                <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                  <p className={`text-xs uppercase tracking-wider mb-2 ${textSec}`}>Summary</p>
                  <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
                    <ReactMarkdown>{insights.summary}</ReactMarkdown>
                  </div>
                </div>
              )}

              {Array.isArray(insights.key_findings) && insights.key_findings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="text-indigo-400" size={14} />
                    <p className={`text-xs uppercase tracking-wider ${textSec}`}>Key findings</p>
                  </div>
                  <ul className="space-y-2">
                    {insights.key_findings.map((f, i) => (
                      <li key={i} className={`text-sm flex gap-2 ${textPri}`}>
                        <span className="text-indigo-400 flex-shrink-0">›</span>
                        <span>{typeof f === 'string' ? f : (f.text || JSON.stringify(f))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(insights.anomalies) && insights.anomalies.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="text-amber-400" size={14} />
                    <p className={`text-xs uppercase tracking-wider ${textSec}`}>Anomalies</p>
                  </div>
                  <ul className="space-y-2">
                    {insights.anomalies.map((a, i) => (
                      <li key={i} className={`text-sm flex gap-2 ${textPri}`}>
                        <span className="text-amber-400 flex-shrink-0">⚠</span>
                        <span>{typeof a === 'string' ? a : (a.text || JSON.stringify(a))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(insights.recommendations) && insights.recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="text-emerald-400" size={14} />
                    <p className={`text-xs uppercase tracking-wider ${textSec}`}>Recommendations</p>
                  </div>
                  <ul className="space-y-2">
                    {insights.recommendations.map((r, i) => (
                      <li key={i} className={`text-sm flex gap-2 ${textPri}`}>
                        <span className="text-emerald-400 flex-shrink-0">✓</span>
                        <span>{typeof r === 'string' ? r : (r.text || JSON.stringify(r))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!insights.summary
                && !(insights.key_findings || []).length
                && !(insights.anomalies || []).length
                && !(insights.recommendations || []).length && (
                <p className={`text-sm ${textSec} py-4 text-center`}>
                  No insights generated for this window — widen the date range or run your pipelines for fresh data.
                </p>
              )}

              <p className={`text-[10px] ${textSec} pt-2 border-t ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
                Generated {insights.timestamp ? new Date(insights.timestamp).toLocaleString() : 'just now'} · {insights.period_days || days}-day window
              </p>
            </div>
          )}
        </motion.div>

        {/* ── Chat + Report side-by-side on wide screens ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Chat (2 cols on wide) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`xl:col-span-2 rounded-xl p-6 ${cardBg} flex flex-col`}
            style={{ minHeight: 520 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Bot className="text-indigo-400" size={18} />
              <h2 className={`text-lg font-semibold ${textPri}`}>Ask I-Dash AI</h2>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" style={{ maxHeight: 400 }}>
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm flex gap-2 ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : (isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800')
                  }`}>
                    {m.role === 'assistant' && <Bot size={14} className="mt-0.5 flex-shrink-0" />}
                    {m.role === 'user' && <UserIcon size={14} className="mt-0.5 flex-shrink-0" />}
                    <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'prose-invert' : (isDark ? 'prose-invert' : '')}`}>
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className={`px-3 py-2 rounded-lg text-sm flex gap-2 ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendChat(q)}
                  disabled={sending}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    isDark ? 'border-slate-700 text-slate-300 hover:border-indigo-500/60' : 'border-slate-300 text-slate-600 hover:border-indigo-400'
                  } disabled:opacity-50`}
                >
                  {q}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about revenue, leads, anomalies…"
                className={`flex-1 px-3 py-2 rounded-lg text-sm outline-none ${inputCls}`}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send size={14} /> Send
              </button>
            </form>
          </motion.div>

          {/* Report (1 col) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <FileText className="text-violet-400" size={18} />
              <h2 className={`text-lg font-semibold ${textPri}`}>Natural-Language Report</h2>
            </div>

            <p className={`text-xs ${textSec} mb-3`}>
              Generates a prose summary of the selected date range — useful for drop-in to an email or memo.
            </p>

            <button
              onClick={generateReport}
              disabled={generatingReport || !dateRange?.start}
              className="w-full px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generatingReport ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {generatingReport ? 'Generating…' : 'Generate Report'}
            </button>

            <AnimatePresence>
              {report && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`mt-4 p-3 rounded-lg text-xs ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'} overflow-y-auto`}
                  style={{ maxHeight: 380 }}
                >
                  <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default AIInsights;
