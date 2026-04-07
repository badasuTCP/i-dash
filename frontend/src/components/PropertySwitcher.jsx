import React, { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { ChevronDown, Globe } from 'lucide-react';

/**
 * PropertySwitcher — Dropdown to select a specific GA4 property
 * within a multi-property division (I-BOS, DCKN).
 *
 * When "All Properties" is selected, propertyId is null and the
 * parent page uses the default (primary) property for the division.
 *
 * @param {string}   division       - 'ibos' | 'dckn'
 * @param {string}   selectedId     - Currently selected property ID (or null for "All")
 * @param {function} onSelect       - Callback: (propertyId: string|null, displayName: string) => void
 * @param {boolean}  isDark         - Theme flag
 */
const PropertySwitcher = ({ division, selectedId, onSelect, isDark = true }) => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await dashboardAPI.getGA4Properties(division);
        if (!cancelled) {
          setProperties(resp.data.properties || []);
        }
      } catch (err) {
        console.warn(`[PropertySwitcher] Failed to load properties for ${division}:`, err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [division]);

  if (loading || properties.length <= 1) {
    // Don't show the switcher if there's 0 or 1 property
    return null;
  }

  const selected = properties.find(p => p.property_id === selectedId);
  const label = selected ? selected.display_name : 'All Properties';

  const bg = isDark ? 'bg-slate-800/80' : 'bg-white';
  const border = isDark ? 'border-slate-700' : 'border-slate-200';
  const text = isDark ? 'text-slate-200' : 'text-slate-800';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-500';
  const hoverBg = isDark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-50';
  const dropBg = isDark ? 'bg-slate-800' : 'bg-white';

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${border} ${bg} ${text} text-sm font-medium transition-colors ${hoverBg}`}
      >
        <Globe size={14} className="text-cyan-400" />
        <span className="max-w-[200px] truncate">{label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className={`absolute top-full mt-1 right-0 z-50 w-72 max-h-80 overflow-y-auto rounded-xl border ${border} ${dropBg} shadow-2xl`}>
            {/* "All Properties" option */}
            <button
              onClick={() => { onSelect(null, 'All Properties'); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm ${!selectedId ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : `${text} ${hoverBg}`} transition-colors`}
            >
              All Properties
              <span className={`block text-xs ${textSec}`}>{properties.length} properties</span>
            </button>

            <div className={`border-t ${border}`} />

            {properties.map((prop) => (
              <button
                key={prop.property_id}
                onClick={() => { onSelect(prop.property_id, prop.display_name); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  selectedId === prop.property_id
                    ? 'bg-cyan-500/10 text-cyan-400 font-semibold'
                    : `${text} ${hoverBg}`
                }`}
              >
                <span className="block truncate">{prop.display_name}</span>
                <span className={`block text-xs ${textSec}`}>
                  Property {prop.property_id}
                  {prop.contractor_id && ` · ${prop.contractor_id}`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PropertySwitcher;
