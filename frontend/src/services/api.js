import axios from 'axios';

// ── API base URL ────────────────────────────────────────────────────────
// In the unified-service deploy the frontend is served from the same
// origin as the backend, so '/api' is always correct in production.
// Local dev points at the uvicorn server on :8000.
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8000/api'
    : '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const STORAGE_KEY_TOKEN = 'idash_token';
const STORAGE_KEY_REFRESH = 'idash_refresh_token';

// Request: attach token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (token && !token.startsWith('demo-')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response: on 401 clear token and go to login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_REFRESH);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),
  register: (email, password, firstName, lastName) =>
    apiClient.post('/auth/register', {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
    }),
  logout: () => apiClient.post('/auth/logout'),
  refreshToken: (refreshToken) =>
    apiClient.post('/auth/refresh', { refresh_token: refreshToken }),
  me: () => apiClient.get('/auth/me'),
};

// Dashboard endpoints
// Backend FastAPI expects `date_from` and `date_to` query params (YYYY-MM-DD)
const _fmtDate = (d) => {
  if (!d) return undefined;
  if (typeof d === 'string') return d;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

export const dashboardAPI = {
  getExecutiveSummary: (startDate, endDate) =>
    apiClient.get('/dashboard/executive-summary', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getOverview: (startDate, endDate) =>
    apiClient.get('/dashboard/overview', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getBrandSummary: (brand, startDate, endDate) =>
    apiClient.get('/dashboard/brand-summary', {
      params: { brand, date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getDateBounds: () => apiClient.get('/dashboard/date-bounds'),
  getContractorBreakdown: (startDate, endDate) =>
    apiClient.get('/dashboard/contractor-breakdown', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getMetaPeriodReach: (accountId, startDate, endDate) =>
    apiClient.get('/dashboard/meta-period-reach', {
      params: {
        account_id: accountId,
        date_from: _fmtDate(startDate),
        date_to: _fmtDate(endDate),
      },
    }),
  runMetaPipeline: (startDate, endDate) =>
    apiClient.post('/pipelines/meta_ads/run', null, {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getAllContractorsRevenue: (startDate, endDate, topN = 10) =>
    apiClient.get('/dashboard/all-contractors-revenue', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate), top_n: topN },
    }),
  getScorecards: (startDate, endDate) =>
    apiClient.get('/dashboard/scorecards', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getRevenue: (startDate, endDate, granularity = 'daily') =>
    apiClient.get('/dashboard/revenue', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate), granularity },
    }),
  getAdsPerformance: (startDate, endDate) =>
    apiClient.get('/dashboard/ads-performance', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getHubspot: (startDate, endDate) =>
    apiClient.get('/dashboard/hubspot', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getSalesIntelligence: (startDate, endDate) =>
    apiClient.get('/dashboard/hubspot/sales-intelligence', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getWCStore: (startDate, endDate) =>
    apiClient.get('/dashboard/woocommerce/store', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getContractorRevenue: (startDate, endDate) =>
    apiClient.get('/dashboard/contractor-revenue', {
      params: { date_from: _fmtDate(startDate), date_to: _fmtDate(endDate) },
    }),
  getCustomMetric: (metric, startDate, endDate, granularity = 'daily') =>
    apiClient.get('/dashboard/custom', {
      params: { metric, date_from: _fmtDate(startDate), date_to: _fmtDate(endDate), granularity },
    }),
  getWebAnalytics: (division, startDate, endDate, granularity = 'auto', propertyId = null) =>
    apiClient.get('/dashboard/analytics/web', {
      params: {
        division,
        date_from: _fmtDate(startDate),
        date_to: _fmtDate(endDate),
        granularity,
        ...(propertyId ? { property_id: propertyId } : {}),
      },
    }),
  getMarketing: (division, startDate, endDate) =>
    apiClient.get('/dashboard/marketing', {
      params: {
        division,
        date_from: _fmtDate(startDate),
        date_to: _fmtDate(endDate),
      },
    }),
  getRetail: (division, startDate, endDate) =>
    apiClient.get('/dashboard/retail', {
      params: {
        division,
        date_from: _fmtDate(startDate),
        date_to: _fmtDate(endDate),
      },
    }),
  getGA4Properties: (division, includeDisabled = false) =>
    apiClient.get('/dashboard/analytics/ga4-properties', {
      params: { division, include_disabled: includeDisabled },
    }),
  triggerGA4Discovery: () =>
    apiClient.post('/dashboard/analytics/ga4-discover'),
  toggleGA4Property: (propertyId, enabled) =>
    apiClient.put(`/dashboard/analytics/ga4-properties/${propertyId}/toggle`, null, {
      params: { enabled },
    }),
};

// Pipeline endpoints — matches /api/pipelines backend router
export const pipelinesAPI = {
  getAll:    ()           => apiClient.get('/pipelines'),
  run:       (name, opts = {}) => {
    const params = {};
    if (opts.date_from) params.date_from = opts.date_from;
    if (opts.date_to)   params.date_to   = opts.date_to;
    return apiClient.post(`/pipelines/${name}/run`, null, { params, timeout: 120000 });
  },
  runAll:    ()           => apiClient.post('/pipelines/run-all', null, { timeout: 120000 }),
  getStatus: (name)       => apiClient.get(`/pipelines/${name}/status`),
  getHistory:(name, limit=20) => apiClient.get(`/pipelines/${name}/history`, { params: { limit } }),
};

// AI endpoints — backend uses query params, not body
export const aiAPI = {
  chat: (question) =>
    apiClient.post(`/ai/chat?question=${encodeURIComponent(question)}`),
  getInsights: (days = 7) =>
    apiClient.get('/ai/insights', { params: { days } }),
  generateReport: (dateFrom, dateTo, reportType = 'summary') =>
    apiClient.post('/ai/report', null, {
      params: { date_from: _fmtDate(dateFrom), date_to: _fmtDate(dateTo), report_type: reportType },
    }),
};

// Contractor endpoints — server-persisted visibility + auto-discovery
export const contractorsAPI = {
  getAll: () => apiClient.get('/contractors'),
  updateVisibility: (id, active) =>
    apiClient.put(`/contractors/${id}/visibility`, { active }),
  bulkVisibility: (active) =>
    apiClient.put('/contractors/bulk-visibility', { active }),
  getPending: () => apiClient.get('/contractors/pending'),
  getPendingCount: () => apiClient.get('/contractors/pending/count'),
  approve: (id, data = { active: true }) =>
    apiClient.put(`/contractors/${id}/approve`, data),
  mapToBrand: (data) => apiClient.post('/contractors/map-to-brand', data),
  getDiscoveryCount: () => apiClient.get('/contractors/discovery-count'),
  getBrandAssets: (brand) => apiClient.get('/contractors/brand-assets', { params: { brand } }),
};

// Users endpoints
export const usersAPI = {
  getProfile: () => apiClient.get('/users/me'),
  updateProfile: (data) => apiClient.put('/users/me', data),
  changePassword: (oldPassword, newPassword) =>
    apiClient.post('/users/change-password', { old_password: oldPassword, new_password: newPassword }),
  getAll: () => apiClient.get('/users'),
  getById: (id) => apiClient.get(`/users/${id}`),
  create: (data) => apiClient.post('/auth/register', data),
  update: (id, data) => apiClient.put(`/users/${id}`, data),
  delete: (id) => apiClient.delete(`/users/${id}`),
};

// Integrations endpoints
export const integrationsAPI = {
  getAll: () => apiClient.get('/integrations'),
  getStatus: (provider) => apiClient.get(`/integrations/${provider}/status`),
  connect: (provider, credentials) =>
    apiClient.post(`/integrations/${provider}/connect`, credentials),
  disconnect: (provider) => apiClient.post(`/integrations/${provider}/disconnect`),
  sync: (provider) => apiClient.post(`/integrations/${provider}/sync`),
};

// Data sources endpoints
export const dataSourcesAPI = {
  getAll: () => apiClient.get('/data-sources'),
  getById: (id) => apiClient.get(`/data-sources/${id}`),
  create: (data) => apiClient.post('/data-sources', data),
  update: (id, data) => apiClient.put(`/data-sources/${id}`, data),
  delete: (id) => apiClient.delete(`/data-sources/${id}`),
  test: (id) => apiClient.post(`/data-sources/${id}/test`),
};

// Reports endpoints
export const reportsAPI = {
  getAll: () => apiClient.get('/reports'),
  getById: (id) => apiClient.get(`/reports/${id}`),
  create: (data) => apiClient.post('/reports', data),
  update: (id, data) => apiClient.put(`/reports/${id}`, data),
  delete: (id) => apiClient.delete(`/reports/${id}`),
  export: (id, format = 'pdf') => apiClient.get(`/reports/${id}/export`, { params: { format } }),
  schedule: (id, schedule) => apiClient.post(`/reports/${id}/schedule`, schedule),
};

export default apiClient;
