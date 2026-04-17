import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Layout
import Layout from './components/layout/Layout';

// Pages - Executive
import ExecutiveDashboard from './pages/ExecutiveDashboard';

// Pages - CP (Main Company)
import CPDashboard from './pages/cp/CPDashboard';
import CPWebAnalytics from './pages/cp/CPWebAnalytics';
import CPMarketing from './pages/cp/CPMarketing';

// Pages - Sani-Tred (Retail)
import SaniTredDashboard from './pages/sanitred/SaniTredDashboard';
import SaniTredWebAnalytics from './pages/sanitred/SaniTredWebAnalytics';
import SaniTredMarketing from './pages/sanitred/SaniTredMarketing';

// Pages - Sani-Tred (Retail Breakdown)
import SaniTredRetail from './pages/sanitred/SaniTredRetail';

// Pages - I-BOS (Contractor)
import IBOSSDashboard from './pages/iboss/IBOSSDashboard';
import IBOSSWebAnalytics from './pages/iboss/IBOSSWebAnalytics';
import IBOSSMarketing from './pages/iboss/IBOSSMarketing';
import IBOSContractors from './pages/iboss/IBOSContractors';

// Pages - Sales Intelligence
import SalesIntelligence from './pages/SalesIntelligence';

// Utility Pages
import PipelinesPage from './pages/PipelinesPage';
import AccountManagement from './pages/AccountManagement';
import SettingsPage from './pages/SettingsPage';
import AdminControls from './pages/AdminControls';
import DataIntelligence from './pages/DataIntelligence';
import LoginPage from './components/auth/LoginPage';

// Context
import { DashboardConfigProvider } from './context/DashboardConfigContext';
import { GlobalDateProvider } from './context/GlobalDateContext';
import { SidebarProvider } from './context/SidebarContext';

// Protected route wrapper
const ProtectedPageRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  // Role gating: if requiredRole specified, check user has it
  // user.role is already the frontend role (data-analyst or executive)
  if (requiredRole && user?.role !== requiredRole) {
    // Also check if executive user has module access for this specific route
    if (user?.role === 'executive') {
      try {
        const moduleMap = JSON.parse(localStorage.getItem('idash_user_modules') || '{}');
        const allowed = moduleMap[user?.id];
        // If no module access stored, or module not in allowed list → redirect
        if (!Array.isArray(allowed)) {
          return <Navigate to="/dashboard/executive" replace />;
        }
      } catch { /* fall through to redirect */ }
    }
    return <Navigate to="/dashboard/executive" replace />;
  }
  return <Layout>{children}</Layout>;
};

// Main app content with routes
const AppContent = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Executive */}
      <Route path="/dashboard/executive" element={<ProtectedPageRoute><ExecutiveDashboard /></ProtectedPageRoute>} />

      {/* CP (Main Company) */}
      <Route path="/dashboard/cp" element={<ProtectedPageRoute><CPDashboard /></ProtectedPageRoute>} />
      <Route path="/dashboard/cp/web-analytics" element={<ProtectedPageRoute><CPWebAnalytics /></ProtectedPageRoute>} />
      <Route path="/dashboard/cp/marketing" element={<ProtectedPageRoute><CPMarketing /></ProtectedPageRoute>} />

      {/* Sani-Tred (Retail) */}
      <Route path="/dashboard/sanitred" element={<ProtectedPageRoute><SaniTredDashboard /></ProtectedPageRoute>} />
      <Route path="/dashboard/sanitred/web-analytics" element={<ProtectedPageRoute><SaniTredWebAnalytics /></ProtectedPageRoute>} />
      <Route path="/dashboard/sanitred/marketing" element={<ProtectedPageRoute><SaniTredMarketing /></ProtectedPageRoute>} />
      <Route path="/dashboard/sanitred/retail" element={<ProtectedPageRoute><SaniTredRetail /></ProtectedPageRoute>} />

      {/* I-BOS (Contractor) - routes use /ibos path */}
      <Route path="/dashboard/ibos" element={<ProtectedPageRoute><IBOSSDashboard /></ProtectedPageRoute>} />
      <Route path="/dashboard/ibos/web-analytics" element={<ProtectedPageRoute><IBOSSWebAnalytics /></ProtectedPageRoute>} />
      <Route path="/dashboard/ibos/marketing" element={<ProtectedPageRoute><IBOSSMarketing /></ProtectedPageRoute>} />
      <Route path="/dashboard/ibos/contractors" element={<ProtectedPageRoute><IBOSContractors /></ProtectedPageRoute>} />

      {/* Legacy /iboss routes redirect to /ibos */}
      <Route path="/dashboard/iboss/*" element={<Navigate to="/dashboard/ibos" replace />} />

      {/* Sales Intelligence — both roles */}
      <Route path="/dashboard/sales-intelligence" element={<ProtectedPageRoute><SalesIntelligence /></ProtectedPageRoute>} />

      {/* Data Analyst Only Pages */}
      <Route path="/dashboard/pipelines" element={<ProtectedPageRoute requiredRole="data-analyst"><PipelinesPage /></ProtectedPageRoute>} />
      <Route path="/dashboard/accounts" element={<ProtectedPageRoute requiredRole="data-analyst"><AccountManagement /></ProtectedPageRoute>} />
      <Route path="/settings" element={<ProtectedPageRoute requiredRole="data-analyst"><SettingsPage /></ProtectedPageRoute>} />
      <Route path="/dashboard/admin-controls" element={<ProtectedPageRoute requiredRole="data-analyst"><AdminControls /></ProtectedPageRoute>} />
      <Route path="/dashboard/data-intelligence" element={<ProtectedPageRoute requiredRole="data-analyst"><DataIntelligence /></ProtectedPageRoute>} />

      {/* AI Insights - Both roles */}
      <Route path="/dashboard/ai" element={<ProtectedPageRoute><ExecutiveDashboard /></ProtectedPageRoute>} />

      {/* Default redirect */}
      <Route path="/dashboard" element={<Navigate to="/dashboard/executive" replace />} />
      <Route path="/" element={<Navigate to="/dashboard/executive" replace />} />
      <Route path="*" element={<Navigate to="/dashboard/executive" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <GlobalDateProvider>
          <DashboardConfigProvider>
          <SidebarProvider>
          <AppContent />
          <Toaster
            position="top-right"
            reverseOrder={false}
            gutter={8}
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#f1f5f9',
                border: '1px solid rgba(71, 85, 105, 0.3)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              },
              success: {
                style: { borderColor: 'rgba(16, 185, 129, 0.3)' },
                iconTheme: { primary: '#10B981', secondary: '#0f172a' },
              },
              error: {
                style: { borderColor: 'rgba(244, 63, 94, 0.3)' },
                iconTheme: { primary: '#F43F5E', secondary: '#0f172a' },
              },
            }}
          />
        </SidebarProvider>
        </DashboardConfigProvider>
        </GlobalDateProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;
