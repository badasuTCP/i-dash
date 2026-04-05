import React, { createContext, useContext, useState, useCallback } from 'react';

const defaultConfig = {
  // Pipeline sections visibility
  pipelines: {
    hubspot: true,
    metaAds: true,
    googleAds: true,
    ga4: true,
    googleSheets: true,
  },
  // Dashboard sections visibility
  sections: {
    scorecards: true,
    revenueTrend: true,
    salesByCategory: true,
    topProducts: true,
    quarterlyPerformance: true,
    marketingFunnel: true,
    spendVsRevenue: true,
    ctrAnalysis: true,
    visitorTrend: true,
    websiteBreakdown: true,
    deviceBreakdown: true,
    trafficSources: true,
    contractorRankings: true,
    contractorRadar: true,
    retailChannels: true,
    regionAnalysis: true,
    aiInsights: true,
  },
  // Division visibility
  divisions: {
    executive: true,
    cp: true,
    sanitred: true,
    ibos: true,
  },
};

const DashboardConfigContext = createContext();

export const DashboardConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    try {
      const saved = window.__dashConfig;
      return saved || defaultConfig;
    } catch {
      return defaultConfig;
    }
  });

  const updatePipeline = useCallback((key, enabled) => {
    setConfig((prev) => ({
      ...prev,
      pipelines: { ...prev.pipelines, [key]: enabled },
    }));
  }, []);

  const updateSection = useCallback((key, enabled) => {
    setConfig((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: enabled },
    }));
  }, []);

  const updateDivision = useCallback((key, enabled) => {
    setConfig((prev) => ({
      ...prev,
      divisions: { ...prev.divisions, [key]: enabled },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  return (
    <DashboardConfigContext.Provider value={{
      config,
      updatePipeline,
      updateSection,
      updateDivision,
      resetToDefaults,
      isPipelineVisible: (key) => config.pipelines[key] !== false,
      isSectionVisible: (key) => config.sections[key] !== false,
      isDivisionVisible: (key) => config.divisions[key] !== false,
    }}>
      {children}
    </DashboardConfigContext.Provider>
  );
};

export const useDashboardConfig = () => {
  const ctx = useContext(DashboardConfigContext);
  if (!ctx) throw new Error('useDashboardConfig must be used within DashboardConfigProvider');
  return ctx;
};
