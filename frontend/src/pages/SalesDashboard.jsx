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
import { Users, DollarSign, Zap, Target } from 'lucide-react';
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

export const SalesDashboard = () => {
  const dashboard = useDashboard(30);

  const pipelineData = [
    { stage: 'Lead', deals: 120, value: 240000 },
    { stage: 'Qualified', deals: 85, value: 510000 },
    { stage: 'Proposal', deals: 32, value: 480000 },
    { stage: 'Negotiation', deals: 18, value: 360000 },
    { stage: 'Closed', deals: 25, value: 500000 },
  ];

  const teamData = [
    { name: 'Jan', target: 40000, achieved: 48000 },
    { name: 'Feb', target: 40000, achieved: 42000 },
    { name: 'Mar', target: 50000, achieved: 52000 },
    { name: 'Apr', target: 50000, achieved: 48000 },
    { name: 'May', target: 55000, achieved: 58000 },
    { name: 'Jun', target: 55000, achieved: 61000 },
  ];

  const stageColors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E'];

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
          <h1 className="h1 text-slate-100 mb-2">Sales Dashboard</h1>
          <p className="subtitle">Pipeline and revenue forecasting</p>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-8">
        <StatCard
          icon={Users}
          label="Active Deals"
          value="280"
          change="In pipeline"
          color="bg-primary-500/30 border border-primary-500/30"
        />
        <StatCard
          icon={DollarSign}
          label="Pipeline Value"
          value="$2.09M"
          change="This quarter"
          color="bg-secondary-500/30 border border-secondary-500/30"
        />
        <StatCard
          icon={Zap}
          label="Avg Deal Size"
          value="$45.2K"
          change="Up 8%"
          color="bg-accent-500/30 border border-accent-500/30"
        />
        <StatCard
          icon={Target}
          label="Win Rate"
          value="34.5%"
          change="Target: 40%"
          color="bg-warning-500/30 border border-warning-500/30"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-lg font-semibold text-slate-100 mb-6">Sales Pipeline</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
              <XAxis dataKey="stage" stroke="rgba(148, 163, 184, 0.5)" />
              <YAxis stroke="rgba(148, 163, 184, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(71, 85, 105, 0.3)',
                }}
              />
              <Legend />
              <Bar dataKey="deals" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="value" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-lg font-semibold text-slate-100 mb-6">Revenue vs Target</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={teamData}>
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
              <Line
                type="monotone"
                dataKey="target"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ fill: '#F59E0B', r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="achieved"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ fill: '#3B82F6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Top sales reps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-lg font-semibold text-slate-100 mb-6">Top Sales Representatives</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Territory</th>
                <th>Deals Closed</th>
                <th>Revenue</th>
                <th>Target</th>
                <th>Achievement</th>
                <th>Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Sarah Johnson', territory: 'North', closed: 18, revenue: '$456K', target: '$400K', achievement: '114%', pipeline: '$850K' },
                { name: 'Mike Chen', territory: 'East', closed: 15, revenue: '$380K', target: '$400K', achievement: '95%', pipeline: '$720K' },
                { name: 'Emily Rodriguez', territory: 'West', closed: 22, revenue: '$520K', target: '$400K', achievement: '130%', pipeline: '$950K' },
                { name: 'David Wilson', territory: 'South', closed: 14, revenue: '$320K', target: '$400K', achievement: '80%', pipeline: '$580K' },
              ].map((rep, idx) => (
                <tr key={idx}>
                  <td className="font-medium">{rep.name}</td>
                  <td>{rep.territory}</td>
                  <td>{rep.closed}</td>
                  <td className="text-primary-400 font-medium">{rep.revenue}</td>
                  <td>{rep.target}</td>
                  <td>
                    <span className={`font-medium ${rep.achievement >= '100%' ? 'text-accent-400' : 'text-warning-400'}`}>
                      {rep.achievement}
                    </span>
                  </td>
                  <td className="text-secondary-400">{rep.pipeline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </Layout>
  );
};

export default SalesDashboard;
