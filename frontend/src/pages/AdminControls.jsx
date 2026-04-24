import React from 'react';
import { motion } from 'framer-motion';
import { Shield, RotateCcw, Database, Users, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useDashboardConfig, ALL_CONTRACTORS as SEED_CONTRACTORS } from '../context/DashboardConfigContext';
import toast from 'react-hot-toast';

const ToggleSwitch = ({ enabled, onChange, isDark }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex w-12 h-7 rounded-full transition-colors ${
      enabled ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B]' : isDark ? 'bg-slate-700' : 'bg-slate-300'
    }`}
  >
    <motion.div
      animate={{ x: enabled ? 22 : 2 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="w-5 h-5 bg-white rounded-full absolute top-1 left-0 shadow-sm"
    />
  </button>
);

const ControlSection = ({ icon: Icon, title, description, children, isDark }) => {
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-6 mb-6 ${cardBg}`}>
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-gradient-to-br from-[#F97066]/20 to-[#FEB47B]/20 border border-[#F97066]/30">
          <Icon className="text-[#F97066]" size={22} />
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${textPrimary}`}>{title}</h3>
          <p className={`text-sm mt-1 ${textSecondary}`}>{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
};

const ControlRow = ({ label, description, enabled, onChange, isDark }) => {
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';
  const borderColor = isDark ? 'border-slate-700/30' : 'border-slate-200';

  return (
    <div className={`flex items-center justify-between py-4 border-b ${borderColor} last:border-0`}>
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-emerald-400' : isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
        <div>
          <p className={`font-medium text-sm ${textPrimary}`}>{label}</p>
          {description && <p className={`text-xs mt-0.5 ${textSecondary}`}>{description}</p>}
        </div>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} isDark={isDark} />
    </div>
  );
};

const AdminControls = () => {
  const { isDark } = useTheme();
  const { config, updatePipeline, updateContractor, setAllContractors, resetToDefaults, allContractors } = useDashboardConfig();
  // Use server-merged list (includes GA4-discovered) with fallback to seed data
  const ALL_CONTRACTORS = allContractors || SEED_CONTRACTORS;

  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-600';

  const pipelineItems = [
    { key: 'hubspot', label: 'HubSpot CRM', description: 'Contacts, deals, and pipeline data' },
    { key: 'metaAds', label: 'Meta (Facebook) Ads', description: 'Ad campaigns, spend, and conversions' },
    { key: 'googleAds', label: 'Google Ads', description: 'Search, display, and video campaign data' },
    { key: 'ga4', label: 'Google Analytics 4', description: 'Website traffic, sessions, and user behavior' },
    { key: 'googleSheets', label: 'Google Sheets', description: 'Custom data imports and manual entries' },
    { key: 'woocommerce', label: 'WooCommerce (Sani-Tred)', description: 'Sani-Tred retail store orders & revenue' },
    { key: 'shopify', label: 'Shopify (CP Store)', description: 'CP Store orders, products, customers' },
    { key: 'snapshot', label: 'Snapshot Aggregator', description: 'Post-pipeline aggregated snapshots' },
  ];

  const enabledPipelines   = Object.values(config.pipelines).filter(Boolean).length;
  const enabledContractors = ALL_CONTRACTORS.filter((c) => config.contractors?.[c.id] !== false).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F97066] to-[#FEB47B] flex items-center justify-center">
                <Shield className="text-white" size={20} />
              </div>
              <h1 className={`text-3xl font-bold ${textPrimary}`}>Admin Controls</h1>
            </div>
            <p className={textSecondary}>Control what data pipelines and dashboard sections are visible across the platform</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { resetToDefaults(); toast.success('Reset to defaults'); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-all text-slate-300 text-sm"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </motion.button>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {[
            { label: 'Pipelines Visible',   value: `${enabledPipelines}/${pipelineItems.length}`,      color: '#3B82F6' },
            { label: 'Contractors Active',  value: `${enabledContractors}/${ALL_CONTRACTORS.length}`,  color: '#F97066' },
          ].map((stat, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className={`rounded-xl p-4 text-center ${isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${textSecondary}`}>{stat.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Data Pipelines */}
        <ControlSection icon={Database} title="Pipeline Dashboard Visibility"
          description="Hide a pipeline's data from every dashboard that reads it. This does NOT stop the scheduled sync — use Pipeline Control for cadence + run."
          isDark={isDark}>
          {pipelineItems.map((item) => (
            <ControlRow key={item.key} label={item.label} description={item.description}
              enabled={config.pipelines[item.key] !== false} onChange={(v) => updatePipeline(item.key, v)} isDark={isDark} />
          ))}
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
            <Link to="/dashboard/pipelines"
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${textSecondary} hover:text-[#F97066] transition-colors`}>
              <ExternalLink size={13} /> Open Pipeline Control (cadence · Run Now · history)
            </Link>
          </div>
        </ControlSection>

        {/* Contractor Management */}
        <ControlSection icon={Users} title="I-BOS Contractor Visibility"
          description="Active contractors feed data into all I-BOS dashboards. Disabling a contractor hides their data from reports and charts."
          isDark={isDark}>
          {/* Bulk actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setAllContractors(true); toast.success('All contractors enabled'); }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Enable All
            </button>
            <button
              onClick={() => { setAllContractors(false); toast.success('All contractors disabled'); }}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Disable All
            </button>
            <Link
              to="/dashboard/pipelines"
              className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isDark ? 'border-slate-600 text-slate-300 hover:border-indigo-500/60' : 'border-slate-300 text-slate-600 hover:border-indigo-400'
              }`}
            >
              <ExternalLink size={11} /> Full contractor management
            </Link>
          </div>
          {/* Per-contractor toggles */}
          {ALL_CONTRACTORS.map((contractor) => (
            <ControlRow
              key={contractor.id}
              label={contractor.name}
              description={`I-BOS contractor — ${config.contractors?.[contractor.id] !== false ? 'visible in dashboards' : 'hidden from dashboards'}`}
              enabled={config.contractors?.[contractor.id] !== false}
              onChange={(v) => {
                updateContractor(contractor.id, v);
                toast.success(`${contractor.name} ${v ? 'enabled' : 'disabled'}`);
              }}
              isDark={isDark}
            />
          ))}
        </ControlSection>
      </div>
    </motion.div>
  );
};

export default AdminControls;
