import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

const ChartCard = ({
  title,
  icon: Icon = null,
  subtitle = null,
  children,
  loading = false,
  dateRange = null,
  onFullscreen = null,
}) => {
  const { isDark } = useTheme();
  const chartRef = useRef(null);

  const handleDownload = async () => {
    if (!chartRef.current) return;

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: isDark ? '#0f1117' : '#f0f2f5',
        scale: 2,
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${title.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.png`;
      link.click();

      toast.success('Chart downloaded successfully');
    } catch (error) {
      toast.error('Failed to download chart');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className={`p-5 rounded-xl h-full ${
        isDark
          ? 'bg-[#1e2235] border border-slate-700/30'
          : 'bg-white border border-slate-200 shadow-sm'
      }`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2 flex-1">
              <div className={`h-6 rounded w-32 shimmer ${isDark ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}></div>
              {subtitle && <div className={`h-4 rounded w-48 shimmer ${isDark ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}></div>}
            </div>
          </div>
          <div className={`h-64 rounded shimmer ${isDark ? 'bg-slate-700/30' : 'bg-slate-300/30'}`}></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`p-5 rounded-xl h-full flex flex-col ${
        isDark
          ? 'bg-[#1e2235] border border-slate-700/30'
          : 'bg-white border border-slate-200 shadow-sm'
      }`}
    >
      {/* Header */}
      <div className={`flex items-start justify-between mb-6 pb-4 border-b ${
        isDark ? 'border-slate-700/30' : 'border-slate-200'
      }`}>
        <div className="flex items-start gap-3 flex-1">
          {Icon && (
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg flex-shrink-0">
              <Icon className="w-5 h-5 text-indigo-400" />
            </div>
          )}
          <div className="flex-1">
            <h3 className={`text-base font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Date Range Badge - Right side */}
        {dateRange && (
          <div className={`px-3 py-1 rounded-full text-xs font-medium ml-4 whitespace-nowrap ${
            isDark
              ? 'bg-slate-700/30 text-slate-300'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {dateRange}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 ml-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-100'
            }`}
            title="Download as PNG"
          >
            <Download className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
          </motion.button>
          {onFullscreen && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onFullscreen}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-100'
              }`}
              title="Fullscreen"
            >
              <Maximize2 className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
            </motion.button>
          )}
        </div>
      </div>

      {/* Chart Content */}
      <div ref={chartRef} className="flex-1 min-h-0">
        {children}
      </div>
    </motion.div>
  );
};

export default ChartCard;
