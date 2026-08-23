// frontend/src/components/layout/Layout.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, LayoutDashboard, Cpu, Settings2, Brain, DollarSign, Wrench,
  GitBranch, FileText, Mail, Bot, Bell, Shield, Users, BarChart3,
  Globe, Sun, Moon, Menu, X, ChevronDown, LogOut, User, Wifi,
  WifiOff, Circle, HelpCircle, Terminal, Layers, Search,
} from 'lucide-react'
import { useAuth }       from '../../contexts/AuthContext'
import { useWebSocket }  from '../../contexts/WSContext'
import { useTheme }      from '../../contexts/ThemeContext'
import { useBadgeStore, useUIStore } from '../../utils/appStore'
import { LiveDot }       from '../ui'
import { cn }            from '../ui'

// ── Nav Definitions ────────────────────────────────────────────────────────────
const ADMIN_NAV = [
  { to: '/admin',        Icon: Globe,         label: 'God View' },
  { to: '/admin/fleet',  Icon: DollarSign,    label: 'Fleet Cost' },
  { to: '/admin/users',  Icon: Users,         label: 'Users' },
  { to: '/escalations',  Icon: Bell,          label: 'Escalations', badge: 'esc' },
  { to: '/evidence',     Icon: Shield,        label: 'Evidence' },
]

const CLIENT_NAV = [
  { to: '/dashboard',         Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workflows/builder', Icon: GitBranch,       label: 'Builder' },
  { to: '/config',            Icon: Settings2,       label: 'Config' },
  { to: '/models',            Icon: Cpu,             label: 'Models' },
  { to: '/budget',            Icon: DollarSign,      label: 'Budget' },
  { to: '/tools',             Icon: Wrench,          label: 'Tools' },
  { to: '/prompts',           Icon: FileText,        label: 'Prompts' },
  { to: '/email-queue',       Icon: Mail,            label: 'Emails',  badge: 'email' },
  { to: '/patterns',          Icon: Brain,           label: 'Patterns', badge: 'pattern' },
  { to: '/escalations',       Icon: Bell,            label: 'Escalations', badge: 'esc' },
  { to: '/evidence',          Icon: Shield,          label: 'Evidence' },
]

// ── WS Status indicator ────────────────────────────────────────────────────────
function WSStatus({ status }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
      status === 'connected'
        ? 'bg-success/8 border-success/25 text-success'
        : status === 'error'
        ? 'bg-danger/8 border-danger/25 text-danger'
        : 'bg-[rgb(var(--bg-hover))] border-[rgb(var(--border))] text-[rgb(var(--text-muted))]',
    )}>
      <LiveDot
        color={status === 'connected' ? 'green' : status === 'error' ? 'red' : 'gray'}
        pulse={status === 'connected'}
        size="xs"
      />
      <span className="hidden sm:inline">WS {status}</span>
    </div>
  )
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { isDark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={cn(
        'p-2 rounded-xl border transition-all duration-200',
        'bg-[rgb(var(--bg-hover))] border-[rgb(var(--border))]',
        'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]',
        'hover:border-primary-500/40',
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDark ? 'moon' : 'sun'}
          initial={{ scale: 0.7, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.7, rotate: 30, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </motion.div>
      </AnimatePresence>
    </button>
  )
}

// ── User Menu ─────────────────────────────────────────────────────────────────
function UserMenu({ user, isAdmin, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const initials = (user?.full_name || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 p-1 pr-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-hover))] hover:border-primary-500/40 transition-all"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center text-[11px] font-bold text-white">
          {initials}
        </div>
        <span className="hidden md:block text-xs font-medium text-[rgb(var(--text-secondary))] max-w-[80px] truncate">
          {user?.full_name || user?.email}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-[rgb(var(--text-muted))] transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-52 glass-strong rounded-2xl shadow-lg overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-[rgb(var(--border))]">
              <p className="text-xs font-semibold text-[rgb(var(--text-primary))] truncate">{user?.full_name || 'User'}</p>
              <p className="text-[11px] text-[rgb(var(--text-muted))] truncate">{user?.email}</p>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-primary-500/10 text-primary-400 text-[10px] rounded-full border border-primary-500/20">
                  <Zap className="w-2.5 h-2.5" /> Super Admin
                </span>
              )}
            </div>
            <div className="py-1">
              {[
                { icon: User,     label: 'Profile',   action: () => {} },
                { icon: HelpCircle, label: 'Help',    action: () => {} },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={() => { action(); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors text-left"
                >
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
            <div className="py-1 border-t border-[rgb(var(--border))]">
              <button
                onClick={() => { onLogout(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-danger hover:bg-danger/8 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ to, Icon, label, badgeCount, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'nav-item relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap',
        isActive
          ? 'text-primary-500 bg-primary-500/8'
          : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]',
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}</span>
      {badgeCount > 0 && (
        <span className="min-w-[16px] h-4 flex items-center justify-center px-1 bg-danger text-white text-[9px] rounded-full font-bold animate-pulse">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </NavLink>
  )
}

// ── Mobile Drawer ─────────────────────────────────────────────────────────────
function MobileDrawer({ open, onClose, nav, getBadge }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-72 glass-strong z-50 lg:hidden flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--border))]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-[rgb(var(--text-primary))]">OpsGrid</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-muted))]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              {nav.map(({ to, Icon, label, badge, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onClose}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                      : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]',
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge && getBadge(badge) > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center px-1 bg-danger text-white text-xs rounded-full font-bold">
                      {getBadge(badge)}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { user, isAdmin, logout, api } = useAuth()
  const { status, subscribe }          = useWebSocket()
  const navigate                       = useNavigate()
  const location                       = useLocation()

  const { escalations, a2a, emails, patterns, setEscalations, setA2A, setEmails, setPatterns, incEscalations, decEscalations, incA2A, decA2A } = useBadgeStore()
  const { mobileMenuOpen, setMobileMenu } = useUIStore()

  const getBadge = useCallback((key) => {
    if (key === 'esc')     return escalations + a2a
    if (key === 'email')   return emails
    if (key === 'pattern') return patterns
    return 0
  }, [escalations, a2a, emails, patterns])

  const loadCounts = useCallback(async () => {
    try {
      const tid = user?.tenant_id
      const [escs, a2as, emls, pats] = await Promise.all([
        api.get('/escalations?status=pending').catch(() => []),
        api.get('/a2a/requests').catch(() => []),
        tid ? api.get(`/tenants/${tid}/email-queue?status=pending`).catch(() => []) : [],
        tid ? api.get(`/tenants/${tid}/patterns?status=pending_review`).catch(() => []) : [],
      ])
      setEscalations(Array.isArray(escs) ? escs.length : 0)
      setA2A(Array.isArray(a2as) ? a2as.length : 0)
      setEmails(Array.isArray(emls) ? emls.length : 0)
      setPatterns(Array.isArray(pats) ? pats.length : 0)
    } catch (_) {}
  }, [api, user?.tenant_id, setEscalations, setA2A, setEmails, setPatterns])

  useEffect(() => {
    loadCounts()
    const unsubs = [
      subscribe('escalation_created',       () => { incEscalations(); loadCounts() }),
      subscribe('escalation_resolved',      () => { decEscalations(); loadCounts() }),
      subscribe('a2a_permission_requested', () => { incA2A();         loadCounts() }),
      subscribe('a2a_decided',              () => { decA2A();         loadCounts() }),
      subscribe('workflow_completed',       loadCounts),
      subscribe('workflow_failed',          loadCounts),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [loadCounts, subscribe, incEscalations, decEscalations, incA2A, decA2A])

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  const nav = isAdmin ? ADMIN_NAV : CLIENT_NAV
  const totalBadges = escalations + a2a

  // Breadcrumb from path
  const crumbs = location.pathname.split('/').filter(Boolean).map((seg, i, arr) => ({
    label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
    path: '/' + arr.slice(0, i + 1).join('/'),
  }))

  return (
    <div className="min-h-screen surface-base flex flex-col">
      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header
        style={{ height: 'var(--nav-height)' }}
        className="fixed top-0 left-0 right-0 z-30 glass-strong border-b border-[rgb(var(--border))] flex items-center px-4 gap-4"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={() => setMobileMenu(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-muted))]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <NavLink to={isAdmin ? '/admin' : '/dashboard'} className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-primary group-hover:scale-105 transition-transform">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-bold text-[rgb(var(--text-primary))]">OpsGrid</span>
              {isAdmin && (
                <span className="ml-2 text-[10px] font-semibold text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded-full border border-primary-500/20">
                  ADMIN
                </span>
              )}
            </div>
          </NavLink>
        </div>

        {/* Nav Links — scrollable on medium screens */}
        <nav className="flex-1 hidden lg:flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0">
          {nav.map(({ to, Icon, label, badge, end }) => (
            <NavItem
              key={to}
              to={to}
              Icon={Icon}
              label={label}
              badgeCount={badge ? getBadge(badge) : 0}
              end={end || to === '/admin' || to === '/dashboard'}
            />
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto lg:ml-0">
          <WSStatus status={status} />
          <ThemeToggle />
          {totalBadges > 0 && (
            <NavLink
              to="/escalations"
              className="relative p-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-hover))] hover:border-danger/40 transition-all"
              title={`${totalBadges} pending actions`}
            >
              <Bell className="w-4 h-4 text-[rgb(var(--text-secondary))]" />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center px-1 bg-danger text-white text-[9px] rounded-full font-bold animate-pulse">
                {totalBadges}
              </span>
            </NavLink>
          )}
          <UserMenu user={user} isAdmin={isAdmin} onLogout={handleLogout} />
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenu(false)}
        nav={nav}
        getBadge={getBadge}
      />

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main
        style={{ paddingTop: 'var(--nav-height)' }}
        className="flex-1 min-h-screen"
      >
        {/* Breadcrumb */}
        {crumbs.length > 0 && (
          <div className="px-6 py-2 border-b border-[rgb(var(--border-subtle))] bg-[rgb(var(--bg-surface))]/60 text-[11px] text-[rgb(var(--text-muted))] flex items-center gap-1.5">
            <NavLink to={isAdmin ? '/admin' : '/dashboard'} className="hover:text-primary-400 transition-colors">
              Home
            </NavLink>
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-1.5">
                <span>/</span>
                {i < crumbs.length - 1
                  ? <NavLink to={c.path} className="hover:text-primary-400 transition-colors">{c.label}</NavLink>
                  : <span className="text-[rgb(var(--text-primary))] font-medium">{c.label}</span>
                }
              </span>
            ))}
          </div>
        )}

        <div className="p-6 max-w-screen-2xl mx-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  )
}