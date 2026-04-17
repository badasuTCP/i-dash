import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { dashboardAPI } from '../../services/api';
import { useDashboardDateFilter } from '../../hooks/useDashboardDateFilter';
import ScoreCard from '../../components/scorecards/ScoreCard';
import PageInsight from '../../components/common/PageInsight';
import { Loader2, AlertCircle, ShoppingCart, Package, MapPin } from 'lucide-react';

const fmtCurrency = (v) => {
  if (v == null) return '$0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v).toFixed(2)}`;
};

const STATUS_COLORS = {
  completed: '#10B981', processing: '#3B82F6', pending: '#F59E0B',
  refunded: '#EF4444', cancelled: '#6B7280', failed: '#DC2626', 'on-hold': '#8B5CF6',
};

const TABS = [
  { id: 'overview',  label: 'Store Overview' },
  { id: 'products',  label: 'Product Analysis' },
  { id: 'orders',    label: 'Orders' },
  { id: 'regional',  label: 'Regional Insights' },
];

const SaniTredRetail = () => {
  const { isDark } = useTheme();
  const { dateRange } = useDashboardDateFilter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await dashboardAPI.getWCStore(dateRange?.start, dateRange?.end);
        if (!cancelled) setData(res.data);
      } catch { /* endpoint may not exist yet */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  const cardBg = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSec = isDark ? 'text-slate-400' : 'text-slate-600';
  const tableBorder = isDark ? 'border-slate-700/30' : 'border-slate-200';
  const tableHover = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    border: `1px solid ${isDark ? 'rgba(71,85,105,0.3)' : 'rgba(203,213,225,0.5)'}`,
    borderRadius: '8px', color: isDark ? '#e2e8f0' : '#1e293b',
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-400" size={36} /></div>;
  }

  const s = data?.scorecards || {};
  const hasLive = data?.hasLiveData;

  const scorecards = [
    { label: 'Total Retail Revenue', value: s.totalRevenue || 0, color: 'blue', format: 'currency' },
    { label: 'Online Orders',        value: s.totalOrders  || 0, color: 'violet', format: 'number' },
    { label: 'Avg Order Value',      value: s.avgOrderValue || 0, color: 'emerald', format: 'currency' },
    { label: 'Refund Rate',          value: s.refundRate || 0, color: 'amber', format: 'percent' },
  ];

  const insights = hasLive
    ? [
        `Total revenue: ${fmtCurrency(s.totalRevenue)} across ${s.totalOrders} orders.`,
        s.avgOrderValue > 0 ? `Average order value: ${fmtCurrency(s.avgOrderValue)}.` : null,
        s.refundRate > 0 ? `Refund rate: ${s.refundRate}% (${s.refundedOrders} refunds).` : 'No refunds in this period.',
      ].filter(Boolean)
    : ['Run the WooCommerce pipeline to see live Sani-Tred retail data.'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">

        <div className="mb-6">
          <h1 className={`text-3xl font-bold mb-1 ${textPrimary}`}>Sani-Tred Store</h1>
          <p className={textSec}>Channel performance, product insights, and regional analysis</p>
        </div>

        {!hasLive && (
          <div className="mb-6 p-3 rounded-lg flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <AlertCircle size={15} className="mt-0.5" />
            <span>Awaiting WooCommerce pipeline. Run the pipeline from Data Pipelines to load live data.</span>
          </div>
        )}

        {hasLive && <PageInsight insights={insights} />}

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-indigo-600 text-white'
                  : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {scorecards.map((sc, i) => <ScoreCard key={i} {...sc} />)}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Month</h3>
                {(data?.monthly?.length || 0) === 0
                  ? <p className={`text-sm ${textSec} py-12 text-center`}>No data for this period</p>
                  : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={data.monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                        <XAxis dataKey="month" stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tick={{ fontSize: 11 }} />
                        <YAxis stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} tickFormatter={(v) => fmtCurrency(v)} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                        <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Orders by Status</h3>
                {(data?.ordersByStatus?.length || 0) === 0
                  ? <p className={`text-sm ${textSec} py-12 text-center`}>No data</p>
                  : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={data.ordersByStatus.map((o) => ({ name: o.status, value: o.count }))}
                          cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                          {data.ordersByStatus.map((o, i) => <Cell key={i} fill={STATUS_COLORS[o.status] || '#6B7280'} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 mb-8 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Monthly Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-4 ${textSec}`}>Month</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Orders</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Revenue</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Avg Order</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Refunds</th>
                  </tr></thead>
                  <tbody>
                    {(data?.monthly || []).map((m, i) => (
                      <tr key={i} className={`border-b ${tableBorder} ${tableHover}`}>
                        <td className={`py-3 px-4 ${textPrimary}`}>{m.month}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{m.orders.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(m.revenue)}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(m.avg_order)}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{m.refunds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}

        {tab === 'products' && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 mb-8 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <Package className="text-violet-400" size={18} />
                <h3 className={`text-lg font-semibold ${textPrimary}`}>Product Performance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-4 ${textSec}`}>#</th>
                    <th className={`text-left py-3 px-4 ${textSec}`}>Product</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Units Sold</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Revenue</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Price</th>
                    <th className={`text-left py-3 px-4 ${textSec}`}>Categories</th>
                  </tr></thead>
                  <tbody>
                    {(data?.products || []).map((p, i) => (
                      <tr key={p.product_id} className={`border-b ${tableBorder} ${tableHover}`}>
                        <td className={`py-3 px-4 ${textSec}`}>{i + 1}</td>
                        <td className={`py-3 px-4 font-medium ${textPrimary}`}>{p.name}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{p.total_sales.toLocaleString()}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(p.revenue)}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(p.price)}</td>
                        <td className={`py-3 px-4 text-xs ${textSec}`}>{p.categories}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
            {(data?.products?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Product</h3>
                <ResponsiveContainer width="100%" height={Math.max(300, (data.products.length || 1) * 35)}>
                  <BarChart data={data.products.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v)} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="revenue" fill="#8B5CF6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </>
        )}

        {tab === 'orders' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="text-blue-400" size={18} />
                <h3 className={`text-lg font-semibold ${textPrimary}`}>Orders by Status</h3>
              </div>
              <div className="space-y-3">
                {(data?.ordersByStatus || []).map((o) => (
                  <div key={o.status} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[o.status] || '#6B7280' }} />
                      <span className={`text-sm font-medium capitalize ${textPrimary}`}>{o.status}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className={`text-sm ${textSec}`}>{o.count} orders</span>
                      <span className={`text-sm font-semibold ${textPrimary}`}>{fmtCurrency(o.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
              <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Payment Methods</h3>
              <div className="space-y-3">
                {(data?.paymentMethods || []).map((p) => (
                  <div key={p.method} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                    <span className={`text-sm font-medium ${textPrimary}`}>{p.method}</span>
                    <div className="flex gap-4">
                      <span className={`text-sm ${textSec}`}>{p.count} orders</span>
                      <span className={`text-sm font-semibold ${textPrimary}`}>{fmtCurrency(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {tab === 'regional' && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 mb-8 ${cardBg}`}>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="text-emerald-400" size={18} />
                <h3 className={`text-lg font-semibold ${textPrimary}`}>Regional Detail</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className={`border-b ${tableBorder}`}>
                    <th className={`text-left py-3 px-4 ${textSec}`}>Region</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Revenue</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Orders</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>% of Total</th>
                    <th className={`text-right py-3 px-4 ${textSec}`}>Avg Order</th>
                  </tr></thead>
                  <tbody>
                    {(data?.regions || []).map((r) => (
                      <tr key={r.state} className={`border-b ${tableBorder} ${tableHover}`}>
                        <td className={`py-3 px-4 font-medium ${textPrimary}`}>{r.state || '—'}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(r.revenue)}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{r.orders}</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{r.pct_of_total}%</td>
                        <td className={`text-right py-3 px-4 ${textSec}`}>{fmtCurrency(r.avg_order)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
            {(data?.regions?.length || 0) > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-6 ${cardBg}`}>
                <h3 className={`text-lg font-semibold mb-4 ${textPrimary}`}>Revenue by Region</h3>
                <ResponsiveContainer width="100%" height={Math.max(300, (data.regions.length || 1) * 30)}>
                  <BarChart data={data.regions.slice(0, 15)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(148,163,184,0.1)' : 'rgba(203,213,225,0.5)'} />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v)} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <YAxis type="category" dataKey="state" width={60} tick={{ fontSize: 11 }} stroke={isDark ? 'rgba(148,163,184,0.5)' : '#94a3b8'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCurrency(v)} />
                    <Bar dataKey="revenue" fill="#10B981" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </>
        )}

      </div>
    </motion.div>
  );
};

export default SaniTredRetail;
