import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Plus, Edit3, RotateCcw, ShieldOff, ShieldCheck, Trash2, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const initialUsers = [
  { id: 1, name: 'Daniel Badasu', email: 'daniel@theconcreteprotector.com', role: 'data-analyst', status: 'active', lastLogin: '2025-03-26 09:15 AM', created: '2024-01-15' },
  { id: 2, name: 'Executive User', email: 'exec@theconcreteprotector.com', role: 'executive', status: 'active', lastLogin: '2025-03-25 02:30 PM', created: '2024-01-15' },
  { id: 3, name: 'Sarah Mitchell', email: 'sarah@theconcreteprotector.com', role: 'executive', status: 'active', lastLogin: '2025-03-24 11:00 AM', created: '2024-03-01' },
  { id: 4, name: 'James Porter', email: 'james@theconcreteprotector.com', role: 'executive', status: 'suspended', lastLogin: '2025-02-15 04:22 PM', created: '2024-06-10' },
  { id: 5, name: 'Maria Gonzalez', email: 'maria@theconcreteprotector.com', role: 'data-analyst', status: 'active', lastLogin: '2025-03-26 08:45 AM', created: '2024-08-20' },
];

const roleLabels = {
  'data-analyst': 'Data Analyst',
  'executive': 'Executive',
};

const AccountManagement = () => {
  const { isDark } = useTheme();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleResetPassword = (user) => {
    setConfirmAction({ type: 'reset', user, message: `Send password reset email to ${user.email}?` });
  };

  const handleToggleSuspend = (user) => {
    const action = user.status === 'active' ? 'suspend' : 'activate';
    setConfirmAction({ type: action, user, message: `${action === 'suspend' ? 'Suspend' : 'Activate'} ${user.name}?` });
  };

  const handleDelete = (user) => {
    setConfirmAction({ type: 'delete', user, message: `Permanently delete ${user.name}? This action cannot be undone.` });
  };

  const executeAction = () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;

    if (type === 'delete') {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } else if (type === 'suspend') {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: 'suspended' } : u));
    } else if (type === 'activate') {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: 'active' } : u));
    }
    // Reset password would trigger an API call
    setConfirmAction(null);
  };

  const cardClass = isDark
    ? 'bg-[#1e2235] border border-slate-700/30 rounded-xl'
    : 'bg-white border border-slate-200 rounded-xl shadow-sm';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Account Management
          </h2>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Manage user accounts, roles, and access permissions
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#265AA9] text-white text-sm font-medium hover:bg-[#1d4a8f] transition-colors"
        >
          <Plus size={16} /> Add User
        </motion.button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: users.length, color: 'from-[#265AA9] to-[#55A8C3]' },
          { label: 'Active', value: users.filter((u) => u.status === 'active').length, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Suspended', value: users.filter((u) => u.status === 'suspended').length, color: 'from-amber-500 to-amber-600' },
          { label: 'Data Analysts', value: users.filter((u) => u.role === 'data-analyst').length, color: 'from-violet-500 to-violet-600' },
        ].map((stat) => (
          <div key={stat.label} className={cardClass + ' p-4'}>
            <p className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {stat.label}
            </p>
            <p className={`text-2xl font-bold mt-1 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={cardClass + ' p-4'}>
        <div className="relative">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none transition-all ${
              isDark
                ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500'
                : 'bg-slate-50 text-slate-900 border border-slate-200 focus:border-[#265AA9]/30 placeholder-slate-400'
            }`}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className={cardClass + ' overflow-hidden'}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={isDark ? 'bg-[#0f1117]/50' : 'bg-slate-50'}>
                {['User', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                  <th key={h} className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
              {filtered.map((u) => (
                <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#265AA9] to-[#55A8C3] flex items-center justify-center text-white text-sm font-bold">
                        {u.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.name}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.role === 'data-analyst'
                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                        : 'bg-[#265AA9]/15 text-[#55A8C3] border border-[#265AA9]/20'
                    }`}>
                      {roleLabels[u.role]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.status === 'active'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    }`}>
                      {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                    </span>
                  </td>
                  <td className={`px-5 py-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {u.lastLogin}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {}}
                        title="Edit user"
                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'}`}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        title="Reset password"
                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-100 text-slate-400 hover:text-blue-600'}`}
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleSuspend(u)}
                        title={u.status === 'active' ? 'Suspend' : 'Activate'}
                        className={`p-1.5 rounded-md transition-colors ${
                          u.status === 'active'
                            ? isDark ? 'hover:bg-white/5 text-slate-400 hover:text-amber-400' : 'hover:bg-slate-100 text-slate-400 hover:text-amber-600'
                            : isDark ? 'hover:bg-white/5 text-slate-400 hover:text-emerald-400' : 'hover:bg-slate-100 text-slate-400 hover:text-emerald-600'
                        }`}
                      >
                        {u.status === 'active' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        title="Delete user"
                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-red-400' : 'hover:bg-slate-100 text-slate-400 hover:text-red-600'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md mx-4 rounded-xl p-6 shadow-2xl ${
                isDark ? 'bg-[#1e2235] border border-slate-700/50' : 'bg-white border border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Confirm Action
                </h3>
                <button onClick={() => setConfirmAction(null)} className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
                  <X size={18} />
                </button>
              </div>
              <p className={`text-sm mb-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {confirmAction.message}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmAction(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={executeAction}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    confirmAction.type === 'delete'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-[#265AA9] hover:bg-[#1d4a8f]'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountManagement;
