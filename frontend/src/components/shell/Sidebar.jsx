import React, { useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Inbox, Workflow, Plug, CreditCard, FileSearch, LayoutDashboard, Users,
  Activity, LogOut, Building2, GitBranch, FileText, Cpu,
  ReceiptText, Layers, Zap, User, Cloud, Box, ChevronRight, Plus, Search, Terminal
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Primary Operations ────────────────────────────────────────────────────────
const ownerPrimaryNav = [
  { label: 'AI Assistant',  to: '/copilot',     icon: Terminal, badge: 'preview' },
  { label: 'Dashboard',     to: '/dashboard',   icon: LayoutDashboard },
  { label: 'Action Center', to: '/escalations', icon: Inbox, badge: 'actions' },
  { label: 'Workflows',     to: '/workflows',   icon: Workflow },
]

// ── Secondary / Bottom Nav ───────────────────────────────────────────────────
const ownerSecondaryNav = [
  { label: 'Workflow Library', to: '/workflow-library', icon: Box },
  { label: 'Integrations',     to: '/integrations',     icon: Plug },
  { label: 'Budget & Billing', to: '/budget',           icon: CreditCard },
  { label: 'Evidence',         to: '/evidence',         icon: FileSearch },
  { label: 'Profile Settings', to: '/settings/general', icon: User, hasArrow: true },
]

// ── Platform Admin navigation ─────────────────────────────────────────────────
const adminNav = [
  {
    title: 'Overview',
    items: [
      { label: 'AI Assistant',      to: '/copilot', icon: Terminal, badge: 'preview' },
      { label: 'Platform Overview', to: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Customers',
    items: [
      { label: 'Organizations', to: '/admin/organizations', icon: Building2 },
      { label: 'Users',         to: '/admin/users',         icon: Users },
    ],
  },
  {
    title: 'Workflows',
    items: [
      { label: 'Workflow Builder',    to: '/workflows/builder',            icon: Workflow },
      { label: 'Workflow Catalog',    to: '/admin/workflows/catalog',     icon: Layers },
      { label: 'Workflow Assignments',to: '/admin/workflows/assignments', icon: GitBranch },
      { label: 'Workflow Runs',       to: '/admin/runs',                  icon: Zap },
    ],
  },
  {
    title: 'Billing & Platform',
    items: [
      { label: 'Plans & Pricing', to: '/admin/plans',         icon: CreditCard },
      { label: 'Subscriptions',   to: '/admin/subscriptions', icon: ReceiptText },
      { label: 'AI Providers',    to: '/admin/providers',     icon: Plug },
      { label: 'Models',          to: '/admin/models',        icon: Cpu },
      { label: 'System Health',   to: '/admin/health',        icon: Activity },
      { label: 'Profile Settings',to: '/settings/general',    icon: User, hasArrow: true },
    ],
  },
]

export function Sidebar({ isAdmin = false, getBadge, onNavClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const enabledModules = user?.enabled_modules || []
  const hasMedicalTourism = enabledModules.includes('medical_tourism')

  const dynamicPrimaryNav = useMemo(() => {
    const nav = [...ownerPrimaryNav]
    if (hasMedicalTourism) {
      nav.push({ label: 'Patient Cases', to: '/medical/cases', icon: FileText })
    }
    return nav
  }, [hasMedicalTourism])

  function handleLogout() {
    logout()
    navigate('/auth', { replace: true })
  }

  const displayName = user?.full_name || user?.email || 'Account'
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const displayRole = isAdmin ? 'Platform Admin' : 'SMB Owner'
  const avatarUrl = user?.avatar_url || (user?.id ? localStorage.getItem(`avatar_${user.id}`) : null) || localStorage.getItem('smbflow_avatar')

  return (
    <aside className="w-[230px] shrink-0 flex flex-col bg-white dark:bg-[#111318] border-r border-slate-200 dark:border-[#272b35] h-full select-none transition-colors">
      {/* ── Brand / Logo Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-[#272b35]">
        <div
          onClick={() => navigate(isAdmin ? '/admin' : '/copilot')}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          {/* n8n style workflow node icon */}
          <div className="w-7 h-7 rounded-lg bg-[#ea580c] flex items-center justify-center text-white shadow-xs">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">
            SMBFlow
          </span>
          {isAdmin && (
            <span className="text-[9px] font-bold uppercase bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800">
              Admin
            </span>
          )}
        </div>

        {/* Quick action icons */}
        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
          <button
            onClick={() => navigate('/workflows')}
            className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-[#1e2129] flex items-center justify-center hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Create Workflow"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigate('/workflow-library')}
            className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-[#1e2129] flex items-center justify-center hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Search Templates"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Main Navigation Area ───────────────────────────────────────────── */}
      <nav className="flex-1 flex flex-col justify-between overflow-y-auto px-2.5 py-3 space-y-4" aria-label="Sidebar navigation">
        {isAdmin ? (
          /* Admin Structured Navigation */
          <div className="space-y-4">
            {adminNav.map(section => (
              <div key={section.title}>
                <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map(item => (
                    <li key={item.label}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/admin'}
                        onClick={onNavClick}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-orange-500/10 dark:bg-[#1e2129] text-orange-600 dark:text-orange-400 font-semibold border border-orange-500/20 dark:border-[#272b35]'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-[#1e2129]/60 hover:text-slate-900 dark:hover:text-slate-200'
                          }`
                        }
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <item.icon size={15} className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge === 'preview' && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Preview
                          </span>
                        )}
                        {item.hasArrow && <ChevronRight size={13} className="text-slate-400" />}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          /* SMB Owner Balanced Navigation */
          <>
            {/* Top Primary Operations */}
            <div className="space-y-1">
              {dynamicPrimaryNav.map(item => {
                const count = item.badge === 'actions' && getBadge ? getBadge('actions') : 0

                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    end={item.to === '/dashboard'}
                    onClick={onNavClick}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-orange-500/10 dark:bg-[#1e2129] text-orange-600 dark:text-orange-400 font-semibold border border-orange-500/20 dark:border-[#272b35]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-[#1e2129]/60 hover:text-slate-900 dark:hover:text-slate-200'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <item.icon size={15} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge === 'preview' && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        Preview
                      </span>
                    )}

                    {count > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] rounded-full font-bold">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>

            {/* Bottom Secondary Group */}
            <div className="pt-3 border-t border-slate-100 dark:border-[#272b35] space-y-1">
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-[#1e2129]/60 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <Cloud size={15} className="shrink-0 text-blue-500" />
                  <span>Admin Panel</span>
                </NavLink>
              )}

              {ownerSecondaryNav.map(item => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  onClick={onNavClick}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-orange-500/10 dark:bg-[#1e2129] text-orange-600 dark:text-orange-400 font-semibold border border-orange-500/20 dark:border-[#272b35]'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-[#1e2129]/60 hover:text-slate-900 dark:hover:text-slate-200'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <item.icon size={15} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.hasArrow && <ChevronRight size={13} className="text-slate-400 dark:text-slate-600" />}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* ── User Profile Bottom Card ─────────────────────────────────────────── */}
      <div className="border-t border-slate-100 dark:border-[#272b35] p-2.5">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1e2129] transition-colors">
          <div
            onClick={() => navigate('/settings/general')}
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer group"
            title="Click to view and edit profile"
          >
            <div className="w-7 h-7 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center shrink-0 group-hover:ring-2 group-hover:ring-orange-400 transition-all">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-white">{initials}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-200 truncate group-hover:text-orange-400 transition-colors">
                {displayName}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{displayRole}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors rounded cursor-pointer"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

