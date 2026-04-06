import React, { createContext, useContext, useState, useCallback } from 'react';

// Full I-BOS contractor list — source of truth for the whole app
export const ALL_CONTRACTORS = [
  { id: 'beckley',     name: 'Beckley Concrete Decor',      division: 'i-bos', active: true },
  { id: 'tailored',   name: 'Tailored Concrete Coatings',   division: 'i-bos', active: true },
  { id: 'slg',        name: 'SLG Concrete Coatings',        division: 'i-bos', active: true },
  { id: 'columbus',   name: 'Columbus Concrete Coatings',   division: 'i-bos', active: true },
  { id: 'tvs',        name: 'TVS Coatings',                 division: 'i-bos', active: true },
  { id: 'eminence',   name: 'Eminence',                     division: 'i-bos', active: true },
  { id: 'permasurface',name:'PermaSurface',                  division: 'i-bos', active: true },
  { id: 'diamond',    name: 'Diamond Topcoat',               division: 'i-bos', active: true },
  { id: 'floor-warriors', name: 'Floor Warriors',           division: 'i-bos', active: true },
  { id: 'graber',     name: 'Graber Design',                 division: 'i-bos', active: true },
  { id: 'dec-idaho',  name: 'Decorative Concrete Idaho',    division: 'i-bos', active: true },
  { id: 'reeves',     name: 'Reeves Solutions',              division: 'i-bos', active: true },
  { id: 'elite-pool', name: 'Elite Pool Coatings',           division: 'i-bos', active: true },
];

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
  // Contractor visibility (keyed by contractor ID)
  contractors: Object.fromEntries(ALL_CONTRACTORS.map((c) => [c.id, true])),
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

  const updateContractor = useCallback((id, active) => {
    setConfig((prev) => ({
      ...prev,
      contractors: { ...prev.contractors, [id]: active },
    }));
  }, []);

  const setAllContractors = useCallback((active) => {
    setConfig((prev) => ({
      ...prev,
      contractors: Object.fromEntries(ALL_CONTRACTORS.map((c) => [c.id, active])),
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  // Helpers
  const isContractorActive = useCallback((id) => {
    return config.contractors?.[id] !== false;
  }, [config.contractors]);

  const getActiveContractors = useCallback(() => {
    return ALL_CONTRACTORS.filter((c) => config.contractors?.[c.id] !== false);
  }, [config.contractors]);

  return (
    <DashboardConfigContext.Provider value={{
      config,
      updatePipeline,
      updateSection,
      updateDivision,
      updateContractor,
      setAllContractors,
      resetToDefaults,
      isPipelineVisible:   (key) => config.pipelines[key]   !== false,
      isSectionVisible:    (key) => config.sections[key]    !== false,
      isDivisionVisible:   (key) => config.divisions[key]   !== false,
      isContractorActive,
      getActiveContractors,
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
