import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { CheckCircle2, AlertCircle, TrendingUp, Users, Globe, DollarSign, ShoppingBag, HardHat } from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import { useGlobalDate } from '../../context/GlobalDateContext';
import { useTheme } from '../../context/ThemeContext';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';
import SortableBarChart from '../../components/common/SortableBarChart';
import useRepExclusions from '../../hooks/useRepExclusions';

const CPDashboard = () => {
  const { isDark } = useTheme();
  const { dateFrom, dateTo } = useGlobalDate();
  const { filterReps } = useRepExclusions();
  const { isPipelineVisible } = useDashboardConfig();
  const showHubspot = isPipelineVisible('hubspot');
  const showGA4     = isPipelineVisible('ga4');
  const showShopify = isPipelineVisible('shopify');
  const showAds     = isPipelineVisible('metaAds') || isPipelineVisible('googleAds');
  const [data, setData] = useState(null);
  const [shopifyDetail, setShopifyDetail] = useState(null);
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdEnd = new Date().toISOString().slice(0, 10);
  const from = dateFrom || ytdStart;
  const to = dateTo || ytdEnd;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // QB contractor revenue (formerly on I-BOS) lives here on CP now —
      // CP is the corporate revenue centre (Retail + all Contractor QB).
      const [summaryRes, shopifyRes, revRes] = await Promise.all([
        dashboardAPI.getBrandSummary('cp', from, to),
        dashboardAPI.getShopifyStore(from, to).catch(() => null),
        dashboardAPI.getAllContractorsRevenue(from, to, 10).catch(() => ({ data: null })),
      ]);
      setData(summaryRes?.data || null);
      setShopifyDetail(shopifyRes?.data || null);
      setRevenueData(revRes?.data || null);
    } catch { setData(null); setShopifyDetail(null); setRevenueData(null); }
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
  const _clrs = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#F97316','#14B8A6','#6366F1'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPri}`}>CP Overview</h1>
          <p className={textSec}>The Concrete Protector — Executive summary across Web, Marketing & Sales</p>
        </motion.div>

        {/* Status banner */}
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
          const leads = data?.ads?.leads || 0;
          const spend = data?.ads?.spend || 0;
          const deals = data?.crm?.deals || 0;
          const storeRev = data?.shopify?.revenue || 0;
          const storeOrders = data?.shopify?.orders || 0;
          const storeCard = sc.find(s => /cp store revenue/i.test(s.label));
          if (storeCard && (storeCard.value || 0) > 0) {
            out.push(`CP Store Revenue = Shopify order totals only. HubSpot deals, QB contractor revenue, and Sani-Tred retail are intentionally excluded from this tile.`);
          }
          if (visits) out.push(`CP traffic: ${Number(visits).toLocaleString()} visits in the selected range.`);
          if (spend) out.push(`CP marketing spend: $${Number(spend).toLocaleString()} · ${Number(leads).toLocaleString()} ad leads.`);
          if (storeOrders) out.push(`CP Store: $${Number(storeRev).toLocaleString()} across ${storeOrders.toLocaleString()} orders.`);
          if (deals) out.push(`${deals} active deals in HubSpot CRM.`);
          return out;
        })()} />

        {/* KPI Scorecards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {(data?.scorecards || []).map((kpi, i) => (
            <ScoreCard key={i} {...kpi} change={0} sparkData={[]} />
          ))}
        </div>

        {/* ── QB Contractor Revenue split (corporate revenue centre) ──
             Active = full performance card. In-Active = headcount-only
             scorecard per the exec directive (no detail breakdown). */}
        {revenueData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <ScoreCard label="Total QB Revenue" value={revenueData.grand_total || 0} change={0} color="emerald" format="currency" sparkData={[]} />
            <ScoreCard label="Active I-BOS Contractors" value={revenueData.active_total || 0} change={revenueData.active_pct} color="blue" format="currency" sparkData={[]} />
            <ScoreCard label="In-Active I-BOS Contractors" value={revenueData.inactive_count || 0} change={0} color="amber" format="number" sparkData={[]} />
            <ScoreCard label="Total QB Customers" value={(revenueData.active_count || 0) + (revenueData.inactive_count || 0) + (revenueData.retail_count || 0)} change={0} color="violet" format="number" sparkData={[]} />
          </div>
        )}

        {/* ── Top Active Contractors by Revenue (active-only, no inactive
             breakdown — execs want active performance, not legacy detail). */}
        {revenueData?.top_active?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className={`rounded-xl p-6 mb-8 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <HardHat size={16} className="text-blue-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Active Contractors by Revenue</h3>
              <span className={`ml-auto text-xs ${textSec}`}>{revenueData.active_count} active total</span>
            </div>
            <SortableBarChart
              data={revenueData.top_active}
              nameKey="name"
              metrics={[{ key: 'revenue', label: 'Revenue (QB)', color: '#3B82F6', format: 'currency' }]}
            />
          </motion.div>
        )}

        {/* Row 2: Traffic Trend + Top Reps */}
        {(showGA4 || showHubspot) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Traffic Trend — 2/3 width (GA4) */}
          {showGA4 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-blue-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Web Traffic Trend</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data?.traffic_trend || []}>
                <defs>
                  <linearGradient id="cpTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                <XAxis dataKey="date" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [(v || 0).toLocaleString() + ' visits']} />
                <Area type="monotone" dataKey="visits" stroke="#3B82F6" fill="url(#cpTrendGrad)" strokeWidth={2} dot={false} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
          )}

          {/* Top Reps — 1/3 width (HubSpot) */}
          {showHubspot && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`rounded-xl p-6 ${cardBg} ${showGA4 ? '' : 'lg:col-span-3'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-violet-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top Sales Reps</h3>
            </div>
            <div className="space-y-3">
              {filterReps(data?.top_reps || []).map((rep, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-amber-700 text-white'
                      : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                    }`}>{i + 1}</span>
                    <span className={`text-sm font-medium ${textPri}`}>{rep.name}</span>
                  </div>
                  <span className={`text-sm font-semibold ${textSec}`}>{(rep.deals || 0).toLocaleString()} deals</span>
                </div>
              ))}
              {(data?.top_reps || []).length === 0 && (
                <p className={`text-sm ${textSec}`}>Run HubSpot pipeline to populate</p>
              )}
            </div>
          </motion.div>
          )}
        </div>
        )}

        {/* Row 3: Top Websites + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Websites pie */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-emerald-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Top CP Websites by Users</h3>
            </div>
            {(data?.top_websites || []).length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.top_websites} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="users" animationDuration={500}>
                      {data.top_websites.map((e, i) => <Cell key={i} fill={e.color || _clrs[i % _clrs.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [(v || 0).toLocaleString() + ' users']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2 max-h-[200px] overflow-y-auto">
                  {data.top_websites.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || _clrs[i % _clrs.length] }} />
                        <span className={`${textSec} truncate`}>{s.name}</span>
                      </div>
                      <span className={`font-medium ${textPri} flex-shrink-0 ml-2`}>{(s.users || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={`text-sm ${textSec} text-center py-16`}>Run GA4 pipeline to populate</p>
            )}
          </motion.div>

          {/* Quick stats grid */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className={`rounded-xl p-6 ${cardBg}`}>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={16} className="text-amber-400" />
              <h3 className={`text-base font-semibold ${textPri}`}>Key Metrics at a Glance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Web Sessions', value: (data?.web?.visits || 0).toLocaleString(), sub: `${(data?.web?.users || 0).toLocaleString()} unique users` },
                { label: 'Bounce Rate', value: `${data?.web?.bounce_rate || 0}%`, sub: 'avg across all sites' },
                { label: 'Ad Clicks', value: (data?.ads?.clicks || 0).toLocaleString(), sub: `${(data?.ads?.impressions || 0).toLocaleString()} impressions` },
                { label: 'Ad Leads', value: (data?.ads?.leads || 0).toLocaleString(), sub: `$${((data?.ads?.spend || 0) / Math.max(data?.ads?.leads || 1, 1)).toFixed(0)} CPL` },
                { label: 'CP Store Revenue', value: `$${Number(data?.shopify?.revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `${(data?.shopify?.orders || 0).toLocaleString()} online orders` },
                { label: 'Avg Order Value', value: `$${Number(data?.shopify?.avg_order || 0).toFixed(0)}`, sub: 'Shopify (CP Store)' },
                { label: 'HubSpot Deals', value: (data?.crm?.deals || 0).toLocaleString(), sub: `${data?.crm?.deals_won || 0} won` },
                { label: 'Meetings', value: (data?.crm?.meetings || 0).toLocaleString(), sub: `${(data?.crm?.contacts || 0).toLocaleString()} contacts` },
              ].map((m, i) => (
                <div key={i} className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${textSec}`}>{m.label}</p>
                  <p className={`text-xl font-bold ${textPri}`}>{m.value}</p>
                  <p className={`text-[10px] mt-0.5 ${textSec}`}>{m.sub}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Row 4: CP Store (Shopify) charts */}
        {showShopify && (shopifyDetail?.hasLiveData) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <ShoppingBag size={16} className="text-rose-400" />
                <h3 className={`text-base font-semibold ${textPri}`}>CP Store — Monthly Revenue</h3>
              </div>
              {(shopifyDetail?.monthly?.length || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={shopifyDetail.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                    <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                    <YAxis stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v, k) => k === 'orders' ? [`${v} orders`, 'Orders'] : [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" fill="#F97066" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className={`text-sm ${textSec} text-center py-12`}>No Shopify orders in range</p>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-violet-400" />
                <h3 className={`text-base font-semibold ${textPri}`}>CP Store — Top Products by Revenue</h3>
              </div>
              {(() => {
                const rows = (shopifyDetail?.products || []).filter(p => (p.revenue || 0) > 0).slice(0, 5);
                if (rows.length === 0) {
                  return <p className={`text-sm ${textSec} text-center py-12`}>No product sales in range yet. Re-run the Shopify pipeline after this deploy to populate order lines.</p>;
                }
                return (
                  <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 42)}>
                    <BarChart data={rows} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(203,213,225,0.3)'} />
                      <XAxis type="number" tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                        stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={140} stroke={isDark ? 'rgba(148,163,184,0.4)' : '#94a3b8'} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                      <Bar dataKey="revenue" fill="#8B5CF6" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </motion.div>
          </div>
        )}

        {/* Row 5: Orders by Status pie + Refund stats */}
        {showShopify && (shopifyDetail?.hasLiveData) && (shopifyDetail?.ordersByStatus?.length || 0) > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className={`lg:col-span-1 rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-base font-semibold mb-4 ${textPri}`}>Orders by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={shopifyDetail.ordersByStatus} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3}>
                    {shopifyDetail.ordersByStatus.map((_, i) => (
                      <Cell key={i} fill={_clrs[i % _clrs.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {shopifyDetail.ordersByStatus.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: _clrs[i % _clrs.length] }} />
                      <span className={textSec}>{s.status || 'unknown'}</span>
                    </div>
                    <span className={`font-medium ${textPri}`}>{s.count}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className={`lg:col-span-2 rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-base font-semibold mb-4 ${textPri}`}>CP Store Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Revenue', value: `$${Number(shopifyDetail?.scorecards?.totalRevenue || 0).toLocaleString()}` },
                  { label: 'Orders', value: (shopifyDetail?.scorecards?.totalOrders || 0).toLocaleString() },
                  { label: 'Avg Order', value: `$${Number(shopifyDetail?.scorecards?.avgOrderValue || 0).toFixed(0)}` },
                  { label: 'Refund Rate', value: `${Number(shopifyDetail?.scorecards?.refundRate || 0)}%` },
                  { label: 'Unique Customers', value: (shopifyDetail?.scorecards?.uniqueCustomers || 0).toLocaleString() },
                  { label: 'Tax Collected', value: `$${Number(shopifyDetail?.scorecards?.totalTax || 0).toLocaleString()}` },
                  { label: 'Shipping', value: `$${Number(shopifyDetail?.scorecards?.totalShipping || 0).toLocaleString()}` },
                  { label: 'Discounts Given', value: `$${Number(shopifyDetail?.scorecards?.totalDiscount || 0).toLocaleString()}` },
                ].map((kpi, i) => (
                  <div key={i} className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                    <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${textSec}`}>{kpi.label}</p>
                    <p className={`text-lg font-bold ${textPri}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CPDashboard;
