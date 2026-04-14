import React, { useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import PropertySwitcher from '../../components/PropertySwitcher';

// ── Static fallback (shown before GA4 pipeline populates data) ─────────────
const STATIC_FALLBACK = {
  scorecards: [
    { label: 'Total Visits',       value: 0, change: 0, color: 'emerald', format: 'number',  metricKey: 'visits' },
    { label: 'Returning Visitors', value: 0, change: 0, color: 'violet',  format: 'number',  metricKey: 'returning' },
    { label: 'Bounce Rate',        value: 0, change: 0, color: 'blue',    format: 'percent' },
    { label: 'Avg Session',        value: 0, change: 0, color: 'amber',   format: 'decimal' },
  ],
  visitorTrend: [],
  trafficSources: [],
  deviceData: [],
  metricsPerPeriod: {},
};

const DCKNWebAnalytics = () => {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');

  const ga4 = useWebAnalytics('dckn', STATIC_FALLBACK, dateFrom, dateTo, selectedPropertyId);

  const handleDateChange = (start, end) => {
    setDateFrom(start);
    setDateTo(end);
  };

  const handlePropertySelect = (propertyId, displayName) => {
    setSelectedPropertyId(propertyId);
    setSelectedPropertyName(displayName);
  };

  const subtitle = selectedPropertyId
    ? `Viewing: ${selectedPropertyName} · Property ${selectedPropertyId}`
    : 'DCKN Lead Gen Network — 48 contractor properties across the lead generation network';

  return (
    <WebAnalyticsDashboard
      title="DCKN Lead Gen — Web Analytics"
      subtitle={subtitle}
      accentColor="#8B5CF6"
      hasLiveData={ga4.hasLiveData}
      loading={ga4.loading}
      apiReachable={ga4.apiReachable}
      propertyId={ga4.propertyId}
      onDateChange={handleDateChange}
      headerExtra={
        <PropertySwitcher
          division="dckn"
          selectedId={selectedPropertyId}
          onSelect={handlePropertySelect}
        />
      }
      pageInsights={(() => {
        const sc = ga4.scorecards || [];
        const visits = sc[0]?.value || 0;
        if (!ga4.hasLiveData || visits === 0) return [
          'Run the GA4 pipeline to see live DCKN lead generator web traffic.',
          'Use the Property Switcher above to view individual contractor sites.',
        ];
        return [
          `${visits.toLocaleString()} total visits across DCKN lead generator properties.`,
          ga4.trafficSources?.length > 0 ? `Top traffic source: ${ga4.trafficSources[0]?.source_medium || ga4.trafficSources[0]?.name || 'direct'}.` : null,
        ].filter(Boolean);
      })()}
      scorecards={ga4.scorecards}
      visitorTrend={ga4.visitorTrend}
      deviceData={ga4.deviceData}
      trafficSources={ga4.trafficSources}
      metricsPerPeriod={ga4.metricsPerPeriod}
    />
  );
};

export default DCKNWebAnalytics;
