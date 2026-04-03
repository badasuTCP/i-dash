import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import ScoreCard from '../scorecards/ScoreCard';
import ChartCard from '../charts/ChartCard';
import PremiumAreaChart from '../charts/AreaChart';
import PremiumBarChart from '../charts/BarChart';
import PremiumDonutChart from '../charts/DonutChart';
import PremiumLineChart from '../charts/LineChart';
import MetricTable from '../charts/MetricTable';
import InsightCard from '../ai/InsightCard';
import AIChatPanel from '../ai/AIChatPanel';
import { BarChart3, TrendingUp, Activity, Zap } from 'lucide-react';

const MarketingDashboard = () => {
  const { isDark } = useTheme();
  const [chatOpen, setChatOpen] = useState(false);

  // Marketing KPIs
  const marketingKPIs = [
    {
      label: 'Ad Spend',
      value: 34250,
      change: 8.2,
      color: 'blue',
      sparkData: [28000, 29500, 30200, 31500, 32800, 33500, 34250],
      format: 'currency',
    },
    {
      label: 'ROAS',
      value: 3.64,
      change: 15.8,
      color: 'violet',
      sparkData: [2.8, 2.95, 3.15, 3.35, 3.48, 3.58, 3.64],
      format: 'decimal',
    },
    {
      label: 'Leads',
      value: 1847,
      change: 14.5,
      color: 'emerald',
      sparkData: [1450, 1520, 1600, 1680, 1750, 1800, 1847],
      format: 'number',
    },
    {
      label: 'Conversions',
      value: 423,
      change: 22.1,
      color: 'amber',
      sparkData: [280, 310, 330, 360, 385, 405, 423],
      format: 'number',
    },
  ];

  // Ad spend by platform (last 6 months)
  const adSpendData = [
    { name: 'Meta', spend: 8500, google: 6200 },
    { name: 'Google', spend: 6200, google: 6200 },
    { name: 'LinkedIn', spend: 2500, google: 6200 },
    { name: 'TikTok', spend: 4200, google: 6200 },
    { name: 'Pinterest', spend: 3100, google: 6200 },
    { name: 'YouTube', spend: 9750, google: 6200 },
  ];

  // Traffic sources
  const trafficData = [
    { name: 'Organic', value: 45000 },
    { name: 'Paid', value: 35000 },
    { name: 'Social', value: 12000 },
    { name: 'Email', value: 8000 },
  ];

  // ROAS trend
  const roasData = [
    { date: 'Week 1', roas: 3.2 },
    { date: 'Week 2', roas: 3.35 },
    { date: 'Week 3', roas: 3.48 },
    { date: 'Week 4', roas: 3.64 },
    { date: 'Week 5', roas: 3.52 },
    { date: 'Week 6', roas: 3.64 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen pb-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* AI Insight Card */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <InsightCard
            insight={{
              title: 'Campaign Optimization',
              text: 'Your ad spend is optimized well. Meta is converting 23% better than last month — consider increasing budget there.',
              timestamp: new Date(),
            }}
            onAskMore={() => setChatOpen(true)}
          />
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-10"
        >
          <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Marketing Dashboard
          </h1>
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            Ad spend, ROAS, and campaign performance
          </p>
        </motion.div>

        {/* KPI Scorecards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
        >
          {marketingKPIs.map((kpi, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + idx * 0.05 }}
            >
              <ScoreCard {...kpi} />
            </motion.div>
          ))}
        </motion.div>

        {/* Row 1: Ad Spend and Traffic Sources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
        >
          <ChartCard title="Ad Spend by Platform" icon={BarChart3} subtitle="Monthly distribution">
            <PremiumBarChart
              data={adSpendData}
              series={[{ key: 'spend', name: 'Ad Spend', color: '#3B82F6' }]}
              height={300}
            />
          </ChartCard>

          <ChartCard title="Traffic Sources" icon={Activity} subtitle="Channel breakdown">
            <PremiumDonutChart data={trafficData} height={300} centerLabel="Total" />
          </ChartCard>
        </motion.div>

        {/* Row 2: ROAS Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-10"
        >
          <ChartCard title="ROAS Trend" icon={TrendingUp} subtitle="Performance over time">
            <PremiumLineChart
              data={roasData}
              series={[
                { key: 'roas', name: 'ROAS', color: '#8B5CF6' },
              ]}
              height={300}
              targetLine={{ value: 3.0, label: 'Target' }}
            />
          </ChartCard>
        </motion.div>

        {/* Row 3: Campaign Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mb-10"
        >
          <ChartCard title="Campaign Performance" icon={Activity}>
            <MetricTable />
          </ChartCard>
        </motion.div>

        {/* Floating AI Chat Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(true)}
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg flex items-center justify-center hover:from-indigo-600 hover:to-purple-600 transition-all z-40"
        >
          <MessageCircle size={24} />
        </motion.button>

        {/* AI Chat Panel */}
        <AIChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
    </motion.div>
  );
};

export default MarketingDashboard;
