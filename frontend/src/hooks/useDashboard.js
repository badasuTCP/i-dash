import { useState, useCallback, useEffect } from 'react';
import { subDays, format, eachDayOfInterval } from 'date-fns';

// ── Demo data generators ────────────────────────────────────────
function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateSparkline(length = 7, min = 40, max = 100) {
  return Array.from({ length }, () => Math.round(randomBetween(min, max)));
}

function generateTimeSeries(startDate, endDate, fields) {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  return days.map((day) => {
    const entry = { date: format(day, 'MMM dd') };
    fields.forEach(({ key, min, max }) => {
      entry[key] = randomBetween(min, max);
    });
    return entry;
  });
}

function buildDemoScorecards() {
  return [
    { label: 'Total Revenue', value: 124580, change: 12.5, changeDirection: 'up', format: 'currency', color: 'blue', icon: 'DollarSign', sparkData: generateSparkline(7, 80000, 140000) },
    { label: 'Ad Spend', value: 34250, change: -3.2, changeDirection: 'down', format: 'currency', color: 'violet', icon: 'TrendingUp', sparkData: generateSparkline(7, 28000, 40000) },
    { label: 'Total Leads', value: 1847, change: 18.7, changeDirection: 'up', format: 'number', color: 'emerald', icon: 'Users', sparkData: generateSparkline(7, 1200, 2100) },
    { label: 'Deals Won', value: 89, change: 5.3, changeDirection: 'up', format: 'number', color: 'amber', icon: 'Trophy', sparkData: generateSparkline(7, 60, 100) },
    { label: 'Blended ROAS', value: 3.64, change: 8.1, changeDirection: 'up', format: 'decimal', color: 'cyan', icon: 'BarChart3', sparkData: generateSparkline(7, 2.5, 4.5) },
    { label: 'Cost Per Lead', value: 18.54, change: -6.9, changeDirection: 'down', format: 'currency', color: 'rose', icon: 'Target', sparkData: generateSparkline(7, 14, 24) },
    { label: 'Conversion Rate', value: 4.82, change: 1.3, changeDirection: 'up', format: 'percent', color: 'lime', icon: 'Percent', sparkData: generateSparkline(7, 3, 6) },
    { label: 'Pipeline Value', value: 487500, change: 22.4, changeDirection: 'up', format: 'currency', color: 'indigo', icon: 'Layers', sparkData: generateSparkline(7, 350000, 550000) },
  ];
}

function buildDemoRevenue(start, end) {
  return generateTimeSeries(start, end, [
    { key: 'revenue', min: 3000, max: 6500 },
    { key: 'adSpend', min: 800, max: 1800 },
    { key: 'profit', min: 1500, max: 4500 },
  ]);
}

function buildDemoAds(start, end) {
  return {
    timeSeries: generateTimeSeries(start, end, [
      { key: 'metaSpend', min: 400, max: 1000 },
      { key: 'googleSpend', min: 300, max: 900 },
      { key: 'metaConversions', min: 10, max: 45 },
      { key: 'googleConversions', min: 8, max: 38 },
    ]),
    platforms: [
      { name: 'Meta Ads', value: 18750, color: '#3B82F6' },
      { name: 'Google Ads', value: 15500, color: '#8B5CF6' },
    ],
    topCampaigns: [
      { name: 'Brand Awareness - Q1', platform: 'Meta', spend: 4520, conversions: 234, roas: 4.2, cpc: 1.85 },
      { name: 'Search - Concrete Coating', platform: 'Google', spend: 3890, conversions: 198, roas: 3.9, cpc: 2.12 },
      { name: 'Retargeting - Website Visitors', platform: 'Meta', spend: 2750, conversions: 167, roas: 5.1, cpc: 1.45 },
      { name: 'Display - Home Improvement', platform: 'Google', spend: 3200, conversions: 145, roas: 3.2, cpc: 2.45 },
      { name: 'Video - Product Demo', platform: 'Meta', spend: 2100, conversions: 112, roas: 4.8, cpc: 1.92 },
      { name: 'Search - Garage Floor', platform: 'Google', spend: 2890, conversions: 156, roas: 3.7, cpc: 1.98 },
      { name: 'Lookalike - Top Customers', platform: 'Meta', spend: 1980, conversions: 98, roas: 4.5, cpc: 1.67 },
      { name: 'Shopping - Materials', platform: 'Google', spend: 2340, conversions: 132, roas: 3.4, cpc: 2.25 },
    ],
  };
}

function buildDemoHubspot(start, end) {
  return {
    timeSeries: generateTimeSeries(start, end, [
      { key: 'contacts', min: 15, max: 65 },
      { key: 'deals', min: 5, max: 20 },
      { key: 'meetings', min: 2, max: 12 },
    ]),
    pipeline: [
      { stage: 'Appointment Scheduled', count: 45, value: 125000 },
      { stage: 'Qualified to Buy', count: 32, value: 98000 },
      { stage: 'Presentation Scheduled', count: 24, value: 78000 },
      { stage: 'Decision Maker Bought-In', count: 18, value: 65000 },
      { stage: 'Contract Sent', count: 12, value: 52000 },
      { stage: 'Closed Won', count: 8, value: 42000 },
    ],
  };
}

function buildDemoOverview() {
  return {
    summary: "Revenue is up 12.5% this month driven by strong Meta Ad performance and increased deal closings. Your blended ROAS of 3.64x is above the 3.0x target. Cost per lead dropped to $18.54, a 6.9% improvement. Consider scaling the top-performing retargeting campaign which has a 5.1x ROAS.",
  };
}

// ── Hook ────────────────────────────────────────────────────────
export const useDashboard = (initialDays = 30) => {
  const [endDate, setEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(subDays(new Date(), initialDays));
  const [granularity, setGranularity] = useState('daily');

  const [overview, setOverview] = useState(null);
  const [scorecards, setScorecards] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [ads, setAds] = useState(null);
  const [hubspot, setHubspot] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 600));

      setOverview(buildDemoOverview());
      setScorecards(buildDemoScorecards());
      setRevenue(buildDemoRevenue(startDate, endDate));
      setAds(buildDemoAds(startDate, endDate));
      setHubspot(buildDemoHubspot(startDate, endDate));
    } catch (err) {
      setError('Failed to fetch dashboard data');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, granularity]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const setDateRange = useCallback((start, end) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const setCustomDays = useCallback((days) => {
    const newEnd = new Date();
    const newStart = subDays(newEnd, days);
    setStartDate(newStart);
    setEndDate(newEnd);
  }, []);

  return {
    overview, scorecards, revenue, ads, hubspot,
    loading, error,
    startDate, endDate, setDateRange, setCustomDays,
    formattedStartDate: format(startDate, 'yyyy-MM-dd'),
    formattedEndDate: format(endDate, 'yyyy-MM-dd'),
    granularity, setGranularity,
    refetch: fetchDashboardData,
  };
};

export default useDashboard;
