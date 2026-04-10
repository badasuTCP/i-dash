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

  useEffect(() => {
    dashboardAPI.getDateBounds?.()
      .then(({ data }) => setDateBounds(data))
      .catch(() => {});
  }, []);

  const earliestYear = dateBounds?.earliest_year || currentYear - 2;

  const yearPresets = useMemo(() => {
    const presets = [];
    for (let y = currentYear - 1; y >= earliestYear; y--) {
      presets.push({
        id: `year_${y}`,
        label: `${y}`,
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
  ], [today, dateBounds]);

  const displayText = useMemo(() => {
    if (!activeMode) return 'Year to Date';
    if (activeMode === 'custom' && customStart && customEnd) {
      try {
        return `${format(new Date(customStart), 'MMM d')} – ${format(new Date(customEnd), 'MMM d, yyyy')}`;
      } catch { return 'Custom Range'; }
    }
    const all = [...presets, ...yearPresets];
    const preset = all.find(p => p.id === activeMode);
    if (preset) {
      const range = preset.getRange();
      return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;
    }
    return 'Year to Date';
  }, [activeMode, customStart, customEnd, presets, yearPresets]);

  const isCustomMode = activeMode === 'custom';
  const customValid = customStart && customEnd && new Date(customStart) <= new Date(customEnd);

  const handlePresetClick = useCallback((presetId) => {
    const all = [...presets, ...yearPresets];
    const preset = all.find(p => p.id === presetId);
    if (!preset) return;
    const range = preset.getRange();
    setCustomStart('');
    setCustomEnd('');
    setActiveMode(presetId);
    setIsOpen(false);
    onApply?.(range.start, range.end, presetId);
  }, [presets, yearPresets, onApply]);

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
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
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
              className="absolute top-full mt-2 right-0 z-50 p-5 rounded-2xl min-w-[380px] shadow-2xl max-h-[85vh] overflow-y-auto
                         bg-[#1a1f2e] border border-slate-600/40"
            >
              {/* Quick Presets */}
              <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest mb-3">Quick Filters</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      activeMode === preset.id
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                        : 'bg-slate-700/50 text-slate-200 hover:bg-slate-600/60 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Year Presets */}
              {yearPresets.length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest mb-2">Historical Years</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {yearPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetClick(preset.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                          activeMode === preset.id
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                            : 'bg-slate-700/50 text-slate-200 hover:bg-slate-600/60 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Data availability */}
              {dateBounds && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30">
                  <p className="text-[11px] text-slate-300">
                    📊 Data range: <span className="font-bold text-white">{dateBounds.earliest}</span> → <span className="font-bold text-white">{dateBounds.latest}</span>
                  </p>
                </div>
              )}

              {/* Custom Date Range — always interactive */}
              <div className="pt-4 border-t border-slate-600/40">
                <p className="text-[11px] font-bold text-slate-200 uppercase tracking-widest mb-3">Custom Date Range</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[11px] text-slate-300 mb-1.5 block font-semibold">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => { setCustomStart(e.target.value); setActiveMode('custom'); }}
                      min={dateBounds?.earliest}
                      max={dateBounds?.latest}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-700/60 border border-slate-500/50 text-white text-sm font-medium
                                 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all
                                 [color-scheme:dark] placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 mb-1.5 block font-semibold">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => { setCustomEnd(e.target.value); setActiveMode('custom'); }}
                      min={dateBounds?.earliest}
                      max={dateBounds?.latest}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-700/60 border border-slate-500/50 text-white text-sm font-medium
                                 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-all
                                 [color-scheme:dark] placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {activeMode && activeMode !== 'ytd' && (
                  <button onClick={handleClear}
                    className="px-4 py-2.5 rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-600/60 transition-all text-xs font-semibold">
                    Reset
                  </button>
                )}
                <button onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-600/60 transition-all text-xs font-semibold">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!customValid) return;
                    setActiveMode('custom');
                    setIsOpen(false);
                    onApply?.(new Date(customStart), new Date(customEnd), 'custom');
                  }}
                  disabled={!isCustomMode || !customValid}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white
                             hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs font-bold shadow-lg shadow-indigo-500/20">
                  Apply Custom
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DateRangePicker;
