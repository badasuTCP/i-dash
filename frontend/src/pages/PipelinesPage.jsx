import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  Database, Activity, AlertTriangle, CheckCircle, XCircle, Clock,
  Play, RefreshCw, Settings, Zap, Terminal, BarChart3, Server
} from 'lucide-react';

const pipelineStatuses = [
  { name: 'HubSpot', icon: '🟠', status: 'connected', lastSync: '12 min ago', records: '45,280', nextRun: '1h 48m', enabled: true, frequency: '2hrs' },
  { name: 'Meta Ads', icon: '🔵', status: 'connected', lastSync: '28 min ago', records: '128,450', nextRun: '1h 32m', enabled: true, frequency: '2hrs' },
  { name: 'Google Ads', icon: '🟢', status: 'error', lastSync: '2h 15m ago', records: '52,180', nextRun: 'Paused', enabled: false, frequency: '4hrs' },
  { name: 'Google Sheets', icon: '📊', status: 'connected', lastSync: '45 min ago', records: '19,340', nextRun: '5h 15m', enabled: true, frequency: '6hrs' },
];

const runHistory = [
  { pipeline: 'HubSpot', status: 'success', startedAt: 'Mar 26, 10:14 AM', duration: '1m 42s', records: 1245, errors: 0 },
  { pipeline: 'Meta Ads', status: 'success', startedAt: 'Mar 26, 10:12 AM', duration: '2m 08s', records: 3420, errors: 0 },
  { pipeline: 'Google Ads', status: 'failed', startedAt: 'Mar 26, 8:00 AM', duration: '0m 14s', records: 0, errors: 1 },
  { pipeline: 'Google Sheets', status: 'success', startedAt: 'Mar 26, 9:45 AM', duration: '0m 38s', records: 890, errors: 0 },
  { pipeline: 'HubSpot', status: 'success', startedAt: 'Mar 26, 8:14 AM', duration: '1m 35s', records: 1180, errors: 0 },
  { pipeline: 'Meta Ads', status: 'success', startedAt: 'Mar 26, 8:12 AM', duration: '2m 22s', records: 3280, errors: 0 },
  { pipeline: 'Snapshot Aggregator', status: 'success', startedAt: 'Mar 26, 7:00 AM', duration: '3m 45s', records: 12450, errors: 2 },
  { pipeline: 'HubSpot', status: 'running', startedAt: 'Mar 26, 6:14 AM', duration: '—', records: 0, errors: 0 },
  { pipeline: 'Google Sheets', status: 'success', startedAt: 'Mar 26, 3:45 AM', duration: '0m 42s', records: 920, errors: 0 },
  { pipeline: 'Meta Ads', status: 'success', startedAt: 'Mar 25, 10:12 PM', duration: '2m 15s', records: 3150, errors: 0 },
];

const logEntries = [
  { time: '10:14:22', level: 'info', message: '[HubSpot] Pipeline started — fetching contacts, deals, companies' },
  { time: '10:14:28', level: 'info', message: '[HubSpot] Fetched 1,245 contacts (42 new, 1,203 updated)' },
  { time: '10:15:04', level: 'info', message: '[HubSpot] Fetched 89 deals — $487,500 pipeline value' },
  { time: '10:15:42', level: 'info', message: '[HubSpot] Sync complete — 1,245 records in 1m 42s' },
  { time: '10:12:15', level: 'info', message: '[Meta Ads] Pipeline started — fetching campaigns, ad sets, ads' },
  { time: '10:13:22', level: 'warn', message: '[Meta Ads] Rate limit warning — 80% of hourly quota used' },
  { time: '10:14:23', level: 'info', message: '[Meta Ads] Sync complete — 3,420 records in 2m 08s' },
  { time: '08:00:02', level: 'error', message: '[Google Ads] Authentication failed — refresh token expired' },
  { time: '08:00:14', level: 'error', message: '[Google Ads] Pipeline aborted after 3 retry attempts' },
  { time: '09:45:08', level: 'info', message: '[Google Sheets] Sync complete — 890 records in 0m 38s' },
];

const aiInsights = [
  { type: 'warning', text: 'HubSpot contact sync has 3 duplicate records detected — recommend dedup review' },
  { type: 'info', text: 'Meta Ads spend data shows 2.3% variance from Google Sheets totals — within acceptable range' },
  { type: 'error', text: 'Google Ads pipeline has been down for 2+ hours — token refresh required' },
  { type: 'success', text: 'Data freshness improved 8% this week — all pipelines averaging 94% freshness score' },
];

const PipelinesPage = () => {
  const { isDark } = useTheme();
  const [schedulers, setSchedulers] = useState(
    pipelineStatuses.map(p => ({ name: p.name, enabled: p.enabled, frequency: p.frequency }))
  );

  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';
  const tableBorder = isDark ? 'border-slate-700/30' : 'border-slate-200';
  const tableRowHover = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';

  const statusBadge = (status) => {
    const styles = {
      success: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
      failed: 'bg-red-500/15 text-red-500 border-red-500/20',
      running: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
      connected: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
      error: 'bg-red-500/15 text-red-500 border-red-500/20',
    };
    return `px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || ''}`;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Database className={isDark ? 'text-indigo-400' : 'text-indigo-600'} size={28} />
            <h1 className={`text-3xl font-bold ${textPrimary}`}>Data Pipelines</h1>
          </div>
          <p className={textSecondary}>ETL pipeline management, scheduling, and data health monitoring</p>
        </motion.div>

        {/* Pipeline Status Cards */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {pipelineStatuses.map((pipeline, idx) => (
            <div key={idx} className={`rounded-xl p-5 ${cardBg}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{pipeline.icon}</span>
                  <span className={`font-semibold text-sm ${textPrimary}`}>{pipeline.name}</span>
                </div>
                <span className={statusBadge(pipeline.status)}>
                  {pipeline.status === 'connected' ? 'Connected' : 'Error'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={textSecondary}>Last Sync</span>
                  <span className={textPrimary}>{pipeline.lastSync}</span>
                </div>
                <div className="flex justify-between">
                  <span className={textSecondary}>Records</span>
                  <span className={textPrimary}>{pipeline.records}</span>
                </div>
                <div className="flex justify-between">
                  <span className={textSecondary}>Next Run</span>
                  <span className={pipeline.nextRun === 'Paused' ? 'text-red-400' : textPrimary}>{pipeline.nextRun}</span>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Data Health Monitor */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Data Health Monitor</h3>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className={textSecondary}>Data Freshness</span>
              <span className="text-emerald-500 font-semibold">94%</span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '94%' }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Records', value: '245,250', icon: Database },
              { label: 'Failed Jobs (24h)', value: '3', icon: AlertTriangle },
              { label: 'Avg Sync Time', value: '2m 15s', icon: Clock },
              { label: 'Uptime', value: '99.8%', icon: Activity },
            ].map((stat, idx) => (
              <div key={idx} className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon size={14} className={textSecondary} />
                  <span className={`text-xs ${textSecondary}`}>{stat.label}</span>
                </div>
                <span className={`text-lg font-bold ${textPrimary}`}>{stat.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Scheduler Controls */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`rounded-xl p-6 mb-8 ${cardBg}`}>
          <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Scheduler Controls</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${tableBorder}`}>
                  <th className={`text-left py-3 px-4 font-semibold ${textSecondary}`}>Pipeline</th>
                  <th className={`text-center py-3 px-4 font-semibold ${textSecondary}`}>Enabled</th>
                  <th className={`text-center py-3 px-4 font-semibold ${textSecondary}`}>Frequency</th>
                  <th className={`text-center py-3 px-4 font-semibold ${textSecondary}`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {schedulers.map((sched, idx) => (
                  <tr key={idx} className={`border-b ${tableBorder} ${tableRowHover}`}>
                    <td className={`py-3 px-4 font-medium ${textPrimary}`}>{sched.name}</td>
                    <td className="text-center py-3 px-4">
                      <button
                        onClick={() => {
                          const updated = [...schedulers];
                          updated[idx].enabled = !updated[idx].enabled;
                          setSchedulers(updated);
                        }}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          sched.enabled ? 'bg-emerald-500' : isDark ? 'bg-slate-700' : 'bg-slate-300'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          sched.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                    <td className="text-center py-3 px-4">
                      <select
                        value={sched.frequency}
                        onChange={(e) => {
                          const updated = [...schedulers];
                          updated[idx].frequency = e.target.value;
                          setSchedulers(updated);
                        }}
                        className={`px-2 py-1 rounded text-xs border ${
                          isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'
                        }`}
                      >
                        <option value="2hrs">Every 2 hours</option>
                        <option value="4hrs">Every 4 hours</option>
                        <option value="6hrs">Every 6 hours</option>
                        <option value="12hrs">Every 12 hours</option>
                        <option value="daily">Daily</option>
                      </select>
                    </td>
                    <td className="text-center py-3 px-4">
                      <button className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1 mx-auto">
                        <Play size={12} /> Run Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Run History + ETL Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Pipeline Run History</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {runHistory.map((run, idx) => (
                <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${
                  isDark ? 'bg-slate-800/30' : 'bg-slate-50'
                }`}>
                  <div>
                    <span className={`font-medium text-sm ${textPrimary}`}>{run.pipeline}</span>
                    <span className={`text-xs block ${textSecondary}`}>{run.startedAt}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${textSecondary}`}>{run.duration}</span>
                    <span className={statusBadge(run.status)}>
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Terminal size={18} className={textPrimary} />
              <h3 className={`text-lg font-semibold ${textPrimary}`}>ETL Log Viewer</h3>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-4 max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed">
              {logEntries.map((entry, idx) => {
                const levelColors = { info: 'text-emerald-400', warn: 'text-yellow-400', error: 'text-red-400' };
                return (
                  <div key={idx} className="mb-1">
                    <span className="text-slate-500">[{entry.time}]</span>{' '}
                    <span className={levelColors[entry.level]}>[{entry.level.toUpperCase()}]</span>{' '}
                    <span className="text-slate-300">{entry.message}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* AI Data Quality Insights */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className={`rounded-xl p-6 ${cardBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-violet-400" />
            <h3 className={`text-lg font-semibold ${textPrimary}`}>AI-Powered Data Quality Insights</h3>
          </div>
          <div className="space-y-3">
            {aiInsights.map((insight, idx) => {
              const iconMap = {
                warning: <AlertTriangle size={16} className="text-yellow-400" />,
                info: <Activity size={16} className="text-blue-400" />,
                error: <XCircle size={16} className="text-red-400" />,
                success: <CheckCircle size={16} className="text-emerald-400" />,
              };
              const borderMap = {
                warning: 'border-l-yellow-400',
                info: 'border-l-blue-400',
                error: 'border-l-red-400',
                success: 'border-l-emerald-400',
              };
              return (
                <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${borderMap[insight.type]} ${
                  isDark ? 'bg-slate-800/30' : 'bg-slate-50'
                }`}>
                  {iconMap[insight.type]}
                  <span className={`text-sm ${textSecondary}`}>{insight.text}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default PipelinesPage;
