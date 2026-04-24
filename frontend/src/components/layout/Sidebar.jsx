import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';
import {
  brands,
  brandPages,
  executiveLink,
  salesIntelligenceLink,
  adminLinks,
} from './navConfig';

// ─── Brand Switcher Pill ────────────────────────────────────────────────────
const BrandPill = ({ brand, isActive, collapsed, onClick }) => (
  <button
    onClick={onClick}
    title={brand.fullName}
    className={`
      relative flex items-center justify-center transition-all duration-200
      ${collapsed ? 'w-9 h-9 rounded-lg' : 'px-3 py-1.5 rounded-full'}
      ${
        isActive
          ? `${brand.accentBg} text-white shadow-lg ring-2 ${brand.accentRing}`
          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
      }
    `}
  >
    <span className={`font-bold ${collapsed ? 'text-xs' : 'text-[11px]'} whitespace-nowrap`}>
      {collapsed ? brand.shortName : brand.pillLabel}
    </span>
  </button>
);

// ─── Single Nav Item ────────────────────────────────────────────────────────
const NavItem = ({ to, label, icon: Icon, accent, collapsed, end }) => (
  <NavLink
    to={to}
    end={end}
    title={collapsed ? label : undefined}
    className={({ isActive }) =>
      `group flex items-center gap-3 transition-all duration-200 rounded-lg
       ${collapsed ? 'justify-center px-2 py-2.5 mx-auto w-10' : 'px-3 py-2'}
       ${
         isActive
           ? `bg-white/10 text-white font-medium border-l-2`
           : 'text-slate-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
       }`
    }
    style={({ isActive }) => (isActive && accent ? { borderLeftColor: accent } : {})}
  >
    {Icon && <Icon size={collapsed ? 18 : 16} className="flex-shrink-0" />}
    {!collapsed && <span className="text-sm truncate">{label}</span>}
  </NavLink>
);

// ─── Section Label ──────────────────────────────────────────────────────────
const SectionLabel = ({ children, collapsed }) =>
  collapsed ? (
    <div className="mx-auto my-3 w-5 border-t border-white/10" />
  ) : (
    <div className="px-3 pt-5 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {children}
      </span>
    </div>
  );

// Module-key → admin link path mapping (used to filter sidebar for executives)
const MODULE_TO_PATH = {
  'pipelines':      '/dashboard/pipelines',
  'data-intel':     '/dashboard/data-intelligence',
  'admin-controls': '/dashboard/admin-controls',
  'ai-insights':    '/dashboard/ai',
  'accounts':       '/dashboard/accounts',
  'settings':       '/settings',
};

// Module-key → brand page label matching (for filtering brand sub-pages)
const MODULE_TO_BRAND_LABEL = {
  'dashboards':     'Dashboard',
  'web-analytics':  'Web Analytics',
  'marketing':      'Marketing Campaign',
  'contractors':    'Contractor Breakdown',
};

// ─── Main Sidebar ───────────────────────────────────────────────────────────
const Sidebar = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.role || 'executive';

  const [activeBrand, setActiveBrand] = useState('cp');
  const { collapsed, setCollapsed } = useSidebar();

  // Auto-select the brand whose route the user is on
  useEffect(() => {
    const path = location.pathname;
    for (const b of brands) {
      if (path.startsWith(`/dashboard/${b.id}`)) {
        setActiveBrand(b.id);
        return;
      }
    }
  }, [location.pathname]);

  // Current brand object & its pages
  const currentBrand = useMemo(
    () => brands.find((b) => b.id === activeBrand) || brands[0],
    [activeBrand],
  );

  // ── Module access for executive users ─────────────────────────────────────
  const userModules = useMemo(() => {
    // Super admins get everything
    if (userRole === 'data-analyst') return null;
    // Executive users — read their allowed modules from localStorage
    try {
      const moduleMap = JSON.parse(localStorage.getItem('idash_user_modules') || '{}');
      const allowed = moduleMap[user?.id];
      if (Array.isArray(allowed)) return allowed;
    } catch { /* ignore */ }
    // Default executive modules if nothing saved
    return ['dashboards', 'web-analytics', 'marketing', 'contractors', 'ai-insights'];
  }, [userRole, user?.id]);

  // Filter brand sub-pages based on module access
  const pages = useMemo(() => {
    const allPages = brandPages[activeBrand] || [];
    if (!userModules) return allPages; // super admin sees all
    return allPages.filter((page) => {
      // Find which module key matches this page label
      const moduleKey = Object.keys(MODULE_TO_BRAND_LABEL).find(
        (k) => MODULE_TO_BRAND_LABEL[k] === page.label
      );
      return !moduleKey || userModules.includes(moduleKey);
    });
  }, [activeBrand, userModules]);

  // Role-filtered admin links + module access enforcement
  const filteredAdmin = useMemo(() => {
    let links = adminLinks.filter((a) => a.roles.includes(userRole));
    // For executives, further filter by their allowed modules
    if (userModules) {
      links = links.filter((link) => {
        const moduleKey = Object.keys(MODULE_TO_PATH).find(
          (k) => MODULE_TO_PATH[k] === link.to
        );
        return !moduleKey || userModules.includes(moduleKey);
      });
    }
    return links;
  }, [userRole, userModules]);

  return (
    <aside
      className={`
        fixed left-0 top-0 bottom-0 z-30 flex flex-col
        transition-[width] duration-300 ease-in-out
        ${collapsed ? 'w-[68px]' : 'w-64'}
        bg-slate-900/80 backdrop-blur-md border-r border-white/5
      `}
    >
      {/* ── Logo + Collapse Toggle ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
        <div className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
          {collapsed ? (
            <img
              src="/logo-shield.svg"
              alt="I-Dash"
              className="w-7 h-9 flex-shrink-0"
            />
          ) : (
            <img
              src="/logo-cp-simplified-white.svg"
              alt="The Concrete Protector"
              className="h-7 w-auto flex-shrink-0"
            />
          )}
          {!collapsed && (
            <span className="text-[#F97066] font-bold text-lg leading-tight whitespace-nowrap">
              I-Dash
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`
            text-slate-500 hover:text-white transition-colors rounded-md p-1 hover:bg-white/5
            ${collapsed ? 'hidden' : ''}
          `}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* ── Expand button (when collapsed) ──────────────────────────── */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 text-slate-500 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5"
          title="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* ── Scrollable Navigation ─────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-1">
        {/* Executive Dashboard */}
        {executiveLink.roles.includes(userRole) && (
          <div className={collapsed ? 'px-2' : 'px-3'}>
            <NavItem
              to={executiveLink.to}
              label={executiveLink.label}
              icon={executiveLink.icon}
              accent="#F97066"
              collapsed={collapsed}
            />
          </div>
        )}

        {/* Sales Intelligence — now under CP brand pages */}

        {/* ── Brand Switcher ──────────────────────────────────────── */}
        <SectionLabel collapsed={collapsed}>Brand</SectionLabel>

        <div className={`flex ${collapsed ? 'flex-col items-center gap-2 px-2' : 'items-center gap-1.5 px-3'}`}>
          {brands.map((b) => (
            <BrandPill
              key={b.id}
              brand={b}
              isActive={activeBrand === b.id}
              collapsed={collapsed}
              onClick={() => setActiveBrand(b.id)}
            />
          ))}
        </div>

        {/* ── Dynamic Brand Sub-Menu ─────────────────────────────── */}
        {!collapsed && (
          <div className="px-3 pt-1 pb-0.5">
            <span className={`text-[11px] font-semibold uppercase tracking-widest ${currentBrand.accentText}`}>
              {currentBrand.fullName}
            </span>
          </div>
        )}

        <div className={`space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
          {pages.map((page) => (
            <NavItem
              key={page.to}
              to={page.to}
              label={page.label}
              icon={page.icon}
              accent={currentBrand.accent}
              collapsed={collapsed}
              end={page.label === 'Overview'}
            />
          ))}
        </div>

        {/* ── Admin & Tools ──────────────────────────────────────── */}
        {filteredAdmin.length > 0 && (
          <>
            <SectionLabel collapsed={collapsed}>
              {userRole === 'data-analyst' ? 'Admin & Tools' : 'Tools'}
            </SectionLabel>
            <div className={`space-y-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
              {filteredAdmin.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  accent="#F97066"
                  collapsed={collapsed}
                />
              ))}
            </div>
          </>
        )}
      </nav>

      {/* ── Bottom: Theme Toggle ──────────────────────────────────── */}
      <div className="border-t border-white/5 px-4 py-3">
        <button
          onClick={toggleTheme}
          title={isDark ? 'Light Mode' : 'Dark Mode'}
          className={`
            flex items-center gap-2 text-slate-400 hover:text-white transition-colors
            ${collapsed ? 'justify-center w-full' : ''}
          `}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && (
            <span className="text-sm">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
