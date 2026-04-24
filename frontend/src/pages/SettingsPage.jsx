import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Shield, Key, Palette, LogOut, Save, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usersAPI } from '../services/api';
import toast from 'react-hot-toast';

const SettingsSection = ({ icon: Icon, title, description, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="card mb-6"
  >
    <div className="flex items-start gap-4 mb-6">
      <div className="p-3 rounded-lg bg-primary-500/20 border border-primary-500/30">
        <Icon className="text-primary-400" size={24} />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>
    </div>
    {children}
  </motion.div>
);

const SettingToggle = ({ label, description, enabled, onChange }) => (
  <div className="flex items-center justify-between py-4 border-b border-slate-700/30 last:border-0">
    <div>
      <p className="font-medium text-slate-100">{label}</p>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </div>
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex w-12 h-7 rounded-full transition-colors ${
        enabled ? 'bg-primary-500' : 'bg-slate-700'
      }`}
    >
      <motion.div
        animate={{ x: enabled ? 22 : 2 }}
        className="w-5 h-5 bg-white rounded-full absolute top-1 left-1 transition-transform"
      />
    </button>
  </div>
);

export const SettingsPage = () => {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');

  // ── Profile ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Password ─────────────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });
  const [savingPwd, setSavingPwd] = useState(false);

  // ── Preferences ──────────────────────────────────────────────────────
  // Auto-refresh interval lives in localStorage so dashboards that poll
  // can opt into a user-controlled cadence later.
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    try { return localStorage.getItem('idash_auto_refresh') !== '0'; } catch { return true; }
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  // ── Actions ──────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    const fullName = `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim();
    if (!fullName) {
      toast.error('First or last name is required');
      return;
    }
    setSavingProfile(true);
    try {
      await usersAPI.updateProfile({ full_name: fullName });
      toast.success('Profile updated');
      // Refresh cached user so the sidebar / header pick up the new name
      if (typeof refreshUser === 'function') {
        await refreshUser();
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update profile';
      toast.error(detail);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwd.current || !pwd.next) {
      toast.error('Current and new password are required');
      return;
    }
    if (pwd.next.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error("New password and confirmation don't match");
      return;
    }
    setSavingPwd(true);
    try {
      await usersAPI.changePassword(pwd.current, pwd.next);
      toast.success('Password changed');
      setPwd({ current: '', next: '', confirm: '' });
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to change password';
      toast.error(detail);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleAutoRefreshToggle = (val) => {
    setAutoRefreshEnabled(val);
    try { localStorage.setItem('idash_auto_refresh', val ? '1' : '0'); } catch { /* noop */ }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
  };

  return (
    <Layout>
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="h1 text-slate-100 mb-2">Settings</h1>
          <p className="subtitle">Manage your account and preferences</p>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 border border-transparent'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div>
            <SettingsSection
              icon={Settings}
              title="Personal Information"
              description="Your display name and account email"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={profile.firstName}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={profile.lastName}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    title="Email changes must be done by a super-admin in Account Management"
                    className="input-field opacity-60 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Email is managed by your super-admin
                  </p>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-700/30">
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60"
                  >
                    <Save size={18} />
                    {savingProfile ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={LogOut}
              title="Danger Zone"
              description="Actions you should be careful with"
            >
              <button
                onClick={handleLogout}
                className="w-full btn-outline text-danger-400 border-danger-500/30 hover:bg-danger-500/10 justify-center"
              >
                <LogOut size={18} />
                Logout
              </button>
            </SettingsSection>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <SettingsSection
            icon={Key}
            title="Change Password"
            description="Rotate your password. Minimum 8 characters."
          >
            <div className="space-y-4">
              {[
                { key: 'current', label: 'Current Password' },
                { key: 'next', label: 'New Password' },
                { key: 'confirm', label: 'Confirm New Password' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
                  <div className="relative">
                    <input
                      type={showPwd[key] ? 'text' : 'password'}
                      value={pwd[key]}
                      onChange={(e) => setPwd({ ...pwd, [key]: e.target.value })}
                      className="input-field pr-10"
                      autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd({ ...showPwd, [key]: !showPwd[key] })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      title={showPwd[key] ? 'Hide' : 'Show'}
                    >
                      {showPwd[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-4 border-t border-slate-700/30">
                <button
                  onClick={handleChangePassword}
                  disabled={savingPwd}
                  className="btn-primary flex items-center gap-2 disabled:opacity-60"
                >
                  <Key size={18} />
                  {savingPwd ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>
          </SettingsSection>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <SettingsSection
            icon={Palette}
            title="Theme & Display"
            description="Customise how I-Dash looks on this device"
          >
            <div className="flex items-center justify-between py-4 border-b border-slate-700/30">
              <div>
                <p className="font-medium text-slate-100">Theme</p>
                <p className="text-sm text-slate-400 mt-1">Toggle between light and dark</p>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700/40 text-slate-200 hover:bg-slate-800/40 transition-colors"
              >
                {isDark ? <Moon size={16} /> : <Sun size={16} />}
                {isDark ? 'Dark' : 'Light'}
              </button>
            </div>
            <SettingToggle
              label="Auto-Refresh Dashboards"
              description="Let dashboards re-fetch data periodically so numbers stay fresh without a manual reload"
              enabled={autoRefreshEnabled}
              onChange={handleAutoRefreshToggle}
            />
          </SettingsSection>
        )}
      </motion.div>
    </Layout>
  );
};

export default SettingsPage;
