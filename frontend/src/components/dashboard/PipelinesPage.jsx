import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PlayCircle, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const PipelinesPage = () => {
  const { isDark } = useTheme();
  const [isRunning, setIsRunning] = useState(false);

  const pipelines = [
    {
      id: 1,
      name: 'HubSpot',
      icon: '🟠',
      status: 'success',
      lastRun: '2 min ago',
      recordsFetched: 1240,
      nextRun: '3h 58m',
    },
    {
      id: 2,
      name: 'Meta Ads',
      icon: '🔵',
      status: 'success',
      lastRun: '5 min ago',
      recordsFetched: 856,
      nextRun: '2h 55m',
    },
    {
      id: 3,
      name: 'Google Ads',
      icon: '🟡',
      status: 'success',
      lastRun: '5 min ago',
      recordsFetched: 1102,
      nextRun: '2h 55m',
    },
    {
      id: 4,
      name: 'Google Sheets',
      icon: '🟢',
      status: 'success',
      lastRun: '12 min ago',
      recordsFetched: 324,
      nextRun: '3h 48m',
    },
  ];

  const executionHistory = [
    { id: 1, pipeline: 'HubSpot', status: 'success', timestamp: '2 min ago', duration: '52s', records: 1240 },
    { id: 2, pipeline: 'Meta Ads', status: 'success', timestamp: '5 min ago', duration: '38s', records: 856 },
    { id: 3, pipeline: 'Google Ads', status: 'success', timestamp: '5 min ago', duration: '1m 2s', records: 1102 },
    { id: 4, pipeline: 'Google Sheets', status: 'success', timestamp: '12 min ago', duration: '18s', records: 324 },
    { id: 5, pipeline: 'HubSpot', status: 'success', timestamp: '1h 58m ago', duration: '51s', records: 1245 },
    { id: 6, pipeline: 'Meta Ads', status: 'success', timestamp: '3h 5m ago', duration: '39s', records: 848 },
    { id: 7, pipeline: 'Google Ads', status: 'success', timestamp: '3h 5m ago', duration: '1m 1s', records: 1098 },
    { id: 8, pipeline: 'Google Sheets', status: 'success', timestamp: '3h 12m ago', duration: '19s', records: 320 },
  ];

  const handleRunAll = async () => {
    setIsRunning(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsRunning(false);
  };

  const getStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle size={20} className="text-emerald-500" />;
    if (status === 'warning') return <AlertCircle size={20} className="text-amber-500" />;
    return <Clock size={20} className="text-slate-400" />;
  };

  const getStatusColor = (status) => {
    if (status === 'success') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    if (status === 'warning') return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'bg-slate-50 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Data Pipelines</h1>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>Manage and monitor data integrations</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRunAll}
              disabled={isRunning}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg font-medium hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <PlayCircle size={20} />
                  Run All Pipelines
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Pipeline Status Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
        >
          {pipelines.map((pipeline, idx) => (
            <motion.div
              key={pipeline.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.05 }}
              className={`p-6 rounded-xl border-l-4 border border-l-indigo-500 ${
                isDark
                  ? 'bg-[#1e2235] border-slate-700/30'
                  : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{pipeline.icon}</span>
                  <h3 className={`font-semibold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {pipeline.name}
                  </h3>
                </div>
                <motion.span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    pipeline.status === 'success'
                      ? isDark
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-emerald-100 text-emerald-700'
                      : isDark
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {pipeline.status === 'success' ? 'Healthy' : 'Synced'}
                </motion.span>
              </div>

              <div className="space-y-3">
                <div>
                  <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Last Run</p>
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {pipeline.lastRun}
                  </p>
                </div>

                <div>
                  <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Records</p>
                  <p className={`text-lg font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    {pipeline.recordsFetched.toLocaleString()}
                  </p>
                </div>

                <div>
                  <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Next Run</p>
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {pipeline.nextRun}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Execution History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`rounded-xl border overflow-hidden ${
            isDark
              ? 'bg-slate-900/40 backdrop-blur-md border-slate-700/30'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className={`p-6 border-b ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
            <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Execution History
            </h2>
            <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Last 10 pipeline runs</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>Pipeline</th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>Status</th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>Timestamp</th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>Duration</th>
                  <th className={`px-6 py-4 text-left text-sm font-semibold ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>Records</th>
                </tr>
              </thead>
              <tbody>
                {executionHistory.map((run, idx) => (
                  <motion.tr
                    key={run.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`border-b transition-colors ${
                      isDark
                        ? 'border-slate-800/30 hover:bg-slate-800/30'
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <td className={`px-6 py-4 text-sm font-medium ${
                      isDark ? 'text-slate-200' : 'text-slate-900'
                    }`}>{run.pipeline}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                        {run.status === 'success' ? 'Success' : 'Warning'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {run.timestamp}
                    </td>
                    <td className={`px-6 py-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {run.duration}
                    </td>
                    <td className={`px-6 py-4 text-sm font-medium ${
                      isDark ? 'text-slate-200' : 'text-slate-900'
                    }`}>{run.records.toLocaleString()}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default PipelinesPage;
