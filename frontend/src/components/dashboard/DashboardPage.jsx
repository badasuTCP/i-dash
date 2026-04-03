import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import useDashboard from '../../hooks/useDashboard';
import ScoreCardGrid from '../scorecards/ScoreCardGrid';
import PremiumAreaChart from '../charts/AreaChart';
import PremiumBarChart from '../charts/BarChart';
import PremiumDonutChart from '../charts/DonutChart';
import PremiumLineChart from '../charts/LineChart';
import ChartCard from '../charts/ChartCard';
import MetricTable from '../charts/MetricTable';
import InsightCard from '../ai/InsightCard';
import AIChatPanel from '../ai/AIChatPanel';
import DateRangePicker from '../common/DateRangePicker';
import LoadingScreen from '../common/LoadingScreen';
import { TrendingUp, BarChart3, PieChart, Activity } from 'lucide-react';

const DashboardPage = () => {
  const {
    overview,
    scorecards,
    revenue,
    ads,
    hubspot,
    loading,
    error,
    startDate,
    endDate,
    setDateRange,
    refetch,
  } = useDashboard(30);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [dismissedInsight, setDismissedInsight] = useState(false);

  // Get user's first name from localStorage
  const userName = localStorage.getItem('userName') || 'Daniel';
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  if (loading && !scorecards) {
    return <LoadingScreen message="Loading your dashboard..." />;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-8 glass-dark rounded-xl text-center"
      >
        <p className="text-red-400">Error loading dashboard: {error}</p>
        <button onClick={refetch} className="mt-4 btn-primary">
          Retry
        </button>
      </motion.div>
    );
  }

  const revenueData = [
    { date: 'Jan 1', revenue: 45000, cost: 18000 },
    { date: 'Jan 8', revenue: 52000, cost: 19500 },
    { date: 'Jan 15', revenue: 48000, cost: 17200 },
    { date: 'Jan 22', revenue: 61000, cost: 21000 },
    { date: 'Jan 29', revenue: 72000, cost: 24000 },
    { date: 'Feb 5', revenue: 95000, cost: 28500 },
    { date: 'Feb 12', revenue: 124500, cost: 32000 },
  ];

  const platformData = [
    { name: 'Meta', revenue: 45000, cost: 18000 },
    { name: 'Google', revenue: 52000, cost: 19500 },
    { name: 'TikTok', revenue: 28000, cost: 12000 },
    { name: 'LinkedIn', revenue: 18500, cost: 8000 },
  ];

  const campaignData = [
    { date: 'Day 1', campaign1: 2.5, campaign2: 1.8 },
    { date: 'Day 2', campaign1: 3.1, campaign2: 2.2 },
    { date: 'Day 3', campaign1: 2.8, campaign2: 2.9 },
    { date: 'Day 4', campaign1: 4.2, campaign2: 3.5 },
    { date: 'Day 5', campaign1: 5.1, campaign2: 4.1 },
    { date: 'Day 6', campaign1: 4.9, campaign2: 4.8 },
    { date: 'Day 7', campaign1: 6.2, campaign2: 5.4 },
  ];

  const trafficData = [
    { name: 'Organic Search', value: 45230 },
    { name: 'Paid Ads', value: 38450 },
    { name: 'Social Media', value: 28720 },
    { name: 'Email', value: 16380 },
    { name: 'Referral', value: 12100 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                {greeting}, {userName}
              </h1>
              <p className="text-slate-400">
                {format(now, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
            <DateRangePicker onApply={setDateRange} />
          </div>
        </motion.div>

        {/* AI Insight Card */}
        {!dismissedInsight && (
          <InsightCard
            insight={{
              title: 'Weekly Performance',
              text: 'Your **Meta Ads campaign** is performing exceptionally well with a **2.21 ROAS**. The cost per lead dropped to **$15.20** (-10.6%), representing your best performance this quarter. Consider scaling budget by **15-20%**.',
              timestamp: new Date(),
            }}
            onAskMore={() => setIsChatOpen(true)}
            onDismiss={() => setDismissedInsight(true)}
          />
        )}

        {/* Scorecard Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-10"
        >
          <ScoreCardGrid loading={loading} />
        </motion.div>

        {/* Charts Row 1 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10"
        >
          {/* Revenue Trend */}
          <div className="lg:col-span-2">
            <ChartCard
              title="Revenue Trend"
              icon={TrendingUp}
              subtitle="Weekly breakdown"
              dateRange="Last 6 weeks"
              loading={loading}
            >
              <PremiumAreaChart
                data={revenueData}
                series={[
                  { key: 'revenue', name: 'Revenue', color: '#10B981' },
                  { key: 'cost', name: 'Cost', color: '#F59E0B' },
                ]}
                height={300}
              />
            </ChartCard>
          </div>

          {/* Pipeline Overview */}
          <ChartCard
            title="Traffic Sources"
            icon={PieChart}
            dateRange="This month"
            loading={loading}
          >
            <PremiumDonutChart
              data={trafficData}
              height={300}
              showLegend={true}
              centerLabel="Total"
            />
          </ChartCard>
        </motion.div>

        {/* Charts Row 2 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
        >
          {/* Platform Performance */}
          <ChartCard
            title="Ad Spend vs Revenue"
            icon={BarChart3}
            subtitle="By platform"
            dateRange="This month"
            loading={loading}
          >
            <PremiumBarChart
              data={platformData}
              series={[
                { key: 'revenue', name: 'Revenue', color: '#10B981' },
                { key: 'cost', name: 'Ad Spend', color: '#3B82F6' },
              ]}
              height={300}
            />
          </ChartCard>

          {/* Campaign Performance */}
          <ChartCard
            title="Campaign Performance"
            icon={Activity}
            subtitle="ROAS by campaign"
            dateRange="Last 7 days"
            loading={loading}
          >
            <PremiumLineChart
              data={campaignData}
              series={[
                { key: 'campaign1', name: 'Q1 Campaign', color: '#8B5CF6' },
                { key: 'campaign2', name: 'Spring Promo', color: '#EC4899' },
              ]}
              height={300}
              targetLine={{ value: 3.5, label: 'Target ROAS' }}
            />
          </ChartCard>
        </motion.div>

        {/* Top Campaigns Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-10"
        >
          <ChartCard
            title="Top Campaigns"
            icon={BarChart3}
            subtitle="Performance metrics"
            loading={loading}
          >
            <MetricTable />
          </ChartCard>
        </motion.div>

        {/* Bottom Section - Pipeline + Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Pipeline Overview */}
          <div className="lg:col-span-2">
            <ChartCard
              title="Sales Pipeline"
              icon={TrendingUp}
              subtitle="Stage breakdown"
              loading={loading}
            >
              <PremiumBarChart
                data={[
                  { name: 'Prospecting', revenue: 125000 },
                  { name: 'Qualification', revenue: 235000 },
                  { name: 'Proposal', revenue: 185000 },
                  { name: 'Negotiation', revenue: 95000 },
                ]}
                series={[{ key: 'revenue', name: 'Deal Value', color: '#3B82F6' }]}
                height={250}
              />
            </ChartCard>
          </div>

          {/* Recent Activity */}
          <motion.div className="glass-dark p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {[
                { label: 'New Lead', value: 'Sarah Anderson', time: '2 min ago', color: 'blue' },
                { label: 'Deal Won', value: '$24,500', time: '15 min ago', color: 'emerald' },
                { label: 'Campaign Start', value: 'Spring Q2', time: '1 hour ago', color: 'violet' },
                { label: 'New Contact', value: 'Mike Johnson', time: '3 hours ago', color: 'amber' },
              ].map((activity, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm text-slate-400">{activity.label}</p>
                    <p className="text-sm font-semibold text-white">{activity.value}</p>
                  </div>
                  <span className="text-xs text-slate-500">{activity.time}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Floating AI Chat Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-2xl transition-all z-30"
      >
        <MessageCircle className="w-7 h-7" />
      </motion.button>

      {/* AI Chat Panel */}
      <AIChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </motion.div>
  );
};

export default DashboardPage;
