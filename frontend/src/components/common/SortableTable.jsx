import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * SortableTable — drop-in table with click-to-sort column headers.
 *
 * Parses formatted display strings ("$1.41M", "-21%", "1,331") back to
 * numbers when sorting numeric columns, so you don't have to keep the
 * raw values around — just pass the display rows.
 *
 * Props:
 *   rows        - array of plain objects
 *   columns     - array of { key, label, align?, format?, highlight?, render? }
 *                 key      = field name on each row
 *                 label    = column header text
 *                 align    = 'left' | 'right' (default: right for non-first)
 *                 format   = null | 'string' (forces alphabetic sort)
 *                 highlight= tailwind color class for the column header
 *                 render   = optional cell renderer (row, value) => ReactNode
 *   defaultSort - { by, dir } (default: sort by first column asc)
 *   emptyMessage- shown when rows is empty
 */

// Parse display value → number for sort. Handles $1.41M, -21%, 1,331, $11,130
const parseValue = (v) => {
  if (v === null || v === undefined || v === '—' || v === '-') return null;
  let s = String(v).replace(/[$,%\s⚠★↑↓]/g, '').trim();
  let mult = 1;
  if (s.endsWith('M')) { mult = 1_000_000; s = s.slice(0, -1); }
  else if (s.endsWith('K')) { mult = 1_000; s = s.slice(0, -1); }
  else if (s.endsWith('B')) { mult = 1_000_000_000; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return isNaN(n) ? null : n * mult;
};

const SortableTable = ({
  rows = [],
  columns = [],
  defaultSort,
  emptyMessage = 'No data',
  className = '',
}) => {
  const { isDark } = useTheme();
  const firstCol = columns[0]?.key;
  const [sortBy, setSortBy] = useState(defaultSort?.by || firstCol);
  const [sortDir, setSortDir] = useState(defaultSort?.dir || 'asc');

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const border = isDark ? 'border-slate-700/30' : 'border-slate-200';
  const rowHover = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortBy);
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (col?.format === 'string' || typeof av === 'string' && parseValue(av) === null) {
        const cmp = String(av || '').localeCompare(String(bv || ''));
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const an = parseValue(av);
      const bn = parseValue(bv);
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return arr;
  }, [rows, columns, sortBy, sortDir]);

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir(key === firstCol ? 'asc' : 'desc'); }
  };

  if (!rows.length) {
    return <p className={`text-sm text-center py-8 ${textSec}`}>{emptyMessage}</p>;
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={`border-b ${border}`}>
            {columns.map((col, i) => {
              const align = col.align || (i === 0 ? 'left' : 'right');
              const active = sortBy === col.key;
              const highlight = col.highlight || textSec;
              return (
                <th
                  key={col.key}
                  className={`py-3 px-4 font-semibold cursor-pointer select-none hover:text-indigo-400 transition-colors text-${align} ${active ? 'text-indigo-400' : highlight}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={idx} className={`border-b ${border} ${rowHover} transition-colors`}>
              {columns.map((col, i) => {
                const align = col.align || (i === 0 ? 'left' : 'right');
                const value = row[col.key];
                return (
                  <td key={col.key} className={`py-3 px-4 text-${align} ${i === 0 ? `font-medium ${textPri}` : textSec}`}>
                    {col.render ? col.render(row, value) : (value ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`text-[10px] mt-2 ${textSec}`}>💡 Click any column header to sort</p>
    </div>
  );
};

export default SortableTable;
