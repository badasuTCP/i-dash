import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, startOfWeek, endOfWeek } from 'date-fns';

/**
 * DateRangePicker — Exclusive filter control.
 *
 * RULES:
 * 1. Preset click → immediately fires onApply, clears custom inputs, closes dropdown.
 * 2. Custom input interaction → immediately deselects active preset.
 * 3. "Apply Custom" only enabled when BOTH dates are valid & mode is custom.
 * 4. Custom inputs greyed-out when a preset is active.
 */
const DateRangePicker = ({ onApply, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Start with 'ytd' to match GlobalDateContext default
  const [activeMode, setActiveMode] = useState('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const today = useMemo(() => new Date(), []);

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
    { id: '2025',        label: '2025 Full Year', getRange: () => ({ start: new Date(2025, 0, 1), end: new Date(2025, 11, 31) }) },
    { id: '2024',        label: '2024 Full Year', getRange: () => ({ start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) }) },
  ], [today]);

  // ── Display text ──────────────────────────────────────────────────────
  const displayText = useMemo(() => {
    if (!activeMode) return 'Year to Date';
    if (activeMode === 'custom' && customStart && customEnd) {
      try {
        return `${format(new Date(customStart), 'MMM d')} – ${format(new Date(customEnd), 'MMM d, yyyy')}`;
      } catch { return 'Custom Range'; }
    }
    const preset = presets.find(p => p.id === activeMode);
    if (preset) {
      const range = preset.getRange();
      return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;
    }
    return 'Select range';
  }, [activeMode, customStart, customEnd, presets]);

  const isCustomMode = activeMode === 'custom';
  const customValid  = customStart && customEnd && new Date(customStart) <= new Date(customEnd);

  // ── Preset click: auto-apply, close, clear custom ─────────────────────
  const handlePresetClick = useCallback((presetId) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    const range = preset.getRange();

    // Exclusive: wipe custom state
    setCustomStart('');
    setCustomEnd('');
    setActiveMode(presetId);
    setIsOpen(false);

    onApply?.(range.start, range.end, presetId);
  }, [presets, onApply]);

  // ── Custom input change: deselect preset ──────────────────────────────
  const handleCustomStartChange = useCallback((e) => {
    setCustomStart(e.target.value);
    setActiveMode('custom'); // Exclusive: deselect any preset
  }, []);

  const handleCustomEndChange = useCallback((e) => {
    setCustomEnd(e.target.value);
    setActiveMode('custom');
  }, []);

  // ── Apply custom ──────────────────────────────────────────────────────
  const handleApplyCustom = useCallback(() => {
    if (!customValid) return;
    setActiveMode('custom');
    setIsOpen(false);
    onApply?.(new Date(customStart), new Date(customEnd), 'custom');
  }, [customStart, customEnd, customValid, onApply]);

  // ── Clear all filters ─────────────────────────────────────────────────
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
          activeMode
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 text-slate-300'
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="font-medium">{displayText}</span>
        {activeMode ? (
          <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleClear(); }} />
        ) : (
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
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
              className="absolute top-full mt-2 right-0 z-50 glass-dark p-4 rounded-xl min-w-[360px] shadow-xl"
            >
              {/* ── Quick Presets ─────────────────────────────────────── */}
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick Filters</p>
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {presets.map((preset) => (
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

              {/* ── Custom Date Range ────────────────────────────────── */}
              <div className={`space-y-3 pt-4 border-t border-slate-700/30 transition-opacity ${
                activeMode && activeMode !== 'custom' ? 'opacity-40 pointer-events-none' : 'opacity-100'
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Custom Date Range</p>
                  {isCustomMode && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-semibold">Active</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-300 mb-1 block font-medium">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={handleCustomStartChange}
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
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-600/50 text-white text-sm
                                 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none
                                 [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              {/* ── Action Buttons ───────────────────────────────────── */}
              <div className="flex gap-2 mt-4">
                {activeMode && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleClear}
                    className="px-4 py-2 rounded-lg bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 transition-all text-sm font-medium"
                  >
                    Clear Filter
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
