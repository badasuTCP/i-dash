import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const InsightCard = ({ insight, onAskMore = null, onDismiss = null }) => {
  const [dismissed, setDismissed] = useState(false);

  const defaultInsight = {
    title: 'Daily Insight',
    text: 'Your **Meta Ads campaign** is performing exceptionally well this week with a **2.21 ROAS**. Consider increasing the budget by 15-20% to capitalize on this momentum. The cost per lead dropped to **$15.20**, which is 10.6% better than last week.',
    timestamp: new Date(),
  };

  const data = insight || defaultInsight;

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden mb-6 rounded-xl border p-5"
      style={{
        background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
      }}
    >
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="p-2 bg-white/20 rounded-lg flex-shrink-0"
            >
              <Sparkles className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h3 className="text-xs font-bold text-white/80 uppercase tracking-widest">
                AI Insight:
              </h3>
              <p className="text-sm font-semibold text-white">{data.title}</p>
            </div>
          </div>

          {onDismiss && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setDismissed(true);
                onDismiss?.();
              }}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-white" />
            </motion.button>
          )}
        </div>

        {/* Content */}
        <div className="mb-4 text-white prose prose-invert prose-sm max-w-none [&_strong]:font-bold [&_strong]:text-white">
          <ReactMarkdown>{data.text}</ReactMarkdown>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/60">
            Generated {new Date(data.timestamp).toLocaleDateString()}
          </p>
          {onAskMore && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onAskMore}
              className="px-4 py-1.5 text-xs font-semibold bg-white text-indigo-600 rounded-lg hover:bg-white/90 transition-all"
            >
              Ask AI
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default InsightCard;
