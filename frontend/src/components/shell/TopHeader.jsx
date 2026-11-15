/**
 * Top Header Navigation Bar
 * Features dynamic route breadcrumbs, live WebSocket connection state indicator,
 * notification center drawer, and light/dark theme switcher.
 */
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Sun, Moon, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { useTheme } from '../../contexts/ThemeContext'
import { NotificationCenter } from './NotificationCenter'

const routeLabels = {
  dashboard:           'Dashboard',
  copilot:             'AI Assistant',
  escalations:         'Action Center',
  workflows:           'Workflows',
  'workflow-library':  'Workflow Library',
  builder:             'Workflow Builder',
  evidence:            'Evidence',
  'ai-engine':         'AI Services',
  integrations:        'Integrations',
  settings:            'Settings',
  general:             'Profile',
  config:              'Profile',
  models:              'Model Catalog',
  budget:              'Budget & Billing',
  tools:               'Integrations',
  prompts:             'Prompts',
  'email-queue':       'Email Queue',
  patterns:            'Patterns',
  admin:               'Platform Overview',
  users:               'Users',
  fleet:               'Fleet Cost',
  health:              'System Health',
  organizations:       'Organizations',
  runs:                'Workflow Runs',
  reviews:             'Review Queue',
  'ai-services':       'AI Services',
  providers:           'Provider Connections',
  routing:             'Routing & Assignments',
  usage:               'Usage & Cost',
  audit:               'Audit Log',
}

function WSDot({ status }) {
  const color =
    status === 'connected' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize hidden sm:inline">{status}</span>
    </div>
  )
}

export function TopHeader({ onMenuToggle, mobileMenuOpen = false }) {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const { status } = useWebSocket()
  const { theme, toggle, isDark } = useTheme()

  const parts = location.pathname.split('/').filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: routeLabels[part] ?? part.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    to: '/' + parts.slice(0, i + 1).join('/'),
    isLast: i === parts.length - 1,
  }))

  const home = isAdmin ? '/admin' : '/dashboard'
  const initials = (user?.full_name || user?.email || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const avatarUrl = user?.avatar_url || localStorage.getItem(`avatar_${user?.id}`) || localStorage.getItem('smbflow_avatar')
  const currentTitle = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : (isAdmin ? 'Platform Overview' : 'Dashboard')

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-3 sm:px-6 bg-white dark:bg-[#0b0f17] border-b border-slate-200 dark:border-[#233048] transition-colors">
      <div className="flex items-center min-w-0 mr-2">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="md:hidden p-1.5 -ml-1 mr-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#182234] focus:outline-none transition-colors cursor-pointer shrink-0"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          title="Toggle navigation"
        >
          <Menu size={20} />
        </button>

        {/* Desktop Breadcrumbs (sm+) */}
        <nav className="hidden sm:flex items-center gap-1.5 min-w-0" aria-label="Breadcrumb">
          <Link to={home} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors shrink-0">
            <img src="/isolate-icon.svg" alt="Isolate" className="w-4 h-4 shrink-0" />
            <span>Isolate</span>
          </Link>
          {crumbs.map(crumb => (
            <span key={crumb.to} className="flex items-center gap-1.5 min-w-0">
              <ChevronRight size={13} className="text-slate-300 dark:text-slate-600 shrink-0" />
              {crumb.isLast ? (
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors truncate">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {/* Mobile Single Active Title (<sm) */}
        <div className="sm:hidden flex items-center min-w-0 gap-1.5">
          <img src="/isolate-icon.svg" alt="Isolate" className="w-5 h-5 shrink-0" />
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
            {currentTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Global + Personal Notification Center */}
        <NotificationCenter />

        {/* Global Persistent Theme Toggle */}
        <button
          type="button"
          onClick={toggle}
          className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <WSDot status={status} />

        {/* Clickable Profile Avatar */}
        <Link
          to="/settings/general"
          className="w-8 h-8 rounded-full bg-blue-600 hover:ring-2 hover:ring-blue-400 overflow-hidden flex items-center justify-center shadow-xs transition-all cursor-pointer shrink-0"
          title={`View Profile (${user?.full_name || user?.email || 'User'})`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-white">{initials}</span>
          )}
        </Link>
      </div>
    </header>
  )
}
