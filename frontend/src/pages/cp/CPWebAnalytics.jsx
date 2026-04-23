import React, { useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import PropertySwitcher from '../../components/PropertySwitcher';
import PipelineHiddenBanner from '../../components/common/PipelineHiddenBanner';

const CPWebAnalytics = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');
  const { isPipelineVisible } = useDashboardConfig();

  const ga4 = useWebAnalytics('cp', {}, selectedPropertyId);

  if (!isPipelineVisible('ga4')) {
    return <PipelineHiddenBanner pipelineLabel="Google Analytics (GA4)"
      pageTitle="CP Web Analytics"
      pageSubtitle="The Concrete Protector — GA4 traffic, devices, sources" />;
  }

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
      pageInsights={(() => {
        const sc = ga4.scorecards || [];
        const visits = sc[0]?.value || 0;
        const users = sc[1]?.value || 0;
        const bounce = sc[2]?.value || 0;
        if (!ga4.hasLiveData || visits === 0) return [
          'Run the GA4 pipeline to see live CP web analytics.',
          'Use the dropdown to select individual properties for per-site detail.',
        ];
        return [
          `${visits.toLocaleString()} total visits across CP properties.`,
          users > 0 ? `${users.toLocaleString()} returning visitors · ${bounce}% bounce rate.` : null,
          selectedPropertyName !== 'All Properties' ? `Viewing: ${selectedPropertyName}` : `Viewing all ${ga4.websiteBreakdown?.length || 0} CP properties combined.`,
        ].filter(Boolean);
      })()}
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
