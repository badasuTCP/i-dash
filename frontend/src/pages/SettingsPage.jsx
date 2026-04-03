import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Shield, Key, Palette, LogOut, Save, X } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
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
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [showModal, setShowModal] = useState(null);

  const [profile, setProfile] = useState({
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
    phone: '+1 (555) 123-4567',
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    marketingEmails: false,
    darkMode: true,
    autoRefresh: true,
    soundAlerts: false,
  });

  const [security, setSecurity] = useState({
    twoFactorAuth: false,
    sessionTimeout: '30',
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const handleSaveProfile = () => {
    toast.success('Profile updated successfully');
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
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
              description="Update your profile details"
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
                      onChange={(e) =>
                        setProfile({ ...profile, firstName: e.target.value })
                      }
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
                      onChange={(e) =>
                        setProfile({ ...profile, lastName: e.target.value })
                      }
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
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                    className="input-field"
                  />
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-700/30">
                  <button onClick={handleSaveProfile} className="btn-primary flex items-center gap-2">
                    <Save size={18} />
                    Save Changes
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

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <SettingsSection
            icon={Bell}
            title="Notification Preferences"
            description="Control how you receive notifications"
          >
            <SettingToggle
              label="Email Notifications"
              description="Receive notifications via email"
              enabled={preferences.emailNotifications}
              onChange={(val) =>
                setPreferences({ ...preferences, emailNotifications: val })
              }
            />
            <SettingToggle
              label="Push Notifications"
              description="Receive browser push notifications"
              enabled={preferences.pushNotifications}
              onChange={(val) =>
                setPreferences({ ...preferences, pushNotifications: val })
              }
            />
            <SettingToggle
              label="Marketing Emails"
              description="Receive marketing and promotional emails"
              enabled={preferences.marketingEmails}
              onChange={(val) =>
                setPreferences({ ...preferences, marketingEmails: val })
              }
            />
            <SettingToggle
              label="Sound Alerts"
              description="Play sounds for important alerts"
              enabled={preferences.soundAlerts}
              onChange={(val) =>
                setPreferences({ ...preferences, soundAlerts: val })
              }
            />
          </SettingsSection>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div>
            <SettingsSection
              icon={Key}
              title="Password & Authentication"
              description="Secure your account"
            >
              <div className="space-y-4">
                <button className="w-full px-4 py-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-slate-300 hover:text-slate-200 hover:border-slate-600/50 transition-all text-left font-medium">
                  Change Password
                </button>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={Shield}
              title="Two-Factor Authentication"
              description="Add an extra layer of security"
            >
              <SettingToggle
                label="Two-Factor Authentication"
                description="Require a code in addition to your password"
                enabled={security.twoFactorAuth}
                onChange={(val) => setSecurity({ ...security, twoFactorAuth: val })}
              />
              {security.twoFactorAuth && (
                <div className="mt-4 p-4 rounded-lg bg-slate-800/30 border border-primary-500/30">
                  <p className="text-sm text-slate-300 mb-3">
                    Backup codes for account recovery. Keep these safe.
                  </p>
                  <div className="space-y-2 mb-4">
                    {['1234-5678', '9012-3456', '7890-1234'].map((code, idx) => (
                      <code key={idx} className="block text-sm font-mono text-slate-400">
                        {code}
                      </code>
                    ))}
                  </div>
                  <button className="text-sm text-primary-400 hover:text-primary-300">
                    Generate new backup codes
                  </button>
                </div>
              )}
            </SettingsSection>

            <SettingsSection
              icon={Shield}
              title="Session Management"
              description="Control session timeout duration"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Session Timeout (minutes)
                  </label>
                  <select
                    value={security.sessionTimeout}
                    onChange={(e) =>
                      setSecurity({ ...security, sessionTimeout: e.target.value })
                    }
                    className="input-field"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
              </div>
            </SettingsSection>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <SettingsSection
            icon={Palette}
            title="Theme & Display"
            description="Customize how I-Dash looks"
          >
            <SettingToggle
              label="Dark Mode"
              description="Use dark theme for the dashboard"
              enabled={preferences.darkMode}
              onChange={(val) =>
                setPreferences({ ...preferences, darkMode: val })
              }
            />
            <SettingToggle
              label="Auto-Refresh"
              description="Automatically refresh data every 5 minutes"
              enabled={preferences.autoRefresh}
              onChange={(val) =>
                setPreferences({ ...preferences, autoRefresh: val })
              }
            />
          </SettingsSection>
        )}
      </motion.div>
    </Layout>
  );
};

export default SettingsPage;
