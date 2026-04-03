import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Bell, CheckCircle, AlertCircle, Mail, Zap, Activity, Hash } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const SettingsPage = () => {
  const { isDark, theme, toggleTheme } = useTheme();
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPipeline, setNotifPipeline] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(true);
  const [notifAnomaly, setNotifAnomaly] = useState(false);

  const integrations = [
    { name: 'HubSpot', status: 'connected', icon: '🟠' },
    { name: 'Meta Ads', status: 'connected', icon: '🔵' },
    { name: 'Google Ads', status: 'connected', icon: '🟡' },
    { name: 'Google Sheets', status: 'connected', icon: '🟢' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Settings</h1>
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            Manage your preferences and integrations
          </p>
        </motion.div>

        {/* Profile Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`rounded-xl border p-8 mb-8 ${
            isDark
              ? 'bg-[#1e2235] border-slate-700/30'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <h2 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>Profile</h2>

          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
              D
            </div>
            <div>
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Daniel
              </h3>
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                daniel@theconcreteprotector.com
              </p>
              <motion.span
                className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                  isDark
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                Admin
              </motion.span>
            </div>
          </div>
        </motion.div>

        {/* Appearance Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`rounded-xl border p-8 mb-8 ${
            isDark
              ? 'bg-[#1e2235] border-slate-700/30'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <h2 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>Appearance</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Theme</p>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Current: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className={`p-3 rounded-lg transition-all ${
                isDark
                  ? 'bg-slate-800/50 text-yellow-400 hover:bg-slate-700/50'
                  : 'bg-slate-100 text-indigo-600 hover:bg-slate-200'
              }`}
            >
              {isDark ? <Sun size={24} /> : <Moon size={24} />}
            </motion.button>
          </div>
        </motion.div>

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`rounded-xl border p-8 mb-8 ${
            isDark
              ? 'bg-[#1e2235] border-slate-700/30'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <h2 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>Notifications</h2>

          <div className="space-y-4">
            {[
              { label: 'Email Reports', desc: 'Get reports delivered to email', icon: Mail, state: notifEmail, setter: setNotifEmail },
              { label: 'Pipeline Alerts', desc: 'Alerts for pipeline changes', icon: Zap, state: notifPipeline, setter: setNotifPipeline },
              { label: 'Weekly Summary', desc: 'Weekly performance summary', icon: Activity, state: notifWeekly, setter: setNotifWeekly },
              { label: 'Anomaly Detection', desc: 'Alert on unusual patterns', icon: Hash, state: notifAnomaly, setter: setNotifAnomaly },
            ].map((notif, idx) => (
              <motion.div
                key={idx}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  isDark
                    ? 'border-slate-700/30 hover:bg-slate-800/30'
                    : 'border-slate-200 hover:bg-slate-50'
                } transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <notif.icon size={20} className={isDark ? 'text-indigo-400' : 'text-indigo-600'} />
                  <div>
                    <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{notif.label}</p>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{notif.desc}</p>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={notif.state}
                  onChange={(e) => notif.setter(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Data Sources Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`rounded-xl border p-8 ${
            isDark
              ? 'bg-[#1e2235] border-slate-700/30'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <h2 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-slate-900'}`}>Data Sources</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((integration, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * idx }}
                className={`p-6 rounded-lg border flex items-start gap-4 ${
                  isDark
                    ? 'bg-slate-800/30 border-slate-700/30'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-3xl">{integration.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {integration.name}
                    </h3>
                    <CheckCircle className="text-emerald-500" size={18} />
                  </div>
                  <motion.span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                      integration.status === 'connected'
                        ? isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                        : isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {integration.status === 'connected' ? 'Connected ✓' : 'Synced'}
                  </motion.span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
