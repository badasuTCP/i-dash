import React, { useMemo, useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import { useContractorWebData } from '../../hooks/useContractorWebData';
import PropertySwitcher from '../../components/PropertySwitcher';
import PipelineHiddenBanner from '../../components/common/PipelineHiddenBanner';

const IBOSSWebAnalytics = () => {
  const { isContractorActive, isPipelineVisible } = useDashboardConfig();
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');

  // Aggregate GA4 scorecards / trends — respects global date via hook internals
  const ga4 = useWebAnalytics('ibos', {}, selectedPropertyId);

  if (!isPipelineVisible('ga4')) {
    return <PipelineHiddenBanner pipelineLabel="Google Analytics (GA4)"
      pageTitle="I-BOS Web Analytics"
      pageSubtitle="Contractor web traffic, devices, and sources (GA4)" />;
  }

  // Per-contractor breakdown table + pie chart — respects global date via hook internals
  const { contractorDetails: liveDetails, websiteBreakdown: liveBreakdown } =
    useContractorWebData();

  const handlePropertySelect = (propertyId, displayName) => {
    setSelectedPropertyId(propertyId);
    setSelectedPropertyName(displayName);
  };

  // Use contractor breakdown if available, otherwise fall back to GA4 property breakdown
  const websiteBreakdown = useMemo(() => {
    const filtered = liveBreakdown.filter((item) => isContractorActive(item.contractorId));
    return filtered.length > 0 ? filtered : (ga4.websiteBreakdown || []);
  }, [liveBreakdown, isContractorActive, ga4.websiteBreakdown]);

  const contractorDetails = useMemo(
    () => liveDetails.filter((row) => isContractorActive(row.contractorId)),
    [liveDetails, isContractorActive],
  );

  const subtitle = selectedPropertyId
    ? `Viewing: ${selectedPropertyName} · Property ${selectedPropertyId}`
    : 'All contractor websites combined';

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
      pageInsights={(() => {
        const sc = ga4.scorecards || [];
        const visits = sc[0]?.value || 0;
        const users = sc[1]?.value || 0;
        const bounce = sc[2]?.value || 0;
        if (!ga4.hasLiveData || visits === 0) return [
          'Run the GA4 pipeline to populate live per-contractor web traffic.',
          'Traffic source mix and contractor breakdown will appear once data syncs.',
        ];
        return [
          `${visits.toLocaleString()} total visits across all I-BOS contractor sites.`,
          users > 0 ? `${users.toLocaleString()} unique users · ${bounce}% bounce rate.` : null,
          ga4.trafficSources?.length > 0 ? `Top source: ${ga4.trafficSources[0]?.source_medium || ga4.trafficSources[0]?.name || 'organic'}.` : null,
        ].filter(Boolean);
      })()}
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
