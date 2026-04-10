import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, startOfWeek, endOfWeek } from 'date-fns';
import { dashboardAPI } from '../../services/api';

const DateRangePicker = ({ onApply, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [dateBounds, setDateBounds] = useState(null);

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();

  // Fetch data bounds on mount — determines which year presets to show
  useEffect(() => {
    dashboardAPI.getDateBounds?.()
      .then(({ data }) => setDateBounds(data))
      .catch(() => {}); // silent — picker works without bounds
  }, []);

  const earliestYear = dateBounds?.earliest_year || currentYear - 2;

  // Build dynamic year presets: from earliest data year to current year - 1
  const yearPresets = useMemo(() => {
    const presets = [];
    for (let y = currentYear - 1; y >= earliestYear; y--) {
      presets.push({
        id: `year_${y}`,
        label: `${y} Full Year`,
        getRange: () => ({ start: new Date(y, 0, 1), end: new Date(y, 11, 31) }),
      });
    }
    return presets;
  }, [currentYear, earliestYear]);

  const presets = useMemo(() => [
    { id: 'today',       label: 'Today',         getRange: () => ({ start: today, end: today }) },
    { id: 'yesterday',   label: 'Yesterday',     getRange: () => ({ start: subDays(today, 1), end: subDays(today, 1) }) },
    { id: 'thisWeek',    label: 'This Week',     getRange: () => ({ start: startOfWeek(today, { weekStartsOn: 1 }), end: today }) },
    { id: 'lastWeek',    label: 'Last Week',     getRange: () => {
      const s = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) };
    }},
    { id: 'last7',       label: 'Last 7 Days',   getRange: () => ({ start: subDays(today, 6), end: today }) },
    { id: 'last30',      label: 'Last 30 Days',  getRange: () => ({ start: subDays(today, 29), end: today }) },
    { id: 'thisMonth',   label: 'This Month',    getRange: () => ({ start: startOfMonth(today), end: today }) },
    { id: 'lastMonth',   label: 'Last Month',    getRange: () => {
      const lm = subMonths(today, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }},
    { id: 'thisQuarter', label: 'This Quarter',  getRange: () => ({ start: startOfQuarter(today), end: today }) },
    { id: 'lastQuarter', label: 'Last Quarter',  getRange: () => {
      const prevQ = subMonths(startOfQuarter(today), 1);
      return { start: startOfQuarter(prevQ), end: endOfQuarter(prevQ) };
    }},
    { id: 'last90',      label: 'Last 90 Days',  getRange: () => ({ start: subDays(today, 89), end: today }) },
    { id: 'ytd',         label: 'Year to Date',  getRange: () => ({ start: startOfYear(today), end: today }) },
    { id: 'allTime',     label: 'All Time',       getRange: () => ({ start: dateBounds ? new Date(dateBounds.earliest) : new Date(2024, 0, 1), end: today }) },
    ...yearPresets,
  ], [today, yearPresets, dateBounds]);

  const allPresets = presets; // single flat list

  // Display text
  const displayText = useMemo(() => {
    if (!activeMode) return 'Year to Date';
    if (activeMode === 'custom' && customStart && customEnd) {
      try {
        return `${format(new Date(customStart), 'MMM d')} – ${format(new Date(customEnd), 'MMM d, yyyy')}`;
      } catch { return 'Custom Range'; }
    }
    const preset = allPresets.find(p => p.id === activeMode);
    if (preset) {
      const range = preset.getRange();
      return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;
    }
    return 'Year to Date';
  }, [activeMode, customStart, customEnd, allPresets]);

  const isCustomMode = activeMode === 'custom';
  const customValid = customStart && customEnd && new Date(customStart) <= new Date(customEnd);

  const handlePresetClick = useCallback((presetId) => {
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;
    const range = preset.getRange();
    setCustomStart('');
    setCustomEnd('');
    setActiveMode(presetId);
    setIsOpen(false);
    onApply?.(range.start, range.end, presetId);
  }, [allPresets, onApply]);

  const handleCustomStartChange = useCallback((e) => {
    setCustomStart(e.target.value);
    setActiveMode('custom');
  }, []);

  const handleCustomEndChange = useCallback((e) => {
    setCustomEnd(e.target.value);
    setActiveMode('custom');
  }, []);

  const handleApplyCustom = useCallback(() => {
    if (!customValid) return;
    setActiveMode('custom');
    setIsOpen(false);
    onApply?.(new Date(customStart), new Date(customEnd), 'custom');
  }, [customStart, customEnd, customValid, onApply]);

  const handleClear = useCallback(() => {
    setActiveMode('ytd');
    setCustomStart('');
    setCustomEnd('');
    setIsOpen(false);
    onClear?.();
  }, [onClear]);

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all text-sm ${
          activeMode && activeMode !== 'ytd'
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 text-slate-300'
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{displayText}</span>
        {activeMode && activeMode !== 'ytd' ? (
          <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleClear(); }} />
        ) : (
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full mt-2 right-0 z-50 glass-dark p-4 rounded-xl min-w-[360px] shadow-xl max-h-[80vh] overflow-y-auto"
            >
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick Filters</p>
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {allPresets.map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePresetClick(preset.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeMode === preset.id
                        ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white shadow-lg shadow-orange-500/20'
                        : 'bg-slate-800/30 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {preset.label}
                  </motion.button>
                ))}
              </div>

              {/* Data range indicator */}
              {dateBounds && (
                <p className="text-[10px] text-slate-500 mb-3">
                  Data available: {dateBounds.earliest} → {dateBounds.latest}
                </p>
              )}

              {/* Custom Date Range */}
              <div className={`space-y-3 pt-4 border-t border-slate-700/30 transition-opacity ${
                activeMode && activeMode !== 'custom' ? 'opacity-40 pointer-events-none' : 'opacity-100'
              }`}>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Custom Date Range</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-300 mb-1 block font-medium">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={handleCustomStartChange}
                      min={dateBounds?.earliest}
                      max={dateBounds?.latest}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-600/50 text-white text-sm
                                 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none
                                 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-300 mb-1 block font-medium">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={handleCustomEndChange}
                      min={dateBounds?.earliest}
                      max={dateBounds?.latest}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-600/50 text-white text-sm
                                 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none
                                 [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {activeMode && activeMode !== 'ytd' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleClear}
                    className="px-4 py-2 rounded-lg bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-all text-sm font-medium"
                  >
                    Reset to YTD
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-all text-sm font-medium"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleApplyCustom}
                  disabled={!isCustomMode || !customValid}
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
