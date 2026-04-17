import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ArrowUpDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * SortableBarChart — horizontal bar chart with built-in sort controls.
 * Drop-in replacement for manual BarChart usages.
 *
 * Props:
 *   data          - array of objects
 *   nameKey       - field used for the Y-axis label (default 'name')
 *   metrics       - array of { key, label, color, format?: 'currency'|'number' }
 *                   First metric is the default sort target.
 *   limit         - max rows to show (default 10)
 *   height        - px height (auto if omitted)
 *   initialSort   - { by, dir } defaults to {by: metrics[0].key, dir: 'desc'}
 *   yAxisWidth    - px width for Y axis labels (default 160)
 *   stacked       - render as stacked bars (default false)
 */
const SortableBarChart = ({
  data = [],
  nameKey = 'name',
  metrics = [],
  limit = 10,
  height,
  initialSort,
  yAxisWidth = 160,
  stacked = false,
  emptyMessage = 'No data for this period',
}) => {
  const { isDark } = useTheme();
  const firstMetric = metrics[0]?.key;
  const [sortBy, setSortBy] = useState(initialSort?.by || firstMetric);
  const [sortDir, setSortDir] = useState(initialSort?.dir || 'desc');

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = Number(a[sortBy] || 0);
      const bv = Number(b[sortBy] || 0);
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr.slice(0, limit);
  }, [data, sortBy, sortDir, limit]);

  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px',
    color: isDark ? '#e2e8f0' : '#1e293b',
  };
  const selectCls = `px-2 py-1 rounded-lg text-xs font-medium ${
    isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'
  }`;
  const fmtValue = (v, format) => {
    if (v == null) return '—';
    if (format === 'currency') return `$${Number(v).toLocaleString()}`;
    return Number(v).toLocaleString();
  };

  const computedHeight = height || Math.max(200, Math.min(sorted.length * 35, 420));

  if (!data.length) {
    return <p className={`text-sm text-center py-16 ${textSec}`}>{emptyMessage}</p>;
  }

  return (
    <div>
      {/* Sort controls */}
      {metrics.length > 1 && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <ArrowUpDown size={12} className={textSec} />
          <span className={`text-xs ${textSec}`}>Sort:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectCls}>
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
            className={selectCls}
            title={sortDir === 'desc' ? 'High → Low' : 'Low → High'}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      )}

      <ResponsiveContainer width="100%" height={computedHeight}>
        <BarChart data={sorted} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
          <XAxis
            type="number"
            stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'}
            tickFormatter={(v) => {
              const m = metrics.find((mm) => mm.key === sortBy) || metrics[0];
              return m?.format === 'currency' ? `$${(v / 1000).toFixed(0)}K` : Number(v).toLocaleString();
            }}
          />
          <YAxis dataKey={nameKey} type="category" width={yAxisWidth}
            stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(v, _n, item) => {
              const m = metrics.find((mm) => mm.key === item.dataKey) || metrics[0];
              return [fmtValue(v, m?.format), m?.label || item.dataKey];
            }}
          />
          {metrics.length > 1 && <Legend />}
          {metrics.map((m, i) => (
            <Bar
              key={m.key}
              dataKey={m.key}
              name={m.label}
              fill={m.color || '#3B82F6'}
              radius={[0, 6, 6, 0]}
              stackId={stacked ? 'stack' : undefined}
              animationDuration={500}
            >
              {!stacked && metrics.length === 1 && sorted.map((_, idx) => (
                <Cell key={idx} fill={m.color || '#3B82F6'} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SortableBarChart;
