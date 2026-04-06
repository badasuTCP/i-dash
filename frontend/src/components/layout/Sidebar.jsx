import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const divisions = [
  {
    id: 'executive',
    label: 'Executive Dashboard',
    isSingle: true,
    links: [
      { to: '/dashboard/executive', label: 'Executive Dashboard' },
    ],
    roles: ['executive', 'data-analyst'],
  },
  {
    id: 'cp',
    label: 'The Concrete Protector',
    links: [
      { to: '/dashboard/cp', label: 'Dashboard' },
      { to: '/dashboard/cp/web-analytics', label: 'Web Analytics' },
      { to: '/dashboard/cp/marketing', label: 'Marketing Campaign' },
    ],
    roles: ['executive', 'data-analyst'],
  },
  {
    id: 'sanitred',
    label: 'Sani-Tred',
    links: [
      { to: '/dashboard/sanitred', label: 'Dashboard' },
      { to: '/dashboard/sanitred/web-analytics', label: 'Web Analytics' },
      { to: '/dashboard/sanitred/marketing', label: 'Marketing Campaign' },
      { to: '/dashboard/sanitred/retail', label: 'Retail Breakdown' },
    ],
    roles: ['executive', 'data-analyst'],
  },
  {
    id: 'ibos',
    label: 'I-BOS',
    links: [
      { to: '/dashboard/ibos', label: 'Dashboard' },
      { to: '/dashboard/ibos/web-analytics', label: 'Web Analytics' },
      { to: '/dashboard/ibos/marketing', label: 'Marketing Campaign' },
      { to: '/dashboard/ibos/contractors', label: 'Contractor Breakdown' },
    ],
    roles: ['executive', 'data-analyst'],
  },
];

const adminLinks = [
  { to: '/dashboard/pipelines',        label: 'Data Pipelines',      roles: ['data-analyst'] },
  { to: '/dashboard/data-intelligence',label: 'Data Intelligence',   roles: ['data-analyst'] },
  { to: '/dashboard/admin-controls',   label: 'Admin Controls',      roles: ['data-analyst'] },
  { to: '/dashboard/ai',               label: 'AI Insights',         roles: ['executive', 'data-analyst'] },
  { to: '/dashboard/accounts',         label: 'Account Management',  roles: ['data-analyst'] },
  { to: '/settings',                   label: 'Settings',            roles: ['data-analyst'] },
];

const Sidebar = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.role || 'executive';

  // Only first collapsible section (CP) open by default
  const [expanded, setExpanded] = useState({ cp: true });

  const toggle = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Auto-expand section when navigating to it
  useEffect(() => {
    divisions.forEach((d) => {
      if (!d.isSingle && d.links.some((l) => location.pathname === l.to)) {
        setExpanded((prev) => ({ ...prev, [d.id]: true }));
      }
    });
  }, [location.pathname]);

  const filteredDivisions = divisions.filter((d) => d.roles.includes(userRole));
  const filteredAdmin = adminLinks.filter((a) => a.roles.includes(userRole));

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 z-30 flex flex-col bg-[#1a1d2e] overflow-hidden">
      {/* Logo + Brand */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <img
            src="/logo-shield.svg"
            alt="CP"
            className="w-8 h-10 flex-shrink-0"
          />
          <div>
            <span className="text-[#F97066] font-bold text-lg leading-tight block">I-Dash</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Section label */}
        <div className="px-5 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Dashboard</span>
        </div>

        {filteredDivisions.map((division) => {
          const isOpen = expanded[division.id];

          // Executive is a standalone link, not a collapsible section
          if (division.isSingle) {
            return (
              <div key={division.id} className="mb-2 px-3">
                <NavLink
                  to={division.links[0].to}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white shadow-lg shadow-orange-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {division.label}
                </NavLink>
              </div>
            );
          }

          // Collapsible division section
          return (
            <div key={division.id} className="mb-1">
              {/* Section header with collapse toggle */}
              <button
                onClick={() => toggle(division.id)}
                className="w-full flex items-center gap-2 px-5 py-2 text-left group transition-colors"
              >
                <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} text-slate-500 group-hover:text-[#55A8C3]`}>
                  ▶
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 group-hover:text-slate-200 transition-colors">
                  {division.label}
                </span>
              </button>

              {/* Sub-links */}
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 px-3">
                  {division.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `block pl-7 pr-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                          isActive
                            ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white font-medium shadow-lg shadow-orange-500/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Admin & Tools */}
        {filteredAdmin.length > 0 && (
          <>
            <div className="mx-5 my-4 border-t border-white/5" />
            <div className="px-5 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                {userRole === 'data-analyst' ? 'Admin & Tools' : 'Tools'}
              </span>
            </div>
            <div className="space-y-0.5 px-3">
              {filteredAdmin.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#F97066] to-[#FEB47B] text-white font-medium shadow-lg shadow-orange-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Theme Toggle */}
      <div className="border-t border-white/5 px-5 py-4">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
          <span className="text-sm">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
