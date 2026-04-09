import React, { useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import PropertySwitcher from '../../components/PropertySwitcher';

const CPWebAnalytics = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');

  const ga4 = useWebAnalytics('cp', {}, selectedPropertyId);

  const handlePropertySelect = (propertyId, displayName) => {
    setSelectedPropertyId(propertyId);
    setSelectedPropertyName(displayName);
  };

  const subtitle = selectedPropertyId
    ? `Viewing: ${selectedPropertyName} · Property ${selectedPropertyId}`
    : 'The Concrete Protector — all CP properties combined';

  return (
    <WebAnalyticsDashboard
      title="CP Web Analytics"
      subtitle={subtitle}
      accentColor="#3B82F6"
      hasLiveData={ga4.hasLiveData}
      loading={ga4.loading}
      apiReachable={ga4.apiReachable}
      propertyId={ga4.propertyId}
      headerExtra={
        <PropertySwitcher
          division="cp"
          selectedId={selectedPropertyId}
          onSelect={handlePropertySelect}
        />
      }
      pageInsights={[
        'Select individual CP properties from the dropdown to see per-site analytics',
        'Traffic source mix and device breakdown update automatically with the date range',
        'Connect GA4 properties to see live session, bounce rate, and engagement data',
      ]}
      scorecards={ga4.scorecards}
      visitorTrend={ga4.visitorTrend}
      websiteBreakdown={ga4.websiteBreakdown || []}
      deviceData={ga4.deviceData}
      trafficSources={ga4.trafficSources}
      metricsPerPeriod={ga4.metricsPerPeriod}
    />
  );
};

export default CPWebAnalytics;
