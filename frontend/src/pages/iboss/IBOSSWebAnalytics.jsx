import React, { useMemo, useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import PropertySwitcher from '../../components/PropertySwitcher';

// ── Per-contractor web metrics (visits, visitors, engagement, bounce, source) ──
const ALL_WEBSITE_BREAKDOWN = [
  { name: 'Columbus Concrete Coatings', value: 71800, color: '#8B5CF6', contractorId: 'columbus' },
  { name: 'SLG Concrete Coatings',      value: 10200, color: '#F59E0B', contractorId: 'slg' },
  { name: 'Dec. Concrete Idaho',        value: 9500,  color: '#0EA5E9', contractorId: 'decorative' },
  { name: 'Floor Warriors',             value: 7300,  color: '#F97316', contractorId: 'floorwarriors' },
  { name: 'Tailored Concrete',          value: 5400,  color: '#10B981', contractorId: 'tailored' },
  { name: 'Beckley Concrete Decor',     value: 5300,  color: '#3B82F6', contractorId: 'beckley' },
  { name: 'Reeves Solutions',           value: 1928,  color: '#64748B', contractorId: 'reeves' },
  { name: 'Graber Design',              value: 85,    color: '#7C3AED', contractorId: 'graber' },
  { name: 'Elite Pool Coatings',        value: 21,    color: '#2DD4BF', contractorId: 'elitepool' },
];

// ── Deep per-contractor analytics ──────────────────────────────────────────────
const ALL_CONTRACTOR_WEB_DETAILS = [
  { contractor: 'Columbus Concrete Coatings', visits: 71800, visitors: 53800, newVisitors: 44200, returning: 9600,  avgEngagement: '2:08', bounceRate: '35.4%', topSource: 'google / organic',  paidShare: '28%',  organicShare: '62%', directShare: '10%', contractorId: 'columbus' },
  { contractor: 'SLG Concrete Coatings',      visits: 10200, visitors: 8100,  newVisitors: 6800,  returning: 1300,  avgEngagement: '1:42', bounceRate: '46.1%', topSource: 'google / cpc',      paidShare: '54%',  organicShare: '32%', directShare: '14%', contractorId: 'slg' },
  { contractor: 'Decorative Concrete Idaho',  visits: 9500,  visitors: 7800,  newVisitors: 6500,  returning: 1300,  avgEngagement: '2:23', bounceRate: '33.8%', topSource: 'google / organic',  paidShare: '0%',   organicShare: '78%', directShare: '22%', contractorId: 'decorative' },
  { contractor: 'Floor Warriors',             visits: 7300,  visitors: 6500,  newVisitors: 5800,  returning: 700,   avgEngagement: '1:05', bounceRate: '52.6%', topSource: 'google / organic',  paidShare: '0%',   organicShare: '71%', directShare: '29%', contractorId: 'floorwarriors' },
  { contractor: 'Tailored Concrete Coatings', visits: 5400,  visitors: 4200,  newVisitors: 3400,  returning: 800,   avgEngagement: '1:38', bounceRate: '41.2%', topSource: 'google / cpc',      paidShare: '48%',  organicShare: '35%', directShare: '17%', contractorId: 'tailored' },
  { contractor: 'Beckley Concrete Decor',     visits: 5300,  visitors: 4100,  newVisitors: 3200,  returning: 900,   avgEngagement: '2:15', bounceRate: '36.7%', topSource: 'google / cpc',      paidShare: '52%',  organicShare: '31%', directShare: '17%', contractorId: 'beckley' },
  { contractor: 'Reeves Concrete Solutions',  visits: 1928,  visitors: 1806,  newVisitors: 1620,  returning: 186,   avgEngagement: '1:10', bounceRate: '48.3%', topSource: 'google / organic',  paidShare: '0%',   organicShare: '82%', directShare: '18%', contractorId: 'reeves' },
  { contractor: 'Graber Design Coatings',     visits: 85,    visitors: 54,    newVisitors: 42,    returning: 12,    avgEngagement: '8:33', bounceRate: '18.2%', topSource: 'direct / (none)',   paidShare: '0%',   organicShare: '35%', directShare: '65%', contractorId: 'graber' },
  { contractor: 'Elite Pool Coatings',        visits: 21,    visitors: 17,    newVisitors: 14,    returning: 3,     avgEngagement: '18:02',bounceRate: '9.5%',  topSource: 'direct / (none)',   paidShare: '0%',   organicShare: '24%', directShare: '76%', contractorId: 'elitepool' },
  { contractor: 'Eminence',                   visits: 0,     visitors: 0,     newVisitors: 0,     returning: 0,     avgEngagement: '—',    bounceRate: '—',     topSource: '—',                 paidShare: '—',    organicShare: '—',   directShare: '—',   contractorId: 'eminence' },
  { contractor: 'PermaSurface',               visits: 0,     visitors: 0,     newVisitors: 0,     returning: 0,     avgEngagement: '—',    bounceRate: '—',     topSource: '—',                 paidShare: '—',    organicShare: '—',   directShare: '—',   contractorId: 'permasurface' },
  { contractor: 'Diamond Topcoat',            visits: 0,     visitors: 0,     newVisitors: 0,     returning: 0,     avgEngagement: '—',    bounceRate: '—',     topSource: '—',                 paidShare: '—',    organicShare: '—',   directShare: '—',   contractorId: 'diamond' },
  { contractor: 'TVS Coatings',               visits: 0,     visitors: 0,     newVisitors: 0,     returning: 0,     avgEngagement: '—',    bounceRate: '—',     topSource: '—',                 paidShare: '—',    organicShare: '—',   directShare: '—',   contractorId: 'tvs' },
];

// ── Per-period metrics for seamless scorecard filtering ──────────────────────
const STATIC_METRICS_PER_PERIOD = {
  'Q2 2025': { visits: 22000,  visitors: 17400, newVisitors: 12600, returning: 4800  },
  'Q3 2025': { visits: 38000,  visitors: 30100, newVisitors: 22900, returning: 7200  },
  'Q4 2025': { visits: 58000,  visitors: 45900, newVisitors: 35400, returning: 10500 },
  'Q1 2026': { visits: 109000, visitors: 86300, newVisitors: 71400, returning: 14900 },
};

const STATIC_FALLBACK = {
  scorecards: [
    { label: 'Total Visits',      value: 109000, change: 26.4, color: 'amber',   format: 'number', metricKey: 'visits',      sparkData: [52000, 62000, 72000, 82000, 92000, 100000, 109000] },
    { label: 'Total Visitors',    value: 86300,  change: 20.8, color: 'blue',    format: 'number', metricKey: 'visitors',    sparkData: [42000, 50000, 58000, 66000, 74000, 80000, 86300] },
    { label: 'New Visitors',      value: 71400,  change: 24.1, color: 'emerald', format: 'number', metricKey: 'newVisitors', sparkData: [34000, 41000, 48000, 55000, 62000, 67000, 71400] },
    { label: 'Returning Users',   value: 14900,  change: 8.5,  color: 'violet',  format: 'number', metricKey: 'returning',   sparkData: [9500, 10500, 11500, 12500, 13200, 14000, 14900] },
  ],
  visitorTrend: [
    { month: 'Q2 2025', visits: 22000,  returning: 4800  },
    { month: 'Q3 2025', visits: 38000,  returning: 7200  },
    { month: 'Q4 2025', visits: 58000,  returning: 10500 },
    { month: 'Q1 2026', visits: 109000, returning: 14900 },
  ],
  trafficSources: [
    { source: 'google / organic', users: 36400, sessions: 45800, bounceRate: '38.2%', avgDuration: '2:18' },
    { source: 'google / cpc',     users: 21600, sessions: 28200, bounceRate: '44.1%', avgDuration: '1:52' },
    { source: 'direct / (none)',  users: 15800, sessions: 19400, bounceRate: '32.5%', avgDuration: '3:05' },
    { source: 'facebook / paid',  users: 7200,  sessions: 9100,  bounceRate: '51.3%', avgDuration: '1:28' },
    { source: 'bing / organic',   users: 2800,  sessions: 3400,  bounceRate: '42.8%', avgDuration: '1:45' },
    { source: 'referral / other', users: 2500,  sessions: 3100,  bounceRate: '36.2%', avgDuration: '2:42' },
  ],
  deviceData: [
    { device: 'Mobile',  users: 391 },
    { device: 'Desktop', users: 224 },
    { device: 'Tablet',  users: 36  },
  ],
  metricsPerPeriod: STATIC_METRICS_PER_PERIOD,
};

const IBOSSWebAnalytics = () => {
  const { isContractorActive } = useDashboardConfig();
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');

  const ga4 = useWebAnalytics('ibos', STATIC_FALLBACK, selectedPropertyId);

  const handlePropertySelect = (propertyId, displayName) => {
    setSelectedPropertyId(propertyId);
    setSelectedPropertyName(displayName);
  };

  const websiteBreakdown = useMemo(
    () => ALL_WEBSITE_BREAKDOWN.filter((item) => isContractorActive(item.contractorId)),
    [isContractorActive]
  );

  const contractorDetails = useMemo(
    () => ALL_CONTRACTOR_WEB_DETAILS.filter((row) => isContractorActive(row.contractorId)),
    [isContractorActive]
  );

  const subtitle = selectedPropertyId
    ? `Viewing: ${selectedPropertyName} · Property ${selectedPropertyId}`
    : 'All contractor websites combined — 109K visits · 86.3K visitors · 71.4K new · 14.9K returning';

  return (
    <WebAnalyticsDashboard
      title="I-BOS Web Analytics"
      subtitle={subtitle}
      accentColor="#F59E0B"
      hasLiveData={ga4.hasLiveData}
      loading={ga4.loading}
      apiReachable={ga4.apiReachable}
      propertyId={ga4.propertyId}
      headerExtra={
        <PropertySwitcher
          division="ibos"
          selectedId={selectedPropertyId}
          onSelect={handlePropertySelect}
        />
      }
      pageInsights={[
        'Columbus dominates traffic at 71.8K visits — 66% of total I-BOS web traffic',
        'Organic beats paid on avg engagement time (2:18 vs 1:52) — content quality drives stay',
        'Graber & Elite Pool are early-stage — very low traffic, monitor for growth signals',
      ]}
      scorecards={ga4.scorecards}
      visitorTrend={ga4.visitorTrend}
      websiteBreakdown={websiteBreakdown}
      contractorDetails={contractorDetails}
      deviceData={ga4.deviceData}
      trafficSources={ga4.trafficSources}
      metricsPerPeriod={ga4.metricsPerPeriod}
    />
  );
};

export default IBOSSWebAnalytics;
