import React, { useMemo, useState } from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import { useContractorWebData } from '../../hooks/useContractorWebData';
import PropertySwitcher from '../../components/PropertySwitcher';

const IBOSSWebAnalytics = () => {
  const { isContractorActive } = useDashboardConfig();
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState('All Properties');

  // Aggregate GA4 scorecards / trends — respects global date via hook internals
  const ga4 = useWebAnalytics('ibos', {}, selectedPropertyId);

  // Per-contractor breakdown table + pie chart — respects global date via hook internals
  const { contractorDetails: liveDetails, websiteBreakdown: liveBreakdown } =
    useContractorWebData();

  const handlePropertySelect = (propertyId, displayName) => {
    setSelectedPropertyId(propertyId);
    setSelectedPropertyName(displayName);
  };

  const websiteBreakdown = useMemo(
    () => liveBreakdown.filter((item) => isContractorActive(item.contractorId)),
    [liveBreakdown, isContractorActive],
  );

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
      pageInsights={[
        'Connect the I-BOS GA4 properties to see live per-contractor web traffic',
        'Traffic source mix (organic vs paid) will populate once pipeline syncs',
        'Contractor table and pie chart reflect the selected date range automatically',
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
