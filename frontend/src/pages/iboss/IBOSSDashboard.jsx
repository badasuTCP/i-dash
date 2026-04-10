import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { dashboardAPI } from '../../services/api';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const IBOSSDashboard = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await dashboardAPI.getBrandSummary('ibos', dateFrom || ytdStart, dateTo || ytdEnd);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, ytdStart, ytdEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>I-BOS Dashboard</h1>
          <p className={textSec}>I-BOS Contractor Division — YTD contractor traffic, training & marketing</p>
        </motion.div>

        {data?.hasLiveData ? (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <CheckCircle2 size={14} /> Live Data · {data.period}
          </div>
        ) : !loading && (
          <div className="mb-6 p-3 rounded-lg flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
            <AlertCircle size={14} /> Awaiting pipeline sync
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {(data?.scorecards || []).map((kpi, i) => (
            <ScoreCard key={i} {...kpi} change={0} sparkData={[]} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${textSec}`}>Contractor Traffic</h3>
            <p className={`text-3xl font-bold ${textPri}`}>{(data?.web?.visits || 0).toLocaleString()}</p>
            <p className={`text-sm mt-1 ${textSec}`}>sessions across contractor sites</p>
          </div>
          <div className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${textSec}`}>Marketing Spend</h3>
            <p className={`text-3xl font-bold ${textPri}`}>${((data?.ads?.spend || 0) / 1000).toFixed(1)}K</p>
            <p className={`text-sm mt-1 ${textSec}`}>{(data?.ads?.clicks || 0).toLocaleString()} clicks · {(data?.ads?.leads || 0).toLocaleString()} leads</p>
          </div>
          <div className={`rounded-xl p-6 ${cardBg}`}>
            <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${textSec}`}>HubSpot Pipeline</h3>
            <p className={`text-3xl font-bold ${textPri}`}>{(data?.crm?.deals || 0).toLocaleString()}</p>
            <p className={`text-sm mt-1 ${textSec}`}>deals · {(data?.crm?.contacts || 0).toLocaleString()} contacts</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default IBOSSDashboard;
