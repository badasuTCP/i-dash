/**
 * Navigation Configuration — single source of truth for sidebar navigation.
 *
 * Separates the nav structure from the UI so future changes
 * (new brands, pages, role gates) only touch this file.
 */
import {
  LayoutDashboard,
  BarChart3,
  Globe,
  Megaphone,
  ShoppingBag,
  HardHat,
  Database,
  BrainCircuit,
  ShieldCheck,
  Sparkles,
  Users,
  Settings,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────
// Brands — the three top-level divisions + their accent colours
// ────────────────────────────────────────────────────────────────
export const brands = [
  {
    id: 'cp',
    shortName: 'CP',
    pillLabel: 'CP',
    fullName: 'The Concrete Protector',
    accent: '#F97066',       // coral/orange
    accentRing: 'ring-[#F97066]/40',
    accentBg: 'bg-[#F97066]',
    accentText: 'text-[#F97066]',
  },
  {
    id: 'sanitred',
    shortName: 'ST',
    pillLabel: 'Sani-Tred',
    fullName: 'Sani-Tred',
    accent: '#34D399',       // emerald
    accentRing: 'ring-emerald-400/40',
    accentBg: 'bg-emerald-400',
    accentText: 'text-emerald-400',
  },
  {
    id: 'ibos',
    shortName: 'IB',
    pillLabel: 'I-BOS',
    fullName: 'I-BOS',
    accent: '#60A5FA',       // blue
    accentRing: 'ring-blue-400/40',
    accentBg: 'bg-blue-400',
    accentText: 'text-blue-400',
  },
];

// ────────────────────────────────────────────────────────────────
// Per-brand sub-pages (shown when the brand is selected)
// ────────────────────────────────────────────────────────────────
export const brandPages = {
  cp: [
    { to: '/dashboard/cp',                label: 'Dashboard',          icon: LayoutDashboard },
    { to: '/dashboard/cp/web-analytics',  label: 'Web Analytics',      icon: Globe },
    { to: '/dashboard/cp/marketing',      label: 'Marketing Campaign', icon: Megaphone },
  ],
  sanitred: [
    { to: '/dashboard/sanitred',                label: 'Dashboard',          icon: LayoutDashboard },
    { to: '/dashboard/sanitred/web-analytics',  label: 'Web Analytics',      icon: Globe },
    { to: '/dashboard/sanitred/marketing',      label: 'Marketing Campaign', icon: Megaphone },
    { to: '/dashboard/sanitred/retail',         label: 'Retail Breakdown',   icon: ShoppingBag },
  ],
  ibos: [
    { to: '/dashboard/ibos',                label: 'Dashboard',            icon: LayoutDashboard },
    { to: '/dashboard/ibos/web-analytics',  label: 'Web Analytics',        icon: Globe },
    { to: '/dashboard/ibos/marketing',      label: 'Marketing Campaign',   icon: Megaphone },
    { to: '/dashboard/ibos/contractors',    label: 'Contractor Breakdown', icon: HardHat },
  ],
};

// ────────────────────────────────────────────────────────────────
// Executive link (always visible, above brand switcher)
// ────────────────────────────────────────────────────────────────
export const executiveLink = {
  to: '/dashboard/executive',
  label: 'Executive Dashboard',
  icon: BarChart3,
  roles: ['executive', 'data-analyst'],
};

// ────────────────────────────────────────────────────────────────
// Admin & Tools section
// ────────────────────────────────────────────────────────────────
export const adminLinks = [
  { to: '/dashboard/pipelines',         label: 'Data Pipelines',     icon: Database,      roles: ['data-analyst'] },
  { to: '/dashboard/data-intelligence', label: 'Data Intelligence',  icon: BrainCircuit,  roles: ['data-analyst'] },
  { to: '/dashboard/admin-controls',    label: 'Admin Controls',     icon: ShieldCheck,   roles: ['data-analyst'] },
  { to: '/dashboard/ai',               label: 'AI Insights',        icon: Sparkles,      roles: ['data-analyst', 'executive'] },
  { to: '/dashboard/accounts',         label: 'Account Management', icon: Users,         roles: ['data-analyst'] },
  { to: '/settings',                   label: 'Settings',           icon: Settings,      roles: ['data-analyst'] },
];
