import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { CheckCircle2, AlertCircle, HardHat, Megaphone, Globe, Award, TrendingUp } from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';
import SortableBarChart from '../../components/common/SortableBarChart';

const IBOSSDashboard = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const [data, setData] = useState(null);
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = dateFrom || ytdStart;
  const to = dateTo || ytdEnd;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, revRes] = await Promise.all([
        dashboardAPI.getBrandSummary('ibos', from, to),
        dashboardAPI.getAllContractorsRevenue(from, to, 10).catch(() => ({ data: null })),
      ]);
      setData(sumRes.data);
      setRevenueData(revRes.data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };
  const _clrs = ['#F59E0B','#3B82F6','#8B5CF6','#10B981','#EF4444','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>I-BOS Overview</h1>
          <p className={textSec}>I-BOS Contractor Division — YTD contractor performance, training & marketing</p>
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

        <PageInsight insights={(() => {
          const out = [];
          const sc = data?.scorecards || [];
          const visits = sc.find(s => /visit/i.test(s.label))?.value || 0;
          const leads = sc.find(s => /lead/i.test(s.label))?.value || 0;
          const spend = data?.ads?.spend || 0;
          const deals = data?.crm?.deals || 0;
          if (visits) out.push(`I-BOS traffic: ${Number(visits).toLocaleString()} visits across contractor sites.`);
          if (spend) out.push(`Contractor marketing spend: $${Number(spend).toLocaleString()} · ${Number(leads).toLocaleString()} leads.`);
          const top = (data?.top_websites || [])[0];
          if (top) out.push(`Top site: ${top.name} with ${Number(top.users || 0).toLocaleString()} users.`);
          if (deals) out.push(`${deals} HubSpot deals in CRM pipeline.`);
          return out;
        })()} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {(data?.scorecards || []).map((kpi, i) => (
            <ScoreCard key={i} {...kpi} change={0} sparkData={[]} />
          ))}
        </div>

        {/* ── QB Revenue split: Active vs In-Active contractors ─────── */}
        {revenueData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <ScoreCard label="Total QB Revenue" value={revenueData.grand_total || 0} change={0} color="emerald" format="currency" sparkData={[]} />
            <ScoreCard label="Active Contractors Revenue" value={revenueData.active_total || 0} change={revenueData.active_pct} color="blue" format="currency" sparkData={[]} />
            <ScoreCard label="In-Active Contractors Revenue" value={revenueData.inactive_total || 0} change={revenueData.inactive_pct} color="amber" format="currency" sparkData={[]} />
            <ScoreCard label="Total QB Customers" value={(revenueData.active_count || 0) + (revenueData.inactive_count || 0)} change={0} color="violet" format="number" sparkData={[]} />
          </div>
        )}

        {/* ── Top In-Active Contractors (revenue-only, no ads) ────── */}
        {revenueData?.top_inactive?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 mb-8 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top In-Active Contractors by Revenue</h3>
              <span className={`ml-auto text-xs ${textSec}`}>{revenueData.inactive_count} total</span>
            </div>
            <SortableBarChart
              data={revenueData.top_inactive}
              nameKey="name"
              metrics={[{ key: 'revenue', label: 'Revenue (QB)', color: '#F59E0B', format: 'currency' }]}
            />
          </motion.div>
        )}

        {/* Traffic Trend + Marketing Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Contractor Traffic Trend</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.traffic_trend || []}>
                <defs>
                  <linearGradient id="ibosTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                <Area type="monotone" dataKey="visits" stroke="#F59E0B" fill="url(#ibosTrendGrad)" strokeWidth={2} dot={false} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Megaphone size={16} className="text-violet-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Marketing Pulse</h3>
            </div>
            <div className="space-y-4">
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Total Spend</p>
                <p className={`text-2xl font-bold ${textPri}`}>${((data?.ads?.spend || 0) / 1000).toFixed(1)}K</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Ad Clicks</p>
                <p className={`text-2xl font-bold ${textPri}`}>{(data?.ads?.clicks || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Leads Generated</p>
                <p className={`text-2xl font-bold ${textPri}`}>{(data?.ads?.leads || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>HubSpot Deals</p>
                <p className={`text-2xl font-bold ${textPri}`}>{(data?.crm?.deals || 0).toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Top Contractor Sites */}
        {(data?.top_websites || []).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <HardHat size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Contractor Websites</h3>
            </div>
            <SortableBarChart
              data={data.top_websites}
              nameKey="name"
              metrics={[
                { key: 'users',  label: 'Users',   color: '#F59E0B', format: 'number' },
                { key: 'visits', label: 'Visits',  color: '#3B82F6', format: 'number' },
              ]}
              yAxisWidth={200}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default IBOSSDashboard;
