import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const MetricTable = ({
  data = [],
  columns = [],
  onRowClick = null,
  loading = false,
  pageSize = 8,
}) => {
  const { isDark } = useTheme();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  // Default demo data with 8 campaigns
  const defaultData = [
    {
      id: 1,
      name: 'Meta Ads - Q1 Campaign',
      platform: 'Meta',
      spend: 65583.50,
      conversions: 145230,
      roas: 2.21,
      cpc: 1.45,
      status: 'Active',
    },
    {
      id: 2,
      name: 'Google Ads - Search',
      platform: 'Google',
      spend: 80745.00,
      conversions: 189450,
      roas: 2.35,
      cpc: 2.10,
      status: 'Active',
    },
    {
      id: 3,
      name: 'TikTok Creator Campaign',
      platform: 'TikTok',
      spend: 27622.00,
      conversions: 78920,
      roas: 2.86,
      cpc: 0.35,
      status: 'Optimizing',
    },
    {
      id: 4,
      name: 'LinkedIn Sponsored',
      platform: 'LinkedIn',
      spend: 69720.00,
      conversions: 124560,
      roas: 1.78,
      cpc: 5.60,
      status: 'Active',
    },
    {
      id: 5,
      name: 'Instagram Shopping',
      platform: 'Instagram',
      spend: 30705.00,
      conversions: 92140,
      roas: 3.00,
      cpc: 0.89,
      status: 'Active',
    },
    {
      id: 6,
      name: 'YouTube Pre-Roll',
      platform: 'YouTube',
      spend: 45200.00,
      conversions: 98350,
      roas: 2.17,
      cpc: 1.23,
      status: 'Paused',
    },
    {
      id: 7,
      name: 'Pinterest Pins',
      platform: 'Pinterest',
      spend: 22500.00,
      conversions: 56780,
      roas: 2.52,
      cpc: 0.78,
      status: 'Active',
    },
    {
      id: 8,
      name: 'Programmatic Display',
      platform: 'Google',
      spend: 35800.00,
      conversions: 62400,
      roas: 1.74,
      cpc: 2.05,
      status: 'Ended',
    },
  ];

  const defaultColumns = [
    { key: 'name', label: 'Campaign Name', sortable: true, width: '25%' },
    { key: 'platform', label: 'Platform', sortable: true, width: '15%' },
    { key: 'spend', label: 'Spend', sortable: true, format: 'currency', width: '15%' },
    { key: 'conversions', label: 'Conversions', sortable: true, format: 'number', width: '15%' },
    { key: 'roas', label: 'ROAS', sortable: true, format: 'roas', width: '12%' },
    { key: 'cpc', label: 'CPC', sortable: true, format: 'currency', width: '12%' },
    { key: 'status', label: 'Status', sortable: true, format: 'status', width: '10%' },
  ];

  const tableData = data.length > 0 ? data : defaultData;
  const tableCols = columns.length > 0 ? columns : defaultColumns;

  // Filtering
  const filteredData = useMemo(() => {
    return tableData.filter((row) =>
      tableCols.some((col) =>
        String(row[col.key] || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [tableData, tableCols, searchTerm]);

  // Sorting
  const sortedData = useMemo(() => {
    let sorted = [...filteredData];

    if (sortConfig.key) {
      sorted.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return sorted;
  }, [filteredData, sortConfig]);

  // Pagination
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-';

    if (format === 'currency') {
      return `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (format === 'number') {
      return parseInt(value).toLocaleString('en-US');
    } else if (format === 'roas') {
      return `${parseFloat(value).toFixed(2)}x`;
    } else if (format === 'status') {
      const statusColors = {
        'Active': isDark ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Paused': isDark ? 'bg-slate-800/50 text-slate-300 border-slate-700/30' : 'bg-slate-200 text-slate-700 border-slate-300',
        'Optimizing': isDark ? 'bg-blue-900/30 text-blue-400 border-blue-800/30' : 'bg-blue-100 text-blue-700 border-blue-200',
        'Ended': isDark ? 'bg-red-900/30 text-red-400 border-red-800/30' : 'bg-red-100 text-red-700 border-red-200',
      };
      const colors = statusColors[value] || statusColors['Paused'];
      return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${colors}`}>
          {value}
        </span>
      );
    }
    return value;
  };

  if (loading) {
    return (
      <div className={`p-5 rounded-xl ${isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm'}`}>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-12 rounded shimmer ${isDark ? 'bg-slate-700/50' : 'bg-slate-300/50'}`}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`p-5 rounded-xl ${isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm'}`}
    >
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search campaigns..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className={`w-full px-4 py-2.5 rounded-lg border transition-all ${
            isDark
              ? 'bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20'
              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
          }`}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={`border-b ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
              {tableCols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  style={{ width: col.width }}
                  className={col.sortable ? `cursor-pointer ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'} transition-colors` : ''}
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <span className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {col.label}
                    </span>
                    {col.sortable && sortConfig.key === col.key && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        {sortConfig.direction === 'asc' ? (
                          <ChevronUp className="w-4 h-4 text-indigo-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-indigo-500" />
                        )}
                      </motion.div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="wait">
              {paginatedData.map((row, idx) => (
                <motion.tr
                  key={row.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`border-b ${isDark ? 'border-slate-700/30' : 'border-slate-100'} ${onRowClick ? `cursor-pointer ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}` : ''} transition-colors`}
                >
                  {tableCols.map((col) => (
                    <td key={`${row.id || idx}-${col.key}`} style={{ width: col.width }}>
                      <div className="px-4 py-3">
                        <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                          {formatValue(row[col.key], col.format)}
                        </span>
                      </div>
                    </td>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
          </p>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                isDark
                  ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Previous
            </motion.button>
            {[...Array(totalPages)].map((_, i) => (
              <motion.button
                key={i + 1}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCurrentPage(i + 1)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === i + 1
                    ? 'bg-indigo-500 text-white'
                    : isDark
                      ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {i + 1}
              </motion.button>
            ))}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                isDark
                  ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Next
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default MetricTable;
