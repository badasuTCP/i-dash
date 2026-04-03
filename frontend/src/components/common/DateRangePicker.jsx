import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';

const DateRangePicker = ({ onApply, defaultDays = 30 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const today = new Date();

  const presets = [
    {
      id: 'today',
      label: 'Today',
      getRange: () => ({ start: today, end: today }),
    },
    {
      id: 'yesterday',
      label: 'Yesterday',
      getRange: () => ({ start: subDays(today, 1), end: subDays(today, 1) }),
    },
    {
      id: 'last7',
      label: 'Last 7 Days',
      getRange: () => ({ start: subDays(today, 6), end: today }),
    },
    {
      id: 'last30',
      label: 'Last 30 Days',
      getRange: () => ({ start: subDays(today, 29), end: today }),
    },
    {
      id: 'thisMonth',
      label: 'This Month',
      getRange: () => ({ start: startOfMonth(today), end: today }),
    },
    {
      id: 'lastMonth',
      label: 'Last Month',
      getRange: () => {
        const lastMonth = subDays(today, 30);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      },
    },
    {
      id: 'thisQuarter',
      label: 'This Quarter',
      getRange: () => ({ start: startOfQuarter(today), end: today }),
    },
    {
      id: 'custom',
      label: 'Custom',
      getRange: () => {
        if (!customStart || !customEnd) return null;
        return { start: new Date(customStart), end: new Date(customEnd) };
      },
    },
  ];

  const currentPreset = presets.find((p) => p.id === selectedPreset);
  const range = currentPreset?.getRange?.();
  const displayText = range
    ? `${format(range.start, 'MMM d')} - ${format(range.end, 'MMM d, yyyy')}`
    : 'Select date range';

  const handlePresetClick = (presetId) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const preset = presets.find((p) => p.id === presetId);
      const range = preset?.getRange?.();
      if (range) {
        onApply?.(range.start, range.end);
        setIsOpen(false);
      }
    }
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      onApply?.(new Date(customStart), new Date(customEnd));
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-all text-slate-300 text-sm"
      >
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{displayText}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full mt-2 right-0 z-50 glass-dark p-4 rounded-xl min-w-80 shadow-xl"
            >
              {/* Preset Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {presets.slice(0, 7).map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePresetClick(preset.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedPreset === preset.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-800/30 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {preset.label}
                  </motion.button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              <div className="space-y-3 pt-4 border-t border-slate-700/30">
                <p className="text-sm font-semibold text-slate-300">Custom Date Range</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="input-field text-sm"
                  />
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-all text-sm font-medium"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleApplyCustom}
                  disabled={!customStart || !customEnd}
                  className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
                >
                  Apply
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DateRangePicker;
