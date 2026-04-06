import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, Plus, Edit3, RotateCcw, ShieldOff, ShieldCheck,
  Trash2, X, Loader2, Eye, EyeOff, Save, AlertTriangle, CheckCircle
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { usersAPI } from '../services/api';

// ── Role config ──────────────────────────────────────────────────────────────
const ROLE_MAP = {
  admin:    { label: 'Super Admin', color: 'violet',  bg: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  director: { label: 'Executive',   color: 'blue',    bg: 'bg-[#265AA9]/15 text-[#55A8C3] border-[#265AA9]/20' },
  manager:  { label: 'Manager',     color: 'emerald', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  analyst:  { label: 'Analyst',     color: 'amber',   bg: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  viewer:   { label: 'Viewer',      color: 'slate',   bg: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
};

// Modules that super admin can grant/revoke per user
const ALL_MODULES = [
  { key: 'dashboards',    label: 'Dashboards' },
  { key: 'web-analytics', label: 'Web Analytics' },
  { key: 'marketing',     label: 'Marketing Campaign' },
  { key: 'contractors',   label: 'Contractor Breakdown' },
  { key: 'pipelines',     label: 'Data Pipelines' },
  { key: 'data-intel',    label: 'Data Intelligence' },
  { key: 'admin-controls',label: 'Admin Controls' },
  { key: 'ai-insights',   label: 'AI Insights' },
  { key: 'accounts',      label: 'Account Management' },
  { key: 'settings',      label: 'Settings' },
];

// ── Helper: detect demo mode ─────────────────────────────────────────────────
const isDemoMode = (() => {
  try {
    const t = localStorage.getItem('idash_token') || localStorage.getItem('token');
    return t && t.startsWith('demo-');
  } catch { return false; }
})();

// ── Component ────────────────────────────────────────────────────────────────
const AccountManagement = () => {
  const { isDark } = useTheme();

  // State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);          // { type: 'add'|'edit'|'confirm', ... }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Form state for add/edit
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'director', department: 'all', modules: [] });
  const [showPassword, setShowPassword] = useState(false);

  // Style helpers
  const cardClass = isDark
    ? 'bg-[#1e2235] border border-slate-700/30 rounded-xl'
    : 'bg-white border border-slate-200 rounded-xl shadow-sm';
  const inputClass = isDark
    ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500'
    : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-[#265AA9]/30 placeholder-slate-400';

  // ── Fetch users ──────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersAPI.getAll();
      const list = Array.isArray(res.data) ? res.data : res.data?.users || [];
      // Attach saved module access (from localStorage for now — backend can persist later)
      const moduleMap = JSON.parse(localStorage.getItem('idash_user_modules') || '{}');
      setUsers(list.map((u) => ({
        ...u,
        modules: moduleMap[u.id] || (u.role === 'admin' ? ALL_MODULES.map((m) => m.key) : ['dashboards', 'web-analytics', 'marketing', 'contractors', 'ai-insights']),
      })));
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load users';
      setError(msg);
      // Fallback — if in demo mode, show placeholder
      if (isDemoMode) {
        setUsers([
          { id: 1, full_name: 'Daniel Badasu', email: 'daniel@theconcreteprotector.com', role: 'admin', department: 'all', is_active: true, created_at: '2024-01-15', modules: ALL_MODULES.map((m) => m.key) },
        ]);
        setError('Demo mode — showing local data. Sign in to manage real accounts.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Open Add User modal ──────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ full_name: '', email: '', password: '', role: 'director', department: 'all', modules: ['dashboards', 'web-analytics', 'marketing', 'contractors', 'ai-insights'] });
    setShowPassword(false);
    setModal({ type: 'add' });
  };

  // ── Open Edit User modal ─────────────────────────────────────────────────
  const openEdit = (user) => {
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'director',
      department: user.department || 'all',
      modules: user.modules || [],
    });
    setModal({ type: 'edit', user });
  };

  // ── Save (Add or Edit) ──────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      if (modal.type === 'add') {
        await usersAPI.create({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          department: form.department,
        });
        showToast(`User ${form.full_name} created`);
      } else if (modal.type === 'edit') {
        await usersAPI.update(modal.user.id, {
          full_name: form.full_name,
          role: form.role,
          department: form.department,
          is_active: modal.user.is_active,
        });
        // Save module access locally
        const moduleMap = JSON.parse(localStorage.getItem('idash_user_modules') || '{}');
        moduleMap[modal.user.id] = form.modules;
        localStorage.setItem('idash_user_modules', JSON.stringify(moduleMap));
        showToast(`User ${form.full_name} updated`);
      }
      setModal(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || 'Operation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirm action (suspend / activate / delete) ─────────────────────────
  const openConfirm = (type, user) => {
    const messages = {
      suspend: `Suspend ${user.full_name}? They won't be able to log in.`,
      activate: `Re-activate ${user.full_name}?`,
      delete: `Permanently delete ${user.full_name}? This cannot be undone.`,
    };
    setModal({ type: 'confirm', action: type, user, message: messages[type] });
  };

  const executeConfirm = async () => {
    if (!modal || modal.type !== 'confirm') return;
    setSaving(true);
    const { action, user } = modal;
    try {
      if (action === 'delete') {
        await usersAPI.delete(user.id);
        showToast(`${user.full_name} deleted`);
      } else if (action === 'suspend') {
        await usersAPI.update(user.id, { is_active: false });
        showToast(`${user.full_name} suspended`);
      } else if (action === 'activate') {
        await usersAPI.update(user.id, { is_active: true });
        showToast(`${user.full_name} activated`);
      }
      setModal(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || 'Action failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle module access ─────────────────────────────────────────────────
  const toggleModule = (key) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(key)
        ? prev.modules.filter((m) => m !== key)
        : [...prev.modules, key],
    }));
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const activeCount = users.filter((u) => u.is_active).length;
  const suspendedCount = users.filter((u) => !u.is_active).length;
  const adminCount = users.filter((u) => u.role === 'admin').length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg ${
              toast.type === 'error'
                ? 'bg-red-500/90 text-white'
                : 'bg-emerald-500/90 text-white'
            }`}
          >
            {toast.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Account Management</h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Manage users, roles, and module access
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#265AA9] text-white text-sm font-medium hover:bg-[#1d4a8f] transition-colors"
        >
          <Plus size={16} /> Add User
        </motion.button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: users.length, color: 'from-[#265AA9] to-[#55A8C3]' },
          { label: 'Active', value: activeCount, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Suspended', value: suspendedCount, color: 'from-amber-500 to-amber-600' },
          { label: 'Super Admins', value: adminCount, color: 'from-violet-500 to-violet-600' },
        ].map((stat) => (
          <div key={stat.label} className={cardClass + ' p-4'}>
            <p className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
          isDemoMode ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Search */}
      <div className={cardClass + ' p-4'}>
        <div className="relative">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <input
            type="text" placeholder="Search users by name or email..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none transition-all ${inputClass}`}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className={cardClass + ' overflow-hidden'}>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> Loading users...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={isDark ? 'bg-[#0f1117]/50' : 'bg-slate-50'}>
                  {['User', 'Role', 'Status', 'Modules', 'Actions'].map((h) => (
                    <th key={h} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {filtered.map((u) => {
                  const roleInfo = ROLE_MAP[u.role] || ROLE_MAP.viewer;
                  return (
                    <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#265AA9] to-[#55A8C3] flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {(u.full_name || u.email).split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name}</p>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${roleInfo.bg}`}>{roleInfo.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                          u.is_active
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                        }`}>
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {u.role === 'admin' ? 'All modules' : `${(u.modules || []).length} modules`}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(u)} title="Edit user"
                            className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'}`}>
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => openConfirm(u.is_active ? 'suspend' : 'activate', u)}
                            title={u.is_active ? 'Suspend' : 'Activate'}
                            className={`p-1.5 rounded-md transition-colors ${
                              u.is_active
                                ? isDark ? 'hover:bg-white/5 text-slate-400 hover:text-amber-400' : 'hover:bg-slate-100 text-slate-400 hover:text-amber-600'
                                : isDark ? 'hover:bg-white/5 text-slate-400 hover:text-emerald-400' : 'hover:bg-slate-100 text-slate-400 hover:text-emerald-600'
                            }`}>
                            {u.is_active ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                          </button>
                          <button onClick={() => openConfirm('delete', u)} title="Delete user"
                            className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-red-400' : 'hover:bg-slate-100 text-slate-400 hover:text-red-600'}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={5} className={`px-5 py-12 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Modals ═══ */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => !saving && setModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full mx-4 rounded-xl p-6 shadow-2xl ${
                modal.type === 'confirm' ? 'max-w-md' : 'max-w-lg'
              } ${isDark ? 'bg-[#1e2235] border border-slate-700/50' : 'bg-white border border-slate-200'}`}
            >
              {/* ── Confirm Modal ── */}
              {modal.type === 'confirm' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Confirm Action</h3>
                    <button onClick={() => setModal(null)} className={isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}><X size={18} /></button>
                  </div>
                  <p className={`text-sm mb-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{modal.message}</p>
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setModal(null)} className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Cancel</button>
                    <button onClick={executeConfirm} disabled={saving}
                      className={`px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 ${modal.action === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#265AA9] hover:bg-[#1d4a8f]'} disabled:opacity-50`}>
                      {saving && <Loader2 size={14} className="animate-spin" />} Confirm
                    </button>
                  </div>
                </>
              )}

              {/* ── Add / Edit Modal ── */}
              {(modal.type === 'add' || modal.type === 'edit') && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {modal.type === 'add' ? 'Add New User' : `Edit ${modal.user?.full_name}`}
                    </h3>
                    <button onClick={() => setModal(null)} className={isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}><X size={18} /></button>
                  </div>

                  <div className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label className={`text-xs font-medium uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Full Name</label>
                      <input type="text" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                        placeholder="e.g. John Smith"
                        className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none ${inputClass}`} />
                    </div>

                    {/* Email */}
                    <div>
                      <label className={`text-xs font-medium uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Email</label>
                      <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="user@theconcreteprotector.com"
                        disabled={modal.type === 'edit'}
                        className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none ${inputClass} ${modal.type === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`} />
                    </div>

                    {/* Password (add only) */}
                    {modal.type === 'add' && (
                      <div>
                        <label className={`text-xs font-medium uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Password</label>
                        <div className="relative">
                          <input type={showPassword ? 'text' : 'password'} value={form.password}
                            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                            placeholder="Minimum 8 characters"
                            className={`w-full px-3 py-2.5 pr-10 rounded-lg text-sm outline-none ${inputClass}`} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Role */}
                    <div>
                      <label className={`text-xs font-medium uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Role</label>
                      <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                        className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none ${inputClass}`}>
                        <option value="admin">Super Admin (Full Access)</option>
                        <option value="director">Executive (View Only)</option>
                      </select>
                    </div>

                    {/* Module Access Toggles (only for non-admin) */}
                    {form.role !== 'admin' && (
                      <div>
                        <label className={`text-xs font-medium uppercase tracking-wider mb-2 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Module Access
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {ALL_MODULES.map((mod) => {
                            const enabled = form.modules.includes(mod.key);
                            return (
                              <button key={mod.key} type="button" onClick={() => toggleModule(mod.key)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                  enabled
                                    ? isDark
                                      ? 'bg-[#265AA9]/20 border-[#265AA9]/40 text-[#55A8C3]'
                                      : 'bg-[#265AA9]/10 border-[#265AA9]/30 text-[#265AA9]'
                                    : isDark
                                      ? 'bg-slate-800/50 border-slate-700/30 text-slate-500'
                                      : 'bg-slate-50 border-slate-200 text-slate-400'
                                }`}>
                                <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                                  enabled ? 'bg-[#265AA9] border-[#265AA9]' : isDark ? 'border-slate-600' : 'border-slate-300'
                                }`}>
                                  {enabled && <CheckCircle size={10} className="text-white" />}
                                </div>
                                {mod.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {form.role === 'admin' && (
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        Super Admins have access to all modules automatically.
                      </p>
                    )}
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-3 justify-end mt-6">
                    <button onClick={() => setModal(null)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving || !form.full_name || !form.email || (modal.type === 'add' && form.password.length < 8)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#265AA9] hover:bg-[#1d4a8f] disabled:opacity-50 flex items-center gap-2">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {modal.type === 'add' ? 'Create User' : 'Save Changes'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountManagement;
