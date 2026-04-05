import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown } from 'lucide-react';
import { format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, startOfWeek, endOfWeek } from 'date-fns';

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
      id: 'thisWeek',
      label: 'This Week',
      getRange: () => ({ start: startOfWeek(today, { weekStartsOn: 1 }), end: today }),
    },
    {
      id: 'lastWeek',
      label: 'Last Week',
      getRange: () => {
        const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        return { start: lastWeekStart, end: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
      },
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
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      },
    },
    {
      id: 'thisQuarter',
      label: 'This Quarter',
      getRange: () => ({ start: startOfQuarter(today), end: today }),
    },
    {
      id: 'lastQuarter',
      label: 'Last Quarter',
      getRange: () => {
        const prevQ = subMonths(startOfQuarter(today), 1);
        return { start: startOfQuarter(prevQ), end: endOfQuarter(prevQ) };
      },
    },
    {
      id: 'last90',
      label: 'Last 90 Days',
      getRange: () => ({ start: subDays(today, 89), end: today }),
    },
    {
      id: 'ytd',
      label: 'Year to Date',
      getRange: () => ({ start: startOfYear(today), end: today }),
    },
    {
      id: 'custom',
      label: 'Custom Range',
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
              className="absolute top-full mt-2 right-0 z-50 glass-dark p-4 rounded-xl min-w-[360px] shadow-xl"
            >
              {/* Quick Presets */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick Filters</p>
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {presets.filter(p => p.id !== 'custom').map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePresetClick(preset.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedPreset === preset.id
                        ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white shadow-lg shadow-orange-500/20'
                        : 'bg-slate-800/30 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {preset.label}
                  </motion.button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              <div className="space-y-3 pt-4 border-t border-slate-700/30">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Custom Date Range</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => { setCustomStart(e.target.value); setSelectedPreset('custom'); }}
                      className="input-field text-sm w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => { setCustomEnd(e.target.value); setSelectedPreset('custom'); }}
                      className="input-field text-sm w-full"
                    />
                  </div>
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
                  disabled={selectedPreset !== 'custom' || !customStart || !customEnd}
                  className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-medium"
                >
                  Apply Custom
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
