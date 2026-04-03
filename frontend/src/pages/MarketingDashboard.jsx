import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Mail, Share2, Target } from 'lucide-react';
import Layout from '../components/layout/Layout';
import useDashboard from '../hooks/useDashboard';

const StatCard = ({ icon: Icon, label, value, change, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -4 }}
    className="card-hover"
  >
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="text-white" size={24} />
      </div>
    </div>
    <p className="text-slate-400 text-sm mb-1">{label}</p>
    <p className="text-3xl font-bold text-slate-100 mb-2">{value}</p>
    {change && <p className="text-xs text-slate-500">{change}</p>}
  </motion.div>
);

export const MarketingDashboard = () => {
  const dashboard = useDashboard(30);

  const campaignData = [
    { name: 'Jan', impressions: 4000, clicks: 2400, conversions: 240 },
    { name: 'Feb', impressions: 3000, clicks: 1398, conversions: 221 },
    { name: 'Mar', impressions: 2000, clicks: 9800, conversions: 229 },
    { name: 'Apr', impressions: 2780, clicks: 3908, conversions: 200 },
    { name: 'May', impressions: 1890, clicks: 4800, conversions: 221 },
    { name: 'Jun', impressions: 2390, clicks: 3800, conversions: 250 },
  ];

  const channelData = [
    { name: 'Email', value: 35 },
    { name: 'Social', value: 28 },
    { name: 'Organic', value: 22 },
    { name: 'Paid', value: 15 },
  ];

  const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'];

  const handleRefresh = () => dashboard.refetch();
  const handleDateRangeChange = (start, end) => dashboard.setDateRange(start, end);

  return (
    <Layout
      onRefresh={handleRefresh}
      loading={dashboard.loading}
      startDate={dashboard.startDate}
      endDate={dashboard.endDate}
      onDateRangeChange={handleDateRangeChange}
    >
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="h1 text-slate-100 mb-2">Marketing Dashboard</h1>
          <p className="subtitle">Campaign performance and channel analytics</p>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-8">
        <StatCard
          icon={Mail}
          label="Total Emails"
          value="45,231"
          change="This month"
          color="bg-primary-500/30 border border-primary-500/30"
        />
        <StatCard
          icon={Share2}
          label="Social Reach"
          value="128.4K"
          change="Up 12%"
          color="bg-secondary-500/30 border border-secondary-500/30"
        />
        <StatCard
          icon={Target}
          label="Conversion Rate"
          value="4.8%"
          change="Target: 5%"
          color="bg-accent-500/30 border border-accent-500/30"
        />
        <StatCard
          icon={TrendingUp}
          label="ROI"
          value="320%"
          change="Above target"
          color="bg-warning-500/30 border border-warning-500/30"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 card"
        >
          <h3 className="text-lg font-semibold text-slate-100 mb-6">Campaign Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={campaignData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="name" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                }}
              />
              <Legend />
              <Bar dataKey="impressions" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="clicks" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="conversions" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-lg font-semibold text-slate-100 mb-6">Channel Mix</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={channelData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {channelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {channelData.map((channel, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: colors[idx] }}
                  />
                  <span className="text-slate-400">{channel.name}</span>
                </div>
                <span className="font-medium text-slate-200">{channel.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top campaigns table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-lg font-semibold text-slate-100 mb-6">Top Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>Channel</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Cost</th>
                <th>Revenue</th>
                <th>ROI</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Spring Sale', channel: 'Email', impressions: '45K', clicks: '2.3K', ctr: '5.1%', cost: '$1,200', revenue: '$8,500', roi: '608%' },
                { name: 'Summer Campaign', channel: 'Social', impressions: '128K', clicks: '4.1K', ctr: '3.2%', cost: '$2,500', revenue: '$9,200', roi: '268%' },
                { name: 'Product Launch', channel: 'Paid', impressions: '92K', clicks: '5.2K', ctr: '5.7%', cost: '$3,800', revenue: '$12,100', roi: '218%' },
                { name: 'Holiday Promo', channel: 'Organic', impressions: '156K', clicks: '3.8K', ctr: '2.4%', cost: '$500', revenue: '$6,800', roi: '1260%' },
              ].map((campaign, idx) => (
                <tr key={idx}>
                  <td className="font-medium">{campaign.name}</td>
                  <td>
                    <span className="badge-primary">{campaign.channel}</span>
                  </td>
                  <td>{campaign.impressions}</td>
                  <td>{campaign.clicks}</td>
                  <td className="text-accent-400">{campaign.ctr}</td>
                  <td>{campaign.cost}</td>
                  <td className="text-primary-400">{campaign.revenue}</td>
                  <td className="text-accent-400 font-medium">{campaign.roi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </Layout>
  );
};

export default MarketingDashboard;
