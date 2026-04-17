import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Bell, Download, LogOut, Settings, Shield, Filter, FileText, FileSpreadsheet, AlertCircle, CheckCircle2, Users, ChevronRight } from 'lucide-react';
import { useAuth, ROLE_PERMISSIONS } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useExport, toCSV, downloadBlob } from '../../context/ExportContext';
import { contractorsAPI, pipelinesAPI } from '../../services/api';
import DateRangePicker from '../common/DateRangePicker';

export const Header = () => {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const { setGlobalDate, clearGlobalDate, isFiltered } = useGlobalDate();
  const { payload: exportPayload } = useExport();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notifications, setNotifications] = useState({ pending: [], failed: [], loading: false });

  // Poll notifications every 60s
  useEffect(() => {
    let cancelled = false;
    const fetchNotifications = async () => {
      setNotifications((prev) => ({ ...prev, loading: true }));
      try {
        const [pendingRes, pipelinesRes] = await Promise.all([
          contractorsAPI.getPending().catch(() => ({ data: [] })),
          pipelinesAPI.getAll().catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const pending = Array.isArray(pendingRes.data) ? pendingRes.data : [];
        const pipelines = Array.isArray(pipelinesRes.data) ? pipelinesRes.data : (pipelinesRes.data?.pipelines || []);
        const failed = pipelines.filter((p) => p.status === 'failed' || p.status === 'error');
        setNotifications({ pending, failed, loading: false });
      } catch {
        if (!cancelled) setNotifications({ pending: [], failed: [], loading: false });
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const notifCount = notifications.pending.length + notifications.failed.length;

  // ── Export handlers ────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setShowExportMenu(false);
    if (!exportPayload?.rows?.length) {
      toast.error('No data available to export on this page');
      return;
    }
    try {
      setExporting(true);
      const csv = toCSV(exportPayload.rows, exportPayload.columns || []);
      const filename = `${(exportPayload.title || 'export').toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
      toast.success('CSV exported');
    } catch (err) {
      toast.error('CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setShowExportMenu(false);
    try {
      setExporting(true);
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');
      const main = document.querySelector('main');
      if (!main) { toast.error('Unable to capture page'); return; }
      const canvas = await html2canvas(main, { scale: 2, backgroundColor: isDark ? '#0f1117' : '#f0f2f5', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'pt', [canvas.width, canvas.height]);
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const filename = `${(exportPayload?.title || getPageInfo().title).toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
      toast.success('PDF exported');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const roleInfo = ROLE_PERMISSIONS[user?.role] || {};
  const initials = user?.first_name?.[0] || 'U';

  const getPageInfo = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes('/ibos/web-analytics')) return { title: 'I-BOS Web Analytics', badge: 'Contractor' };
    if (path.includes('/ibos/marketing')) return { title: 'I-BOS Marketing', badge: 'Contractor' };
    if (path.includes('/ibos')) return { title: 'I-BOS Dashboard', badge: 'Contractor' };
    if (path.includes('/sanitred/web-analytics')) return { title: 'Sani-Tred Web Analytics', badge: 'Retail' };
    if (path.includes('/sanitred/marketing')) return { title: 'Sani-Tred Marketing', badge: 'Retail' };
    if (path.includes('/sanitred/retail')) return { title: 'Sani-Tred Store', badge: 'Retail' };
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
        {/* Export button with dropdown */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={exporting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
              isDark
                ? 'border-slate-600/50 text-slate-300 hover:border-slate-500 hover:text-slate-200'
                : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900'
            } ${exporting ? 'opacity-50 cursor-wait' : ''}`}
          >
            <Download size={18} />
            <span className="text-sm font-medium hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
          </motion.button>
          <AnimatePresence>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className={`absolute top-full right-0 mt-2 rounded-xl shadow-xl overflow-hidden min-w-[240px] z-40 ${
                    isDark ? 'bg-[#1e2235] border border-slate-700/50' : 'bg-white border border-slate-200'
                  }`}
                >
                  <div className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500 border-b border-slate-700/30' : 'text-slate-400 border-b border-slate-200'}`}>
                    Export {pageTitle}
                  </div>
                  <button onClick={handleExportPDF}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isDark ? 'text-slate-300 hover:bg-slate-800/50' : 'text-slate-700 hover:bg-slate-100'
                    }`}>
                    <FileText size={16} className="text-rose-400" />
                    <div className="flex-1 text-left">
                      <p className="font-medium">Export as PDF</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Full page snapshot</p>
                    </div>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={!exportPayload?.rows?.length}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      !exportPayload?.rows?.length ? 'opacity-40 cursor-not-allowed' : ''
                    } ${isDark ? 'text-slate-300 hover:bg-slate-800/50' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <FileSpreadsheet size={16} className="text-emerald-400" />
                    <div className="flex-1 text-left">
                      <p className="font-medium">Export as CSV</p>
                      <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {exportPayload?.rows?.length ? `${exportPayload.rows.length} rows` : 'No tabular data on this page'}
                      </p>
                    </div>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className={`relative p-2 rounded-lg transition-all duration-200 ${
              isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-100'
            }`}
          >
            <Bell size={20} className={isDark ? 'text-slate-400' : 'text-slate-600'} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </motion.button>
          <AnimatePresence>
            {showNotifMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNotifMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className={`absolute top-full right-0 mt-2 rounded-xl shadow-xl overflow-hidden w-[340px] max-h-[480px] overflow-y-auto z-40 ${
                    isDark ? 'bg-[#1e2235] border border-slate-700/50' : 'bg-white border border-slate-200'
                  }`}
                >
                  <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Notifications</h4>
                    <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{notifCount} active</span>
                  </div>
                  {notifCount === 0 ? (
                    <div className={`px-4 py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" />
                      <p className="text-sm">All caught up</p>
                      <p className="text-[10px] mt-0.5">No pending approvals or pipeline failures</p>
                    </div>
                  ) : (
                    <div>
                      {notifications.pending.length > 0 && (
                        <a href="/pipelines?tab=contractors&filter=pending" onClick={() => setShowNotifMenu(false)}
                          className={`flex items-center gap-3 px-4 py-3 border-b transition-colors ${
                            isDark ? 'border-slate-700/30 hover:bg-slate-800/50' : 'border-slate-200 hover:bg-slate-50'
                          }`}>
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                            <Users size={14} className="text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              {notifications.pending.length} pending contractor{notifications.pending.length === 1 ? '' : 's'}
                            </p>
                            <p className={`text-[11px] truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                              Meta/GA4 discovered — review & approve
                            </p>
                          </div>
                          <ChevronRight size={14} className={isDark ? 'text-slate-600' : 'text-slate-400'} />
                        </a>
                      )}
                      {notifications.failed.length > 0 && (
                        <a href="/pipelines" onClick={() => setShowNotifMenu(false)}
                          className={`flex items-center gap-3 px-4 py-3 border-b transition-colors ${
                            isDark ? 'border-slate-700/30 hover:bg-slate-800/50' : 'border-slate-200 hover:bg-slate-50'
                          }`}>
                          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                            <AlertCircle size={14} className="text-rose-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              {notifications.failed.length} pipeline failure{notifications.failed.length === 1 ? '' : 's'}
                            </p>
                            <p className={`text-[11px] truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                              {notifications.failed.map(p => p.name || p.label).slice(0, 3).join(', ')}
                            </p>
                          </div>
                          <ChevronRight size={14} className={isDark ? 'text-slate-600' : 'text-slate-400'} />
                        </a>
                      )}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

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
