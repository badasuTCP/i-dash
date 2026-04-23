import React from 'react';
import { motion } from 'framer-motion';
import { EyeOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Full-page banner shown when a dashboard's sole pipeline is hidden from
 * dashboards via Pipeline Control → eye toggle.
 *
 * Single-pipeline pages (CPStore→Shopify, SaniTredRetail→WooCommerce,
 * *WebAnalytics→GA4, SalesIntelligence→HubSpot) render this instead of
 * the normal dashboard so the analyst sees a clear "hidden" state and
 * knows how to re-enable it.
 */
const PipelineHiddenBanner = ({ pipelineLabel, pageTitle, pageSubtitle }) => {
  const { isDark } = useTheme();
  const cardBg      = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSec     = isDark ? 'text-slate-400' : 'text-slate-600';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {pageTitle && (
          <div className="mb-6">
            <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>{pageTitle}</h1>
            {pageSubtitle && <p className={textSec}>{pageSubtitle}</p>}
          </div>
        )}
        <div className={`rounded-xl p-10 text-center ${cardBg}`}>
          <EyeOff size={28} className="mx-auto mb-3 text-slate-400" />
          <p className={`text-base font-semibold ${textPrimary}`}>
            {pipelineLabel} pipeline is hidden from dashboards.
          </p>
          <p className={`text-sm mt-2 ${textSec}`}>
            Re-enable it from <span className="font-medium">Data Pipelines → Pipeline Control</span>{' '}
            (click the eye icon next to {pipelineLabel}).
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default PipelineHiddenBanner;
