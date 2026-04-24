import React from 'react';
import WebAnalyticsDashboard from '../templates/WebAnalyticsDashboard';
import { useWebAnalytics } from '../../hooks/useWebAnalytics';
import { useDashboardConfig } from '../../context/DashboardConfigContext';
import PipelineHiddenBanner from '../../components/common/PipelineHiddenBanner';

// Intentionally no STATIC_FALLBACK. The previous version shipped a
// hardcoded 38,500 visits / 5,800 returning / 48.5% bounce /
// "+16.2% change" snapshot dated Jul 2024 → Mar 2025. That leaked
// into the UI whenever the GA4 pipeline hadn't populated data for the
// selected window, making a single-day "today" view quote lifetime
// fake numbers as if they were live. Honest empty state instead.
const EMPTY_FALLBACK = {
  scorecards: [],
  visitorTrend: [],
  trafficSources: [],
  deviceData: [],
  metricsPerPeriod: {},
};

const SaniTredWebAnalytics = () => {
  const { isPipelineVisible } = useDashboardConfig();
  const ga4 = useWebAnalytics('sanitred', EMPTY_FALLBACK);

  if (!isPipelineVisible('ga4')) {
    return <PipelineHiddenBanner pipelineLabel="Google Analytics (GA4)"
      pageTitle="Sani-Tred Web Analytics"
      pageSubtitle="Sani-Tred Retail — GA4 traffic, devices, sources" />;
  }

  return (
    <WebAnalyticsDashboard
      title="Sani-Tred Web Analytics"
      dataWarning={ga4.hasLiveData ? null : 'No GA4 data for this period. Run the GA4 pipeline or widen the date range to see live Sani-Tred web analytics.'}
      subtitle="Sani-Tred Retail — Website traffic and eCommerce engagement"
      accentColor="#10B981"
      hasLiveData={ga4.hasLiveData}
      loading={ga4.loading}
      apiReachable={ga4.apiReachable}
      propertyId={ga4.propertyId}
      pageInsights={(() => {
        const sc = ga4.scorecards || [];
        const visits = sc[0]?.value || 0;
        const bounce = sc[2]?.value || 0;
        if (!ga4.hasLiveData || visits === 0) return [
          'No Sani-Tred GA4 data for the selected range.',
          'Run the GA4 pipeline or widen the date picker to populate.',
        ];
        return [
          `${visits.toLocaleString()} total visits to Sani-Tred properties · ${bounce}% bounce rate.`,
          ga4.trafficSources?.length > 0 ? `Top traffic source: ${ga4.trafficSources[0]?.source_medium || 'organic search'}.` : null,
          ga4.deviceData?.length > 0 ? `Top device: ${ga4.deviceData[0]?.name || ga4.deviceData[0]?.device || 'desktop'}.` : null,
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

export default SaniTredWebAnalytics;
