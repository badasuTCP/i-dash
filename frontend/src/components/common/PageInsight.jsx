import React, { useState } from 'react';
import { Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

/**
 * PageInsight — slim, dismissible AI insights strip.
 * Pass an array of 2–3 short, direct insight strings.
 */
const PageInsight = ({ insights = [] }) => {
  const { isDark } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (!insights.length || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="page-insight"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`mb-6 px-4 py-3 rounded-xl flex items-start gap-3 ${
          isDark
            ? 'bg-indigo-950/40 border border-indigo-500/20'
            : 'bg-indigo-50 border border-indigo-200'
        }`}
      >
        <Zap size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            AI Insights
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1">
            {insights.map((insight, i) => (
              <span
                key={i}
                className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
              >
                <span className="text-indigo-400 mr-1">›</span>
                {insight}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default PageInsight;
