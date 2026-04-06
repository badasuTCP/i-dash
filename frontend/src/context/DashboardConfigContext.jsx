import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { contractorsAPI } from '../services/api';

// Full I-BOS contractor list — used as fallback when backend is unavailable
export const ALL_CONTRACTORS = [
  { id: 'beckley',      name: 'Beckley Concrete Decor',      division: 'i-bos', active: true },
  { id: 'tailored',     name: 'Tailored Concrete Coatings',  division: 'i-bos', active: true },
  { id: 'slg',          name: 'SLG Concrete Coatings',       division: 'i-bos', active: true },
  { id: 'columbus',     name: 'Columbus Concrete Coatings',  division: 'i-bos', active: true },
  { id: 'tvs',          name: 'TVS Coatings',                division: 'i-bos', active: false },
  { id: 'eminence',     name: 'Eminence',                    division: 'i-bos', active: false },
  { id: 'permasurface', name: 'PermaSurface',                division: 'i-bos', active: false },
  { id: 'diamond',      name: 'Diamond Topcoat',             division: 'i-bos', active: false },
  { id: 'floorwarriors',name: 'Floor Warriors',              division: 'i-bos', active: true },
  { id: 'graber',       name: 'Graber Design Coatings',      division: 'i-bos', active: true },
  { id: 'decorative',   name: 'Decorative Concrete Idaho',   division: 'i-bos', active: false },
  { id: 'reeves',       name: 'Reeves Concrete Solutions',   division: 'i-bos', active: true },
  { id: 'elitepool',    name: 'Elite Pool Coatings',         division: 'i-bos', active: true },
];

const defaultConfig = {
  pipelines: {
    hubspot: true,
    metaAds: true,
    googleAds: true,
    ga4: true,
    googleSheets: true,
  },
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
  divisions: {
    executive: true,
    cp: true,
    sanitred: true,
    ibos: true,
  },
  // Contractor visibility — keyed by contractor ID
  contractors: Object.fromEntries(ALL_CONTRACTORS.map((c) => [c.id, c.active !== false])),
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

  // Track whether we've loaded from backend at least once
  const hasFetched = useRef(false);

  // ── Fetch contractor visibility from backend on mount ───────────────
  useEffect(() => {
    let cancelled = false;
    const fetchContractors = async () => {
      try {
        const { data } = await contractorsAPI.getAll();
        if (cancelled || !Array.isArray(data)) return;

        // Build contractor visibility map from server state
        const serverMap = {};
        data.forEach((c) => { serverMap[c.id] = c.active; });

        setConfig((prev) => ({
          ...prev,
          contractors: { ...prev.contractors, ...serverMap },
        }));
        hasFetched.current = true;
      } catch {
        // Backend unreachable (demo mode, etc.) — keep defaults
      }
    };
    fetchContractors();
    return () => { cancelled = true; };
  }, []);

  // ── Pipeline / Section / Division toggles (local-only) ─────────────
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

  // ── Contractor toggles — write-through to backend ──────────────────
  const updateContractor = useCallback(async (id, active) => {
    // Optimistic update
    setConfig((prev) => ({
      ...prev,
      contractors: { ...prev.contractors, [id]: active },
    }));

    // Persist to backend (fire-and-forget with silent rollback on error)
    try {
      await contractorsAPI.updateVisibility(id, active);
    } catch (err) {
      console.warn(`Failed to persist contractor ${id} visibility:`, err);
      // Don't rollback — local state still reflects user intent,
      // backend will be seeded with correct state on next successful call
    }
  }, []);

  const setAllContractors = useCallback(async (active) => {
    // Optimistic update
    setConfig((prev) => ({
      ...prev,
      contractors: Object.fromEntries(ALL_CONTRACTORS.map((c) => [c.id, active])),
    }));

    // Persist to backend
    try {
      await contractorsAPI.bulkVisibility(active);
    } catch (err) {
      console.warn('Failed to persist bulk contractor visibility:', err);
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────
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
