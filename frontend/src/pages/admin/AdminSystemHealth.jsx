// AdminSystemHealth — Platform service health
// Data from: GET /api/v1/admin/health  (admin-only, does real connectivity checks)
// Returns: { overall, services: { database, redis, ai_providers, workflow_engine }, checked_at }
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Database, Layers, Cpu, GitBranch,
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Minus,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META = {
  operational:    { label: 'Operational',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  degraded:       { label: 'Degraded',       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',   dot: 'bg-yellow-500', icon: AlertTriangle },
  unavailable:    { label: 'Unavailable',    cls: 'bg-red-100 text-red-700 border-red-200',             dot: 'bg-red-500',    icon: XCircle },
  not_configured: { label: 'Not Configured', cls: 'bg-slate-100 text-slate-500 border-slate-200',      dot: 'bg-slate-300',  icon: Minus },
  configured:     { label: 'Configured',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  partial:        { label: 'Partial',        cls: 'bg-orange-100 text-orange-700 border-orange-200',   dot: 'bg-orange-400', icon: AlertTriangle },
  unknown:        { label: 'Unknown',        cls: 'bg-slate-100 text-slate-500 border-slate-200',      dot: 'bg-slate-300',  icon: HelpCircle },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.cls}`}>
      <Icon size={11} strokeWidth={2} />
      {m.label}
    </span>
  )
}

function StatusDot({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown
  return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
}

// ── Overall banner ─────────────────────────────────────────────────────────────
function OverallBanner({ overall, checkedAt }) {
  const m = STATUS_META[overall] || STATUS_META.unknown
  const Icon = m.icon
  const bannerCls = {
    operational:    'bg-emerald-50 border-emerald-200 text-emerald-800',
    degraded:       'bg-yellow-50  border-yellow-200  text-yellow-800',
    unavailable:    'bg-red-50     border-red-200     text-red-800',
    partial:        'bg-orange-50  border-orange-200  text-orange-800',
  }[overall] || 'bg-slate-50 border-slate-200 text-slate-700'

  return (
    <div className={`flex items-center justify-between px-5 py-4 border rounded-xl ${bannerCls}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} strokeWidth={1.8} />
        <div>
          <p className="text-sm font-bold">Platform Status: {m.label}</p>
          {checkedAt && (
            <p className="text-xs opacity-70 mt-0.5">
              Last checked {new Date(checkedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({ title, subtitle, icon: Icon, status, extra }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-slate-500" />
        </div>
        <StatusBadge status={status} />
      </div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      {extra && (
        <p className="text-xs text-slate-400 mt-2 font-mono truncate">{extra}</p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminSystemHealth() {
  const { api } = useAuth()
  const [health,  setHealth]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await api.get('/admin/health')
      setHealth(d)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const services = health?.services || {}
  const aiProviders = services.ai_providers || {}

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Platform Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live connectivity checks for all platform services</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={14} className="shrink-0" />{error}
        </div>
      )}

      {loading && !health ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Checking services…</div>
      ) : health ? (
        <>
          {/* Overall banner */}
          <OverallBanner overall={health.overall} checkedAt={health.checked_at} />

          {/* Core services */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ServiceCard
              title="Database"
              subtitle="PostgreSQL — primary data store"
              icon={Database}
              status={services.database?.status}
              extra={services.database?.error}
            />
            <ServiceCard
              title="Redis / PubSub"
              subtitle="Cache and real-time event bus"
              icon={Layers}
              status={services.redis?.status}
              extra={services.redis?.error}
            />
            <ServiceCard
              title="Workflow Engine"
              subtitle="Orchestration runtime"
              icon={GitBranch}
              status={services.workflow_engine?.status}
              extra={
                services.workflow_engine?.stuck_runs > 0
                  ? `${services.workflow_engine.stuck_runs} stuck run${services.workflow_engine.stuck_runs !== 1 ? 's' : ''} (>2h)`
                  : services.workflow_engine?.error
              }
            />
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Cpu size={16} className="text-slate-500" />
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {Object.values(aiProviders).filter(p => p?.configured).length}/{Object.keys(aiProviders).length} configured
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">AI Providers</h3>
              <p className="text-xs text-slate-500 mt-0.5">LLM and image generation</p>
            </div>
          </div>

          {/* AI Providers detail */}
          {Object.keys(aiProviders).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">AI Provider Details</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {Object.entries(aiProviders).map(([id, info]) => (
                  <div key={id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <StatusDot status={info?.status} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{info?.label || id}</p>
                        <p className="text-xs text-slate-400 font-mono">{id}</p>
                      </div>
                    </div>
                    <StatusBadge status={info?.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
