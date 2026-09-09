// frontend/src/components/shell/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Inbox, Workflow, BookOpen, Bot, Plug, Settings,
  CreditCard, FileSearch, LayoutDashboard, Users,
  Activity, DollarSign, LogOut,
  Building2, GitBranch, GitMerge, Link, FileText, Cpu,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// Owner nav
const ownerNav = [
  {
    title: 'Operations',
    items: [
      { label: 'Home',          to: '/dashboard',        icon: Home },
      { label: 'Action Center', to: '/escalations',      icon: Inbox,    badge: 'actions' },
      { label: 'Workflows',     to: '/workflows',        icon: Workflow },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Workflow Library', to: '/workflow-library', icon: BookOpen },
      { label: 'AI Engine',        to: '/ai-engine',        icon: Bot },
      { label: 'Integrations',     to: '/integrations',     icon: Plug },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'General',          to: '/settings/general',       icon: Settings },
      { label: 'AI Engine',        to: '/settings/ai-engine',     icon: Bot },
      { label: 'Integrations',     to: '/settings/integrations',  icon: Plug },
      { label: 'Budget & Billing', to: '/budget',                 icon: CreditCard },
      { label: 'Evidence',         to: '/evidence',               icon: FileSearch },
    ],
  },
]

// Admin nav — full spec
const adminNav = [
  {
    title: 'Overview',
    items: [
      { label: 'Platform Overview', to: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Organization Management',
    items: [
      { label: 'Organizations', to: '/admin/organizations', icon: Building2 },
      { label: 'Users',         to: '/admin/users',         icon: Users },
    ],
  },
  {
    title: 'Workflow Operations',
    items: [
      { label: 'Workflows',     to: '/admin/workflows',     icon: Workflow },
      { label: 'Workflow Runs', to: '/admin/runs',          icon: GitBranch },
      { label: 'Review Queue',  to: '/admin/reviews',       icon: Inbox },
    ],
  },
  {
    title: 'AI Platform',
    items: [
      { label: 'AI Services',           to: '/admin/ai-services', icon: Bot },
      { label: 'Provider Connections',  to: '/admin/providers',   icon: Plug },
      { label: 'Models',                to: '/admin/models',      icon: Cpu },
      { label: 'Routing & Assignments', to: '/admin/routing',     icon: GitMerge },
    ],
  },
  {
    title: 'Platform Operations',
    items: [
      { label: 'System Health', to: '/admin/health',       icon: Activity },
      { label: 'Integrations',  to: '/admin/integrations', icon: Link },
      { label: 'Usage & Cost',  to: '/admin/usage',        icon: DollarSign },
      { label: 'Audit Log',     to: '/admin/audit',        icon: FileText },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Platform Settings', to: '/admin/settings', icon: Settings },
    ],
  },
]

export function Sidebar({ isAdmin = false, getBadge, onNavClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const sections = isAdmin ? adminNav : ownerNav

  function handleLogout() {
    logout()
    navigate('/auth', { replace: true })
  }

  const displayName = user?.full_name || user?.email || 'Account'
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const displayRole = isAdmin ? 'Platform Admin' : 'SMB Owner'

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-white border-r border-slate-200 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">SMBFlow</span>
        {isAdmin && (
          <span className="ml-auto text-[10px] font-medium bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
            Admin
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {sections.map(section => (
          <div key={section.title} className="mb-4">
            <p className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const count = item.badge && getBadge ? getBadge(item.badge) : 0
                return (
                  <li key={`${section.title}-${item.label}`}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/dashboard' || item.to === '/admin'}
                      onClick={onNavClick}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`
                      }
                    >
                      <item.icon size={15} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-red-500 text-white text-[10px] rounded-full font-bold">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-900 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-400 truncate">{displayRole}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors rounded"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}
