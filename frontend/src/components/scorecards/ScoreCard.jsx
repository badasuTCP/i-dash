import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

const ScoreCard = ({
  label,
  value,
  change = 0,
  color = 'blue',
  sparkData = [],
  loading = false,
  format = 'number',
}) => {
  const [displayValue, setDisplayValue] = useState(0);

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

  const shadowMap = {
    blue: '0 12px 24px rgba(79, 70, 229, 0.4)',
    violet: '0 12px 24px rgba(124, 58, 237, 0.4)',
    emerald: '0 12px 24px rgba(5, 150, 105, 0.4)',
    amber: '0 12px 24px rgba(217, 119, 6, 0.4)',
    rose: '0 12px 24px rgba(225, 29, 72, 0.4)',
    cyan: '0 12px 24px rgba(8, 145, 178, 0.4)',
    lime: '0 12px 24px rgba(101, 163, 13, 0.4)',
    indigo: '0 12px 24px rgba(67, 56, 202, 0.4)',
  };

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
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
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
      className="rounded-xl p-5 min-h-[130px] cursor-pointer transition-all duration-300"
      style={{
        background: gradientMap[color],
        boxShadow: shadowMap[color],
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-white/80">{label}</p>

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
      </div>

      <p className="text-3xl font-bold text-white mb-3">
        {formatValue(displayValue)}
      </p>

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
        </svg>
      )}
    </motion.div>
  );
};

export default ScoreCard;
