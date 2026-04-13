import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Download, LogOut, Settings, Shield, Filter } from 'lucide-react';
import { useAuth, ROLE_PERMISSIONS } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalDate } from '../../context/GlobalDateContext';
import DateRangePicker from '../common/DateRangePicker';

export const Header = () => {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const { setGlobalDate, clearGlobalDate, isFiltered } = useGlobalDate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const roleInfo = ROLE_PERMISSIONS[user?.role] || {};
  const initials = user?.first_name?.[0] || 'U';

  const getPageInfo = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes('/ibos/web-analytics')) return { title: 'I-BOS Web Analytics', badge: 'Contractor' };
    if (path.includes('/ibos/marketing')) return { title: 'I-BOS Marketing', badge: 'Contractor' };
    if (path.includes('/ibos')) return { title: 'I-BOS Dashboard', badge: 'Contractor' };
    if (path.includes('/sanitred/web-analytics')) return { title: 'Sani-Tred Web Analytics', badge: 'Retail' };
    if (path.includes('/sanitred/marketing')) return { title: 'Sani-Tred Marketing', badge: 'Retail' };
    if (path.includes('/sanitred')) return { title: 'Sani-Tred Dashboard', badge: 'Retail' };
    if (path.includes('/cp/web-analytics')) return { title: 'CP Web Analytics', badge: 'Main' };
    if (path.includes('/cp/marketing')) return { title: 'CP Marketing Campaign', badge: 'Main' };
    if (path.includes('/cp')) return { title: 'CP Dashboard', badge: 'Main' };
    if (path.includes('/executive')) return { title: 'Executive Summary', badge: 'All Divisions' };
    if (path.includes('/pipelines')) return { title: 'Data Pipelines', badge: null };
    if (path.includes('/ai')) return { title: 'AI Insights', badge: null };
    if (path.includes('/accounts')) return { title: 'Account Management', badge: null };
    if (path.includes('/settings')) return { title: 'Settings', badge: null };
    return { title: 'Dashboard', badge: null };
  };

  const { title: pageTitle, badge } = getPageInfo();

  const badgeColors = {
    'All Divisions': 'bg-[#265AA9]/15 text-[#55A8C3] border-[#265AA9]/20',
    'Main': 'bg-blue-500/15 text-blue-500 border-blue-500/20',
    'Retail': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
    'Contractor': 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  };

  return (
    <header className={`sticky top-0 z-20 h-16 flex items-center justify-between px-6 ${
      isDark
        ? 'bg-[#1e2235] border-b border-slate-700/30'
        : 'bg-white border-b border-slate-200'
    }`}>
      {/* Left - Page Title */}
      <div className="flex items-center gap-3">
        <h1 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {pageTitle}
        </h1>
        {badge && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badgeColors[badge] || ''}`}>
            {badge}
          </span>
        )}
      </div>

      {/* Center - Global Date Picker */}
      <div className="flex items-center gap-2">
        {isFiltered && (
          <motion.button onClick={clearGlobalDate}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
            title="Clear global date filter"
          >
            <Filter size={10} /> Filtered
          </motion.button>
        )}
        <DateRangePicker onApply={setGlobalDate} onClear={clearGlobalDate} />
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
            isDark
              ? 'border-slate-600/50 text-slate-300 hover:border-slate-500 hover:text-slate-200'
              : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900'
          }`}
        >
          <Download size={18} />
          <span className="text-sm font-medium hidden sm:inline">Export</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`relative p-2 rounded-lg transition-all duration-200 ${
            isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-100'
          }`}
        >
          <Bell size={20} className={isDark ? 'text-slate-400' : 'text-slate-600'} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </motion.button>

        {/* User avatar + menu */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-[#265AA9] to-[#55A8C3] flex items-center justify-center text-sm font-bold text-white shadow-md shadow-[#265AA9]/20"
            title={user?.full_name || 'User'}
          >
            {initials}
          </motion.button>

          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`absolute top-full right-0 mt-2 rounded-xl shadow-xl overflow-hidden min-w-[240px] z-40 ${
                isDark
                  ? 'bg-[#1e2235] border border-slate-700/50'
                  : 'bg-white border border-slate-200'
              }`}
            >
              <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
                <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {user?.full_name || `${user?.first_name} ${user?.last_name}`}
                </p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user?.email}</p>
                {/* Role badge */}
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    user?.role === 'data-analyst'
                      ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                      : 'bg-[#265AA9]/15 text-[#55A8C3] border border-[#265AA9]/20'
                  }`}>
                    <Shield size={10} />
                    {roleInfo.label || user?.role}
                  </span>
                </div>
              </div>
              <a href="/settings" onClick={() => setShowUserMenu(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  isDark ? 'text-slate-300 hover:bg-slate-800/50' : 'text-slate-700 hover:bg-slate-100'
                }`}>
                <Settings size={16} /> Settings
              </a>
              <button onClick={() => { logout(); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-t ${
                  isDark ? 'text-red-400 hover:bg-red-500/10 border-slate-700/30' : 'text-red-600 hover:bg-red-50 border-slate-200'
                }`}>
                <LogOut size={16} /> Logout
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
