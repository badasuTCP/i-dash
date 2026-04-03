import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Activity,
  Target,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Layout from '../components/layout/Layout';
import useDashboard from '../hooks/useDashboard';

const StatCard = ({ icon: Icon, label, value, change, changePercent }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -4 }}
    className="card-hover"
  >
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 rounded-lg bg-primary-500/20 border border-primary-500/30">
        <Icon className="text-primary-400" size={24} />
      </div>
      {changePercent && (
        <div className={`flex items-center gap-1 text-sm font-medium ${changePercent >= 0 ? 'text-accent-400' : 'text-danger-400'}`}>
          {changePercent >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>{Math.abs(changePercent)}%</span>
        </div>
      )}
    </div>
    <p className="text-slate-400 text-sm mb-1">{label}</p>
    <p className="text-3xl font-bold text-slate-100 mb-2">{value}</p>
    {change && <p className="text-xs text-slate-500">{change}</p>}
  </motion.div>
);

const ChartCard = ({ title, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="card"
  >
    <h3 className="text-lg font-semibold text-slate-100 mb-6">{title}</h3>
    {children}
  </motion.div>
);

export const DashboardPage = () => {
  const dashboard = useDashboard(30);

  // Mock data for charts
  const revenueData = [
    { date: 'Mar 1', revenue: 4200, target: 4000 },
    { date: 'Mar 2', revenue: 5100, target: 4200 },
    { date: 'Mar 3', revenue: 4800, target: 4400 },
    { date: 'Mar 4', revenue: 5900, target: 4600 },
    { date: 'Mar 5', revenue: 6200, target: 4800 },
    { date: 'Mar 6', revenue: 5500, target: 5000 },
    { date: 'Mar 7', revenue: 6800, target: 5200 },
  ];

  const conversionData = [
    { stage: 'Awareness', visitors: 2400, conversions: 240 },
    { stage: 'Interest', visitors: 1398, conversions: 221 },
    { stage: 'Consideration', visitors: 2800, conversions: 229 },
    { stage: 'Decision', visitors: 3908, conversions: 200 },
    { stage: 'Action', visitors: 4800, conversions: 221 },
  ];

  const handleRefresh = async () => {
    await dashboard.refetch();
  };

  const handleDateRangeChange = (start, end) => {
    dashboard.setDateRange(start, end);
  };

  return (
    <Layout
      onRefresh={handleRefresh}
      loading={dashboard.loading}
      startDate={dashboard.startDate}
      endDate={dashboard.endDate}
      onDateRangeChange={handleDateRangeChange}
    >
      {/* Page header */}
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="h1 text-slate-100 mb-2">Welcome Back</h1>
          <p className="subtitle">Here's what's happening with your business today</p>
        </motion.div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid mb-8">
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value="$45,231.89"
          change="From last month"
          changePercent={12.5}
        />
        <StatCard
          icon={Users}
          label="New Customers"
          value="1,234"
          change="This month"
          changePercent={8.2}
        />
        <StatCard
          icon={Activity}
          label="Conversion Rate"
          value="3.24%"
          change="Up from 2.8%"
          changePercent={5.3}
        />
        <StatCard
          icon={Target}
          label="Active Campaigns"
          value="12"
          change="3 paused"
          changePercent={-2.1}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Revenue Trend">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="date" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                  borderRadius: '8px',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3B82F6"
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conversion by Stage">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="stage" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="visitors" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="conversions" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-lg font-semibold text-slate-100 mb-6">Recent Activity</h3>
        <div className="space-y-3">
          {[
            { title: 'New customer sign-up', description: 'John Smith joined', time: '2 hours ago' },
            { title: 'Campaign launched', description: 'Spring Sale campaign is live', time: '5 hours ago' },
            { title: 'Report generated', description: 'Monthly performance report available', time: '1 day ago' },
            { title: 'Integration synced', description: 'Salesforce data updated', time: '3 days ago' },
          ].map((activity, idx) => (
            <div
              key={idx}
              className="flex items-start gap-4 p-3 rounded-lg bg-slate-800/20 hover:bg-slate-800/40 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-200">{activity.title}</p>
                <p className="text-sm text-slate-400">{activity.description}</p>
              </div>
              <p className="text-xs text-slate-500 flex-shrink-0">{activity.time}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </Layout>
  );
};

export default DashboardPage;
