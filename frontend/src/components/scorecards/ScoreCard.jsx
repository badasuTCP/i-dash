import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Clock, AlertTriangle } from 'lucide-react';

// ── Staleness thresholds (milliseconds) ──────────────────────────────────────
const STALE_WARN_MS  = 4 * 60 * 60 * 1000;   // 4 hours  → amber
const STALE_CRIT_MS  = 24 * 60 * 60 * 1000;   // 24 hours → red

/** Normalise to UTC — appends 'Z' if the string has no timezone indicator,
 *  preventing local-time interpretation that would skew staleness by the
 *  user's browser timezone offset. */
function toUTCDate(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr !== 'string') return dateStr instanceof Date && !isNaN(dateStr) ? dateStr : null;
  // If no timezone designator (Z, +HH:MM, -HH:MM) assume UTC
  const hasTimezone = /Z|[+-]\d{2}:\d{2}$/.test(dateStr);
  const d = new Date(hasTimezone ? dateStr : dateStr + 'Z');
  return isNaN(d) ? null : d;
}

function timeSince(dateStr) {
  if (!dateStr) return null;
  const then = toUTCDate(dateStr);
  if (!then) return null;
  const ms = Date.now() - then.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const ScoreCard = ({
  label,
  value,
  change = 0,
  color = 'blue',
  sparkData = [],
  loading = false,
  format = 'number',
  lastSynced = null,    // ISO string or Date — when source data was last refreshed
  source = null,        // e.g. "Google Sheets", "Meta Ads"
  forecast = null,      // forecast value for this metric — shows vs-forecast indicator
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  const gradientMap = {
    blue: 'linear-gradient(135deg, #4F46E5, #3B82F6)',
    violet: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
    emerald: 'linear-gradient(135deg, #059669, #10B981)',
    amber: 'linear-gradient(135deg, #D97706, #F59E0B)',
    rose: 'linear-gradient(135deg, #E11D48, #F43F5E)',
    cyan: 'linear-gradient(135deg, #0891B2, #06B6D4)',
    lime: 'linear-gradient(135deg, #65A30D, #84CC16)',
    indigo: 'linear-gradient(135deg, #4338CA, #6366F1)',
  };

  // Light, subtle shadow — no heavy colored glow borders
  const shadowMap = {
    blue: '0 2px 8px rgba(0, 0, 0, 0.10)',
    violet: '0 2px 8px rgba(0, 0, 0, 0.10)',
    emerald: '0 2px 8px rgba(0, 0, 0, 0.10)',
    amber: '0 2px 8px rgba(0, 0, 0, 0.10)',
    rose: '0 2px 8px rgba(0, 0, 0, 0.10)',
    cyan: '0 2px 8px rgba(0, 0, 0, 0.10)',
    lime: '0 2px 8px rgba(0, 0, 0, 0.10)',
    indigo: '0 2px 8px rgba(0, 0, 0, 0.10)',
  };

  // ── Confidence / staleness ──────────────────────────────────────────────
  const confidence = useMemo(() => {
    if (!lastSynced) return { level: 'unknown', label: 'No sync info', color: 'rgba(255,255,255,0.3)' };
    const then = toUTCDate(lastSynced);
    if (!then) return { level: 'unknown', label: 'Invalid date', color: 'rgba(255,255,255,0.3)' };
    const ms = Date.now() - then.getTime();
    if (ms > STALE_CRIT_MS) return { level: 'critical', label: `Stale · ${timeSince(lastSynced)}`, color: '#F43F5E' };
    if (ms > STALE_WARN_MS)  return { level: 'warn',     label: `Aging · ${timeSince(lastSynced)}`,  color: '#F59E0B' };
    return { level: 'fresh', label: `Fresh · ${timeSince(lastSynced)}`, color: '#10B981' };
  }, [lastSynced]);

  // ── Forecast variance ──────────────────────────────────────────────────
  const forecastDelta = useMemo(() => {
    if (forecast == null || !value) return null;
    const pct = ((value - forecast) / Math.abs(forecast)) * 100;
    return { pct: pct.toFixed(1), ahead: pct >= 0 };
  }, [value, forecast]);

  useEffect(() => {
    let animationFrame;
    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value]);

  const formatValue = (val) => {
    if (val === undefined || val === null) return '-';

    if (format === 'currency') {
      // Use 0 decimals for values >= $1000, 2 decimals for smaller values
      const decimals = Math.abs(val) >= 1000 ? 0 : 2;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(val);
    } else if (format === 'percent') {
      return `${parseFloat(val).toFixed(1)}%`;
    } else if (format === 'decimal') {
      return parseFloat(val).toFixed(2);
    } else {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    }
  };

  const isPositive = change >= 0;
  const absChange = Math.abs(change);

  const sparklinePath = useMemo(() => {
    if (!sparkData || sparkData.length === 0) return '';

    const width = 60;
    const height = 20;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const minVal = Math.min(...sparkData);
    const maxVal = Math.max(...sparkData);
    const range = maxVal - minVal || 1;

    const points = sparkData.map((val, i) => {
      const x = (i / (sparkData.length - 1 || 1)) * chartWidth + padding;
      const y = height - ((val - minVal) / range) * chartHeight - padding;
      return `${x},${y}`;
    });

    return points.join(' ');
  }, [sparkData]);

  // ── Run rate line (extrapolate from last 2 spark points) ────────────────
  const runRatePath = useMemo(() => {
    if (!sparkData || sparkData.length < 3) return '';
    const width = 60;
    const height = 20;
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const minVal = Math.min(...sparkData);
    const maxVal = Math.max(...sparkData);
    const range = maxVal - minVal || 1;

    // Compute slope from last 3 points and project 1 step ahead
    const n = sparkData.length;
    const last3 = sparkData.slice(-3);
    const avgSlope = (last3[2] - last3[0]) / 2;
    const projected = sparkData[n - 1] + avgSlope;

    // Last real point
    const x1 = ((n - 1) / (n || 1)) * chartWidth + padding;
    const y1 = height - ((sparkData[n - 1] - minVal) / range) * chartHeight - padding;
    // Projected point
    const x2 = (n / (n || 1)) * chartWidth + padding;
    const clampedProj = Math.max(minVal, Math.min(maxVal * 1.2, projected));
    const y2 = height - ((clampedProj - minVal) / range) * chartHeight - padding;

    return `${x1},${y1} ${x2},${y2}`;
  }, [sparkData]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-xl p-5 min-h-[130px]"
        style={{ background: gradientMap[color] }}
      >
        <div className="space-y-3">
          <div className="h-3 bg-white/30 rounded w-20"></div>
          <div className="h-8 bg-white/30 rounded w-28"></div>
          <div className="h-3 bg-white/30 rounded w-16"></div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="rounded-xl p-5 min-h-[130px] cursor-pointer transition-all duration-300 relative"
      style={{
        background: gradientMap[color],
        boxShadow: shadowMap[color],
        // Apply amber/red border glow when data is stale
        ...(confidence.level === 'warn'  ? { outline: '2px solid rgba(245,158,11,0.5)' } : {}),
        ...(confidence.level === 'critical' ? { outline: '2px solid rgba(244,63,94,0.5)' } : {}),
      }}
    >
      {/* ── Top Row: Label + Change + Confidence dot ─────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs uppercase tracking-wider font-semibold text-white/80">{label}</p>
          {/* Confidence indicator dot */}
          {lastSynced && (
            <div className="relative"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}>
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: confidence.color,
                  boxShadow: confidence.level !== 'fresh' ? `0 0 6px ${confidence.color}` : 'none',
                  animation: confidence.level === 'critical' ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              {/* Tooltip */}
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                    className="absolute left-1/2 -translate-x-1/2 top-5 z-50 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[10px] font-medium shadow-lg"
                    style={{ backgroundColor: 'rgba(15, 17, 23, 0.95)', border: '1px solid rgba(71, 85, 105, 0.4)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      {confidence.level === 'critical' && <AlertTriangle size={10} className="text-rose-400" />}
                      {confidence.level === 'warn' && <Clock size={10} className="text-amber-400" />}
                      {confidence.level === 'fresh' && <Clock size={10} className="text-emerald-400" />}
                      <span className="text-white">{confidence.label}</span>
                    </div>
                    {source && <div className="text-slate-400 mt-0.5">Source: {source}</div>}
                    {forecastDelta && (
                      <div className={`mt-0.5 ${forecastDelta.ahead ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {forecastDelta.ahead ? '+' : ''}{forecastDelta.pct}% vs forecast
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {change !== null && change !== undefined && (
          <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
            {isPositive ? (
              <TrendingUp className="w-3 h-3 text-white" />
            ) : (
              <TrendingDown className="w-3 h-3 text-white" />
            )}
            <span className="text-sm font-semibold text-white">
              {isPositive ? '+' : '-'}{absChange.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Value ──────────────────────────────────────────────────────── */}
      <p className="text-3xl font-bold text-white mb-1">
        {formatValue(displayValue)}
      </p>

      {/* ── Forecast comparison line (if forecast provided) ─────────── */}
      {forecastDelta && (
        <p className={`text-[10px] font-medium mb-2 ${forecastDelta.ahead ? 'text-emerald-300/80' : 'text-rose-300/80'}`}>
          {forecastDelta.ahead ? 'Ahead' : 'Behind'} forecast by {Math.abs(forecastDelta.pct)}%
        </p>
      )}

      {/* ── Sparkline with run-rate projection ─────────────────────── */}
      {sparkData && sparkData.length > 0 && (
        <svg width="60" height="20" viewBox="0 0 60 20" className="w-full">
          {sparklinePath && (
            <polyline
              points={sparklinePath}
              fill="none"
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Run rate projection line (dashed) */}
          {runRatePath && (
            <polyline
              points={runRatePath}
              fill="none"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
    </motion.div>
  );
};

export default ScoreCard;
