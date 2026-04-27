import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  CheckCircle2, AlertCircle, TrendingUp, ShoppingBag, Globe,
  Megaphone, Package, MapPin,
} from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useTheme } from '../../context/ThemeContext';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useMarketingData } from '../../hooks/useMarketingData';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';

const STATUS_COLORS = {
  completed: '#10B981', processing: '#3B82F6', pending: '#F59E0B',
  refunded: '#EF4444', cancelled: '#6B7280', failed: '#DC2626', 'on-hold': '#8B5CF6',
};
const PALETTE = ['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316'];

const fmtCurrency = (v) => {
  if (v == null) return '$0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v).toFixed(2)}`;
};

const SaniTredDashboard = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const { isPipelineVisible } = useDashboardConfig();
  const showGA4          = isPipelineVisible('ga4');
  const showWooCommerce  = isPipelineVisible('woocommerce');
  const showGoogleSheets = isPipelineVisible('googleSheets');
  const showAds          = isPipelineVisible('metaAds') || isPipelineVisible('googleAds');
  const [data, setData] = useState(null);
  const [wcData, setWcData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = dateFrom || ytdStart;
  const to = dateTo || ytdEnd;

  // Hooks pull from the same endpoints the sub-pages use. The Overview now
  // mirrors a slice of every Sani-Tred module so execs don't have to click
  // around to see the brand's pulse.
  const mkt = useMarketingData('sanitred', { spendByPeriod: [], scorecards: [] });
  const ga4 = useWebAnalytics('sanitred', { trafficSources: [], deviceData: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await dashboardAPI.getBrandSummary('sanitred', from, to);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [from, to]);

  const fetchWC = useCallback(async () => {
    if (!showWooCommerce) return;
    try {
      const { data: d } = await dashboardAPI.getWCStore(from, to);
      setWcData(d);
    } catch { setWcData(null); }
  }, [from, to, showWooCommerce]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchWC(); }, [fetchWC]);

  const textPri = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>Sani-Tred Overview</h1>
          <p className={textSec}>Sani-Tred Retail — revenue, web performance & marketing pulse for the selected date range</p>
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
          const revenue = sc.find(s => /revenue|sales/i.test(s.label))?.value || 0;
          const spend = data?.ads?.spend || 0;
          const orders = data?.ecom?.orders || 0;
          if (revenue) out.push(`Sani-Tred retail revenue: $${Number(revenue).toLocaleString()} in the selected range.`);
          if (orders) out.push(`${orders} online store orders processed.`);
          if (visits) out.push(`Retail traffic: ${Number(visits).toLocaleString()} visits.`);
          if (spend) out.push(`Ad spend: $${Number(spend).toLocaleString()}.`);
          return out;
        })()} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {(data?.scorecards || []).map((kpi, i) => (
            <ScoreCard key={i} {...kpi} change={0} sparkData={[]} />
          ))}
        </div>

        {/* Traffic Trend + Revenue Summary */}
        {(showGA4 || showGoogleSheets || showAds) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {showGA4 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-emerald-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Web Traffic Trend</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.traffic_trend || []}>
                <defs>
                  <linearGradient id="stTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                <Area type="monotone" dataKey="visits" stroke="#10B981" fill="url(#stTrendGrad)" strokeWidth={2} dot={false} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg} ${showGA4 ? '' : 'lg:col-span-3'}`}>
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag size={16} className="text-emerald-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Revenue Summary</h3>
            </div>
            <div className="space-y-4">
              {showGoogleSheets && (
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Retail Revenue</p>
                <p className={`text-2xl font-bold ${textPri}`}>${((data?.sheets_revenue || 0) / 1000000).toFixed(2)}M</p>
              </div>
              )}
              {showAds && (
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Ad Spend</p>
                <p className={`text-2xl font-bold ${textPri}`}>${((data?.ads?.spend || 0) / 1000).toFixed(1)}K</p>
              </div>
              )}
              {showGA4 && (
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Web Users</p>
                <p className={`text-2xl font-bold ${textPri}`}>{(data?.web?.users || 0).toLocaleString()}</p>
              </div>
              )}
            </div>
          </motion.div>
        </div>
        )}

        {/* ═════════ NEW: WooCommerce Storefront Pulse ═════════ */}
        {showWooCommerce && (wcData?.monthly?.length > 0 || wcData?.ordersByStatus?.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag size={16} className="text-blue-400" />
                <h3 className={`text-base font-semibold ${textPri}`}>Store Revenue by Month</h3>
              </div>
              <p className={`text-[11px] mb-4 ${textSec}`}>Sani-Tred Store · same source as the Store page</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={wcData.monthly || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                  <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 11 }} />
                  <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[4,4,0,0]} animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Package size={16} className="text-violet-400" />
                <h3 className={`text-base font-semibold ${textPri}`}>Orders by Status</h3>
              </div>
              <p className={`text-[11px] mb-4 ${textSec}`}>Live store order mix</p>
              {(wcData?.ordersByStatus?.length || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={wcData.ordersByStatus.map((o) => ({ name: o.status, value: o.count }))}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value"
                      animationDuration={500}>
                      {wcData.ordersByStatus.map((o, i) => (
                        <Cell key={i} fill={STATUS_COLORS[o.status] || '#6B7280'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className={`text-sm ${textSec} py-12 text-center`}>No order status data</p>
              )}
            </motion.div>
          </div>
        )}

        {/* ═════════ NEW: Top Products + Regional Mix (WooCommerce) ═════════ */}
        {showWooCommerce && ((wcData?.products?.length || 0) > 0 || (wcData?.regions?.length || 0) > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {(wcData?.products?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Package size={16} className="text-violet-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Top Products by Revenue</h3>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(220, Math.min(wcData.products.length, 6) * 40)}>
                  <BarChart data={wcData.products.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v)} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="revenue" fill="#8B5CF6" radius={[0,4,4,0]} animationDuration={500} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {(wcData?.regions?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={16} className="text-emerald-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Top Regions by Revenue</h3>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(220, Math.min(wcData.regions.length, 8) * 30)}>
                  <BarChart data={wcData.regions.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v)} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="state" width={50} tick={{ fontSize: 11 }} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[0,4,4,0]} animationDuration={500} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>
        )}

        {/* ═════════ NEW: Marketing Spend Trend (Google Ads) ═════════ */}
        {showAds && mkt.hasLiveData && (mkt.spendByPeriod?.length || 0) > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className={`rounded-xl p-6 mb-8 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Megaphone size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Marketing Spend Trend</h3>
            </div>
            <p className={`text-[11px] mb-4 ${textSec}`}>Sani-Tred Google Ads (CID 2823564937) — daily spend over the selected range</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mkt.spendByPeriod}>
                <defs>
                  <linearGradient id="stSpendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                <XAxis dataKey="period" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                <Area type="monotone" dataKey="spend" stroke="#F59E0B" fill="url(#stSpendGrad)" strokeWidth={2} dot={false} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* ═════════ NEW: Web Traffic Sources + Devices ═════════ */}
        {showGA4 && ga4.hasLiveData && ((ga4.trafficSources?.length || 0) > 0 || (ga4.deviceData?.length || 0) > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {(ga4.trafficSources?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={16} className="text-blue-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Top Traffic Sources</h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={ga4.trafficSources.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="source_medium" width={140} tick={{ fontSize: 10 }} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [(v || 0).toLocaleString() + ' sessions']} />
                    <Bar dataKey="sessions" fill="#3B82F6" radius={[0,4,4,0]} animationDuration={500} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {(ga4.deviceData?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className={`rounded-xl p-6 ${cardBg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe size={16} className="text-violet-400" />
                  <h3 className={`text-base font-semibold ${textPri}`}>Sessions by Device</h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={ga4.deviceData.map((d) => ({ name: d.name || d.device || 'unknown', value: d.sessions || d.users || d.value || 0 }))}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value"
                      animationDuration={500}>
                      {ga4.deviceData.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </div>
        )}

        {/* Top Websites (GA4) */}
        {showGA4 && (data?.top_websites || []).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-blue-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Sani-Tred Properties by Users</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.top_websites} layout="vertical">
                <XAxis type="number" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} />
                <YAxis dataKey="name" type="category" width={180} stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' users']} />
                <Bar dataKey="users" radius={[0, 6, 6, 0]} animationDuration={500}>
                  {data.top_websites.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default SaniTredDashboard;
