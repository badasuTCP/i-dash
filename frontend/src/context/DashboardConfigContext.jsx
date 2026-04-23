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
    woocommerce: true,
    shopify: true,
    snapshot: true,
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

// localStorage key for pipeline visibility (survives page reload so the
// data analyst's "hide this pipeline" choice sticks across sessions).
const PIPELINE_VIS_KEY = 'idash_pipeline_visibility';

function loadPipelineVisibility() {
  try {
    const raw = localStorage.getItem(PIPELINE_VIS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // corrupted / no localStorage — ignore
  }
  return null;
}

function savePipelineVisibility(pipelines) {
  try {
    localStorage.setItem(PIPELINE_VIS_KEY, JSON.stringify(pipelines));
  } catch {
    // quota exceeded or no localStorage — best-effort only
  }
}

export const DashboardConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    try {
      const saved = window.__dashConfig;
      const persistedPipelines = loadPipelineVisibility();
      const merged = saved || defaultConfig;
      return persistedPipelines
        ? { ...merged, pipelines: { ...merged.pipelines, ...persistedPipelines } }
        : merged;
    } catch {
      return defaultConfig;
    }
  });

  // Track whether we've loaded from backend at least once
  const hasFetched = useRef(false);

  // Full contractor list from server (includes GA4-discovered)
  const [serverContractors, setServerContractors] = useState(ALL_CONTRACTORS);

  // Cross-tab / other-window sync: if the user toggles a pipeline on
  // Pipeline Control in one tab, the dashboards in other tabs should
  // update without a manual refresh. The browser emits the "storage"
  // event on every tab EXCEPT the one that wrote — so this is strictly
  // cross-tab. Within the same tab, React context already propagates.
  useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key !== PIPELINE_VIS_KEY) return;
      try {
        const next = ev.newValue ? JSON.parse(ev.newValue) : {};
        setConfig((prev) => ({
          ...prev,
          pipelines: { ...prev.pipelines, ...next },
        }));
      } catch {
        /* ignore bad payloads */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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

        // Use backend data as the source of truth (includes sources,
        // meta_account_id, meta_account_status from the enrichment).
        // Fall back to ALL_CONTRACTORS seed only for contractors the
        // backend doesn't know about (shouldn't happen in practice).
        const backendIds = new Set(data.map((c) => c.id));
        const merged = [
          ...data.map((c) => ({
            id: c.id,
            name: c.name,
            division: c.division || 'i-bos',
            active: c.active,
            status: c.status,
            sources: c.sources || [],
            meta_account_id: c.meta_account_id || null,
            meta_account_status: c.meta_account_status || null,
          })),
          ...ALL_CONTRACTORS.filter((c) => !backendIds.has(c.id)),
        ];
        setServerContractors(merged);

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

  // ── Pipeline / Section / Division toggles ──────────────────────────
  // Pipeline visibility is persisted to localStorage so the "hide from
  // dashboards" choice survives a browser refresh. Every dashboard page
  // that renders pipeline-specific data reads this via isPipelineVisible.
  const updatePipeline = useCallback((key, enabled) => {
    setConfig((prev) => {
      const nextPipelines = { ...prev.pipelines, [key]: enabled };
      savePipelineVisibility(nextPipelines);
      return { ...prev, pipelines: nextPipelines };
    });
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
    return serverContractors.filter((c) => config.contractors?.[c.id] !== false);
  }, [config.contractors, serverContractors]);

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
      allContractors: serverContractors,
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
