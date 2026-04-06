import axios from 'axios';

// Auto-detect production backend URL when running on Railway
const resolveApiUrl = () => {
  // 1. Explicit env var always wins
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== 'http://localhost:8000/api') {
    return import.meta.env.VITE_API_URL;
  }
  // 2. If running on Railway (*.up.railway.app), use the production backend
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.up.railway.app')) {
    return 'https://i-dash-production.up.railway.app/api';
  }
  // 3. Fallback for local dev
  return 'http://localhost:8000/api';
};

const API_BASE_URL = resolveApiUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Storage keys — must match AuthContext
const STORAGE_KEY_TOKEN = 'idash_token';
const STORAGE_KEY_REFRESH = 'idash_refresh_token';

// Request interceptor - add auth token
// Demo tokens (demo-token-*) are local-only and must never be sent to the backend
// — the backend's JWT lib will reject them and crash the exception handler
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (token && !token.startsWith('demo-')) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 and refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(STORAGE_KEY_REFRESH);
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token } = response.data;
          localStorage.setItem(STORAGE_KEY_TOKEN, access_token);
          apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`;

          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Redirect to login
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_REFRESH);
        window.location.href = '/login';
        return Promise.reject(refreshError);
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
  me: () => apiClient.get('/users/me'),
};

// Dashboard endpoints
export const dashboardAPI = {
  getOverview: (startDate, endDate) =>
    apiClient.get('/dashboard/overview', {
      params: { start_date: startDate, end_date: endDate },
    }),
  getScorecards: (startDate, endDate) =>
    apiClient.get('/dashboard/scorecards', {
      params: { start_date: startDate, end_date: endDate },
    }),
  getRevenue: (startDate, endDate, granularity = 'daily') =>
    apiClient.get('/dashboard/revenue', {
      params: { start_date: startDate, end_date: endDate, granularity },
    }),
  getAds: (startDate, endDate, platform = null) =>
    apiClient.get('/dashboard/ads', {
      params: { start_date: startDate, end_date: endDate, platform },
    }),
  getHubspot: (startDate, endDate) =>
    apiClient.get('/dashboard/hubspot', {
      params: { start_date: startDate, end_date: endDate },
    }),
  getMarketing: (startDate, endDate) =>
    apiClient.get('/dashboard/marketing', {
      params: { start_date: startDate, end_date: endDate },
    }),
  getSales: (startDate, endDate) =>
    apiClient.get('/dashboard/sales', {
      params: { start_date: startDate, end_date: endDate },
    }),
  getExecutive: (startDate, endDate) =>
    apiClient.get('/dashboard/executive', {
      params: { start_date: startDate, end_date: endDate },
    }),
};

// Pipeline endpoints — matches /api/pipelines backend router
export const pipelinesAPI = {
  getAll:    ()           => apiClient.get('/pipelines'),
  run:       (name)       => apiClient.post(`/pipelines/${name}/run`),
  runAll:    ()           => apiClient.post('/pipelines/run-all'),
  getHistory:(name, limit=20) => apiClient.get(`/pipelines/${name}/history`, { params: { limit } }),
};

// AI endpoints
export const aiAPI = {
  generateInsight: (data) => apiClient.post('/ai/insights', data),
  analyzeData: (data) => apiClient.post('/ai/analyze', data),
  predictTrends: (data) => apiClient.post('/ai/predict', data),
  chat: (message, context = null) =>
    apiClient.post('/ai/chat', { message, context }),
};

// Users endpoints
export const usersAPI = {
  getProfile: () => apiClient.get('/users/me'),
  updateProfile: (data) => apiClient.put('/users/me', data),
  changePassword: (oldPassword, newPassword) =>
    apiClient.post('/users/change-password', { old_password: oldPassword, new_password: newPassword }),
  getAll: () => apiClient.get('/users'),
  getById: (id) => apiClient.get(`/users/${id}`),
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
