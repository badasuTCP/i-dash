import React, { createContext, useState, useCallback, useContext } from 'react';
import { Navigate } from 'react-router-dom';

export const AuthContext = createContext(null);

// Demo accounts for RBA preview
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
};

const STORAGE_KEY_USER  = 'idash_user';
const STORAGE_KEY_TOKEN = 'idash_token';

function loadFromStorage() {
  try {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedUser  = JSON.parse(localStorage.getItem(STORAGE_KEY_USER) || 'null');
    return { storedToken, storedUser };
  } catch {
    return { storedToken: null, storedUser: null };
  }
}

export const AuthProvider = ({ children }) => {
  const { storedToken, storedUser } = loadFromStorage();
  const [user,  setUser]  = useState(storedUser);
  const [token, setToken] = useState(storedToken);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 800)); // simulate network

      const normalizedEmail = email.toLowerCase().trim();
      const account = DEMO_ACCOUNTS[normalizedEmail];

      if (!account) {
        // Default: treat any unknown login as executive
        const fallbackUser = {
          id: 99,
          email: normalizedEmail,
          first_name: normalizedEmail.split('@')[0],
          last_name: '',
          full_name: normalizedEmail.split('@')[0],
          role: 'executive',
          department: 'executive',
          is_active: true,
        };
        const t = 'demo-token-exec';
        localStorage.setItem(STORAGE_KEY_TOKEN, t);
        localStorage.setItem(STORAGE_KEY_USER,  JSON.stringify(fallbackUser));
        setToken(t);
        setUser(fallbackUser);
        return { success: true };
      }

      const t = `demo-token-${account.role}`;
      localStorage.setItem(STORAGE_KEY_TOKEN, t);
      localStorage.setItem(STORAGE_KEY_USER,  JSON.stringify(account));
      setToken(t);
      setUser(account);
      return { success: true };
    } catch (err) {
      const message = 'Login failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password, firstName, lastName) => {
    setLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 800));
      const newUser = {
        id: Date.now(),
        email,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        role: 'executive',
        department: 'executive',
        is_active: true,
      };
      const t = 'demo-token-exec';
      localStorage.setItem(STORAGE_KEY_TOKEN, t);
      localStorage.setItem(STORAGE_KEY_USER,  JSON.stringify(newUser));
      setToken(t);
      setUser(newUser);
      return { success: true };
    } catch (err) {
      const message = 'Registration failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    setUser(null);
    setToken(null);
    setError(null);
  }, []);

  // Permission helpers
  const hasPermission = useCallback((feature) => {
    if (!user) return false;
    const perms = ROLE_PERMISSIONS[user.role];
    return perms?.canView?.includes(feature) || perms?.canManage?.includes(feature) || false;
  }, [user]);

  const canManage = useCallback((feature) => {
    if (!user) return false;
    const perms = ROLE_PERMISSIONS[user.role];
    return perms?.canManage?.includes(feature) || false;
  }, [user]);

  const value = {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated: !!token,
    userRole: user?.role,
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
