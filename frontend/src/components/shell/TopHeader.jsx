// frontend/src/components/shell/TopHeader.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Approved Figma top header, ported:
//   • breadcrumbs from the current path (react-router-dom v6 useLocation/Link)
//   • real user initials from useAuth() (no hardcoded "SA")
//   • live WebSocket connection status from the EXISTING WSContext
// ─────────────────────────────────────────────────────────────────────────────
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'

const routeLabels = {
  dashboard:           'Home',
  escalations:         'Action Center',
  workflows:           'Workflows',
  'workflow-library':  'Workflow Library',
  builder:             'Workflow Builder',
  evidence:            'Evidence',
  'ai-engine':         'AI Services',
  integrations:        'Integrations',
  settings:            'Settings',
  general:             'General',
  config:              'General',
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
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50">
      <span className={`w-1.5 h-1.5 rounded-full ${color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-[11px] font-medium text-slate-500 capitalize hidden sm:inline">{status}</span>
    </div>
  )
}

export function TopHeader() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const { status } = useWebSocket()

  const parts = location.pathname.split('/').filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: routeLabels[part] ?? part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
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

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-white border-b border-slate-200">
      <nav className="flex items-center gap-1.5">
        <Link to={home} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
          SMBFlow
        </Link>
        {crumbs.map(crumb => (
          <span key={crumb.to} className="flex items-center gap-1.5">
            <ChevronRight size={13} className="text-slate-300" />
            {crumb.isLast ? (
              <span className="text-sm font-medium text-slate-900">{crumb.label}</span>
            ) : (
              <Link to={crumb.to} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <WSDot status={status} />
        <div
          className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center"
          title={user?.full_name || user?.email || ''}
        >
          <span className="text-xs font-semibold text-white">{initials}</span>
        </div>
      </div>
    </header>
  )
}
