import React, { createContext, useState, useCallback, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { authAPI } from '../services/api';

export const AuthContext = createContext(null);

// Demo fallback — used when backend is unreachable or email matches demo list
const DEMO_ACCOUNTS = {
  'daniel@theconcreteprotector.com': {
    id: 1,
    email: 'daniel@theconcreteprotector.com',
    first_name: 'Daniel',
    last_name: 'Badasu',
    full_name: 'Daniel Badasu',
    role: 'data-analyst',
    department: 'engineering',
    is_active: true,
  },
  'exec@theconcreteprotector.com': {
    id: 2,
    email: 'exec@theconcreteprotector.com',
    first_name: 'Executive',
    last_name: 'User',
    full_name: 'Executive User',
    role: 'executive',
    department: 'executive',
    is_active: true,
  },
};

// Role permissions mapping
export const ROLE_PERMISSIONS = {
  'executive': {
    label: 'Executive',
    canView: ['dashboards', 'ai-insights'],
    canManage: [],
    description: 'View all dashboards and AI chatbot',
  },
  'data-analyst': {
    label: 'Data Analyst (Super Admin)',
    canView: ['dashboards', 'ai-insights', 'pipelines', 'accounts', 'settings'],
    canManage: ['pipelines', 'accounts', 'settings', 'dashboards'],
    description: 'Full access to all features including data pipelines and account management',
  },
  'admin': {
    label: 'Administrator',
    canView: ['dashboards', 'ai-insights', 'pipelines', 'accounts', 'settings'],
    canManage: ['pipelines', 'accounts', 'settings', 'dashboards'],
    description: 'Full system access',
  },
};

const STORAGE_KEY_USER    = 'idash_user';
const STORAGE_KEY_TOKEN   = 'idash_token';
const STORAGE_KEY_REFRESH = 'idash_refresh_token';

function loadFromStorage() {
  try {
    const storedToken   = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedRefresh = localStorage.getItem(STORAGE_KEY_REFRESH);
    const storedUser    = JSON.parse(localStorage.getItem(STORAGE_KEY_USER) || 'null');
    return { storedToken, storedRefresh, storedUser };
  } catch {
    return { storedToken: null, storedRefresh: null, storedUser: null };
  }
}

// Map backend roles → frontend roles used by sidebar & route guards
const BACKEND_TO_FRONTEND_ROLE = {
  admin:    'data-analyst',   // super admin → full access
  director: 'executive',      // executive   → restricted
  manager:  'executive',
  analyst:  'executive',
  viewer:   'executive',
};

function normaliseUser(apiUser) {
  // Normalise API response into the shape our app expects
  const backendRole = (apiUser.role || 'executive').toLowerCase();
  const frontendRole = BACKEND_TO_FRONTEND_ROLE[backendRole] || 'executive';
  return {
    id:          apiUser.id,
    email:       apiUser.email,
    first_name:  apiUser.first_name || apiUser.firstName || apiUser.email?.split('@')[0] || '',
    last_name:   apiUser.last_name  || apiUser.lastName  || '',
    full_name:   apiUser.full_name  || apiUser.fullName  || `${apiUser.first_name || ''} ${apiUser.last_name || ''}`.trim(),
    role:        frontendRole,
    backendRole: backendRole,        // keep original for Account Management display
    department:  apiUser.department || apiUser.role || 'general',
    is_active:   apiUser.is_active  ?? true,
  };
}

export const AuthProvider = ({ children }) => {
  const { storedToken, storedRefresh, storedUser } = loadFromStorage();
  const [user,    setUser]    = useState(storedUser);
  const [token,   setToken]   = useState(storedToken);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [authMode, setAuthMode] = useState(storedToken?.startsWith('demo-') ? 'demo' : 'live');

  const _persist = useCallback((tok, usr, refresh = null) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, tok);
    localStorage.setItem(STORAGE_KEY_USER,  JSON.stringify(usr));
    if (refresh) localStorage.setItem(STORAGE_KEY_REFRESH, refresh);
    setToken(tok);
    setUser(usr);
  }, []);

  // ─── LOGIN ────────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);

    const normalizedEmail = email.toLowerCase().trim();

    // ── 1. Try real backend first ─────────────────────────────────────────────
    try {
      const res = await authAPI.login(normalizedEmail, password);
      const data = res.data;

      // Backend typically returns { access_token, token_type, user } or { access_token, ... }
      const accessToken  = data.access_token  || data.token;
      const refreshToken = data.refresh_token || null;

      // Get user info — either embedded in login response or via /users/me
      let userObj = data.user || data.profile || null;
      if (!userObj && accessToken) {
        // Set token temporarily so the interceptor works for /users/me
        localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
        try {
          const meRes = await authAPI.me();
          userObj = meRes.data;
        } catch {
          // If /me fails, build minimal user — default to RESTRICTED role for safety
          userObj = { id: 1, email: normalizedEmail, role: 'viewer' };
        }
      }

      const normUser = normaliseUser(userObj || { email: normalizedEmail });
      _persist(accessToken, normUser, refreshToken);
      setAuthMode('live');
      setLoading(false);
      return { success: true, mode: 'live' };

    } catch (backendErr) {
      // 401 = wrong credentials — don't fall back to demo
      if (backendErr.response?.status === 401) {
        const msg = 'Invalid email or password';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }

      // Network / 5xx — fall through to demo mode
    }

    // ── 2. Demo fallback (backend unreachable) ────────────────────────────────
    await new Promise((r) => setTimeout(r, 600));

    const account = DEMO_ACCOUNTS[normalizedEmail];
    if (account) {
      const t = `demo-token-${account.role}`;
      _persist(t, account);
      setAuthMode('demo');
      setLoading(false);
      return { success: true, mode: 'demo' };
    }

    // Unknown email in demo mode — treat as executive
    const fallback = {
      id:         99,
      email:      normalizedEmail,
      first_name: normalizedEmail.split('@')[0],
      last_name:  '',
      full_name:  normalizedEmail.split('@')[0],
      role:       'executive',
      department: 'executive',
      is_active:  true,
    };
    _persist('demo-token-exec', fallback);
    setAuthMode('demo');
    setLoading(false);
    return { success: true, mode: 'demo' };

  }, [_persist]);

  // ─── REGISTER ─────────────────────────────────────────────────────────────────
  const register = useCallback(async (email, password, firstName, lastName) => {
    setLoading(true);
    setError(null);

    // Try real backend
    try {
      const res = await authAPI.register(email, password, firstName, lastName);
      const data = res.data;
      const accessToken  = data.access_token || data.token;
      const refreshToken = data.refresh_token || null;

      let userObj = data.user || null;
      if (!userObj) {
        userObj = {
          id:         data.id || Date.now(),
          email,
          first_name: firstName,
          last_name:  lastName,
          role:       'executive',
          department: 'executive',
          is_active:  true,
        };
      }
      const normUser = normaliseUser(userObj);
      if (accessToken) {
        _persist(accessToken, normUser, refreshToken);
        setAuthMode('live');
      } else {
        // Registration without auto-login — just sign them in as demo
        _persist('demo-token-exec', normUser);
        setAuthMode('demo');
      }
      setLoading(false);
      return { success: true };
    } catch (backendErr) {
      if (backendErr.response?.status === 400 || backendErr.response?.status === 422) {
        const msg = backendErr.response?.data?.detail || 'Registration failed';
        setError(msg);
        setLoading(false);
        return { success: false, error: msg };
      }
      // Backend unreachable — demo registration
    }

    // Demo fallback
    await new Promise((r) => setTimeout(r, 600));
    const newUser = {
      id:         Date.now(),
      email,
      first_name: firstName,
      last_name:  lastName,
      full_name:  `${firstName} ${lastName}`,
      role:       'executive',
      department: 'executive',
      is_active:  true,
    };
    _persist('demo-token-exec', newUser);
    setAuthMode('demo');
    setLoading(false);
    return { success: true, mode: 'demo' };
  }, [_persist]);

  // ─── LOGOUT ───────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    // Best-effort backend logout
    if (token && !token.startsWith('demo-')) {
      authAPI.logout().catch(() => {});
    }
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_REFRESH);
    setUser(null);
    setToken(null);
    setError(null);
    setAuthMode('live');
  }, [token]);

  // ─── Permission helpers ───────────────────────────────────────────────────────
  const hasPermission = useCallback((feature) => {
    if (!user) return false;
    const perms = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS['executive'];
    return perms?.canView?.includes(feature) || perms?.canManage?.includes(feature) || false;
  }, [user]);

  const canManage = useCallback((feature) => {
    if (!user) return false;
    const perms = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS['executive'];
    return perms?.canManage?.includes(feature) || false;
  }, [user]);

  // Re-pull the current user from /auth/me and update cached state so the
  // sidebar / header reflect a fresh profile after SettingsPage edits it.
  const refreshUser = useCallback(async () => {
    if (!token || authMode === 'demo') return;
    try {
      const { data } = await authAPI.me();
      const normalised = normaliseUser(data);
      setUser(normalised);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(normalised));
    } catch {
      // Leave cached user in place; the next hard refresh will re-sync.
    }
  }, [token, authMode]);

  const value = {
    user,
    token,
    loading,
    error,
    authMode,   // 'live' | 'demo'
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!token,
    userRole:       user?.role,
    userDepartment: user?.department,
    hasPermission,
    canManage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
