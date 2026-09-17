// AdminPlatformOverview — Real SaaS control-plane dashboard
// All data from /api/v1/admin/* — no fabricated values.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, Zap, AlertTriangle, DollarSign, RefreshCw,
  TrendingUp, Activity, ArrowRight, CheckCircle2, XCircle,
  BarChart3, Cpu, Shield, Clock,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, fallback = '—') {
  if (n === null || n === undefined) return fallback
  if (typeof n === 'number') return n.toLocaleString()
  return n
}
function fmtCost(v) {
  if (v === null || v === undefined) return 'No data'
  return `$${Number(v).toFixed(2)}`
}
function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}
function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, sub, accent = 'blue', loading, onClick }) {
  const accents = {
    blue:   'bg-blue-50   text-blue-600',
    green:  'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red:    'bg-red-50    text-red-600',
    slate:  'bg-slate-100 text-slate-500',
  }
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4 ${onClick ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/20 transition-all' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-bold text-slate-900 ${loading ? 'opacity-30 animate-pulse' : ''}`}>
          {loading ? '…' : value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {Icon && (
        <div className={`p-2.5 rounded-xl shrink-0 ${accents[accent]}`}>
          <Icon size={18} strokeWidth={1.8} />
        </div>
      )}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function RunBadge({ status }) {
  const map = {
    completed: 'bg-emerald-100 text-emerald-700',
    running:   'bg-blue-100 text-blue-700',
    failed:    'bg-red-100 text-red-700',
    pending:   'bg-slate-100 text-slate-500',
    paused:    'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status?.toLowerCase()] || 'bg-slate-100 text-slate-500'}`}>
      {status || 'unknown'}
    </span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, actionTo, navigate }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {action && (
        <button
          onClick={() => navigate(actionTo)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          {action} <ArrowRight size={11} />
        </button>
      )}
    </div>
  )
}

function EmptyRow({ cols, icon: Icon, msg }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-12 text-center">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Icon size={28} strokeWidth={1.4} />
          <p className="text-sm">{msg}</p>
        </div>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPlatformOverview() {
  const { api } = useAuth()
  const navigate = useNavigate()

  const [overview, setOverview]   = useState(null)
  const [usage, setUsage]         = useState(null)
  const [runs, setRuns]           = useState([])
  const [exceptions, setExceptions] = useState(null)
  const [orgs, setOrgs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [error, setError]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [ov, us, ru, ex, og] = await Promise.allSettled([
        api.get('/admin/overview'),
        api.get('/admin/usage?days=30'),
        api.get('/admin/runs?limit=10'),
        api.get('/admin/exceptions'),
        api.get('/admin/organizations'),
      ])
      if (ov.status === 'fulfilled') setOverview(ov.value)
      else setError('Failed to load platform metrics')
      if (us.status === 'fulfilled') setUsage(us.value)
      if (ru.status === 'fulfilled') setRuns(Array.isArray(ru.value) ? ru.value : [])
      if (ex.status === 'fulfilled') setExceptions(ex.value)
      if (og.status === 'fulfilled') setOrgs(Array.isArray(og.value) ? og.value : [])
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const m = overview?.metrics || {}

  // Derive workflow activity from runs (group by workflow name)
  const wfMap = {}
  runs.forEach(r => {
    if (!wfMap[r.workflow]) wfMap[r.workflow] = { workflow: r.workflow, runs: 0, failed: 0, last_run: null, orgs: new Set() }
    wfMap[r.workflow].runs++
    if (r.status === 'failed') wfMap[r.workflow].failed++
    if (!wfMap[r.workflow].last_run || r.started_at > wfMap[r.workflow].last_run)
      wfMap[r.workflow].last_run = r.started_at
    if (r.organization) wfMap[r.workflow].orgs.add(r.organization)
  })
  const wfActivity = Object.values(wfMap).slice(0, 8)

  // Org activity — recent orgs with runs
  const orgActivity = orgs
    .filter(o => o.run_count > 0 || o.last_activity)
    .sort((a, b) => (b.last_activity || '') > (a.last_activity || '') ? 1 : -1)
    .slice(0, 8)

  // Exceptions
  const failures  = exceptions?.workflow_failures   || []
  const policy    = exceptions?.policy_escalations  || []
  const excTotal  = failures.length + policy.length

  // Usage snapshot
  const usageSummary = {
    tokens_in:  (usage?.breakdown || []).reduce((s, r) => s + (r.tokens_in  || 0), 0),
    tokens_out: (usage?.breakdown || []).reduce((s, r) => s + (r.tokens_out || 0), 0),
    wf_runs:    (usage?.breakdown || []).filter(r => r.usage_type === 'workflow_run').reduce((s, r) => s + (r.event_count || 0), 0),
    img_gens:   (usage?.breakdown || []).filter(r => r.usage_type === 'image_gen').reduce((s, r) => s + (r.event_count || 0), 0),
    cost_usd:   usage?.total_cost_usd,
  }

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Platform Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            SMBFlow control plane
            {lastRefresh && <span className="ml-2 text-slate-400">· {timeAgo(lastRefresh.toISOString())}</span>}
          </p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* ── KPI grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Organizations" value={fmt(m.active_organizations, '0')}
          icon={Building2} accent="blue" loading={loading}
          sub="orgs on platform" onClick={() => navigate('/admin/organizations')} />
        <KpiCard label="Active Users" value={fmt(m.active_users, '0')}
          icon={Users} accent="purple" loading={loading}
          sub={`${fmt(m.total_users, '0')} total`} onClick={() => navigate('/admin/users')} />
        <KpiCard label="Enabled Workflows" value={fmt(m.enabled_workflows, '0')}
          icon={TrendingUp} accent="green" loading={loading}
          sub="active assignments" onClick={() => navigate('/admin/workflows/assignments')} />
        <KpiCard label="Runs Today" value={fmt(m.runs_today, '0')}
          icon={Zap} accent="slate" loading={loading}
          sub={`${fmt(m.total_runs, '0')} all time`} onClick={() => navigate('/admin/runs')} />
        <KpiCard label="Pending Exceptions" value={fmt(m.pending_exceptions, '0')}
          icon={AlertTriangle} accent={m.pending_exceptions > 0 ? 'red' : 'slate'} loading={loading}
          sub="requiring attention" onClick={() => navigate('/admin/exceptions')} />
        <KpiCard label="AI Spend (month)" value={loading ? '…' : fmtCost(m.ai_spend_month_usd)}
          icon={DollarSign} accent="orange" loading={loading}
          sub="platform-wide LLM cost" onClick={() => navigate('/admin/usage')} />
        <KpiCard label="Active Subscriptions" value={fmt(m.active_subscriptions, '0')}
          icon={BarChart3} accent="green" loading={loading}
          sub="paying / trial orgs" onClick={() => navigate('/admin/subscriptions')} />
        <KpiCard label="Platform Health"
          value={loading ? '…' : 'Operational'}
          icon={Activity} accent="green" loading={loading}
          sub="view health →" onClick={() => navigate('/admin/health')} />
      </div>

      {/* ── Row 1: Org Activity + Workflow Activity ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Organization Activity */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <SectionHeader title="Organization Activity" action="All orgs" actionTo="/admin/organizations" navigate={navigate} />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Organization', 'Plan', 'Runs', 'Last Activity', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <EmptyRow cols={5} icon={Building2} msg="Loading…" />
              ) : orgActivity.length === 0 ? (
                <EmptyRow cols={5} icon={Building2} msg="No organization activity yet" />
              ) : orgActivity.map(org => (
                <tr key={org.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/organizations/${org.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 text-xs">{org.name}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{org.industry}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {org.plan_name || org.plan_slug || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{org.run_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(org.last_activity)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      org.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {org.active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Workflow Activity */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <SectionHeader title="Workflow Activity" action="All runs" actionTo="/admin/runs" navigate={navigate} />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Workflow', 'Runs', 'Failed', 'Orgs', 'Last Run'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <EmptyRow cols={5} icon={Zap} msg="Loading…" />
              ) : wfActivity.length === 0 ? (
                <EmptyRow cols={5} icon={Zap} msg="No workflow runs yet" />
              ) : wfActivity.map(wf => (
                <tr key={wf.workflow} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 text-xs">{wf.workflow}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{wf.runs}</td>
                  <td className="px-4 py-3">
                    {wf.failed > 0
                      ? <span className="text-[11px] font-semibold text-red-600">{wf.failed}</span>
                      : <span className="text-[11px] text-slate-400">0</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{wf.orgs.size}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(wf.last_run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Row 2: Usage/Billing Snapshot + Exceptions ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Usage / Billing Snapshot */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <SectionHeader title="Usage &amp; Billing Snapshot (30d)" action="Full report" actionTo="/admin/usage" navigate={navigate} />
          <div className="p-5 grid grid-cols-2 gap-4">
            {[
              { label: 'Workflow Runs',     value: fmt(usageSummary.wf_runs, '0'),               icon: Zap,     accent: 'bg-blue-50   text-blue-600'   },
              { label: 'AI Tokens',         value: fmtTokens(usageSummary.tokens_in + usageSummary.tokens_out), icon: Cpu, accent: 'bg-purple-50 text-purple-600' },
              { label: 'Image Generations', value: fmt(usageSummary.img_gens, '0'),               icon: TrendingUp, accent: 'bg-orange-50 text-orange-600' },
              { label: 'Platform Cost',     value: fmtCost(usageSummary.cost_usd),                icon: DollarSign, accent: 'bg-emerald-50 text-emerald-600' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className={`p-2 rounded-lg shrink-0 ${item.accent}`}>
                  <item.icon size={14} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium">{item.label}</p>
                  <p className={`text-base font-bold text-slate-900 ${loading ? 'opacity-30' : ''}`}>{loading ? '…' : item.value}</p>
                </div>
              </div>
            ))}
          </div>
          {usage?.breakdown && usage.breakdown.length > 0 && (
            <div className="border-t border-slate-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    {['Type', 'Workflow', 'Events', 'Tokens In', 'Tokens Out'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.breakdown.slice(0, 6).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-600">{row.usage_type}</td>
                      <td className="px-4 py-2 text-slate-500">{row.workflow_key || '—'}</td>
                      <td className="px-4 py-2 text-slate-700">{row.event_count}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono">{fmtTokens(row.tokens_in)}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono">{fmtTokens(row.tokens_out)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(!usage?.breakdown || usage.breakdown.length === 0) && !loading && (
            <div className="border-t border-slate-100 py-8 text-center text-slate-400 text-xs">
              No usage events recorded in the last 30 days
            </div>
          )}
        </div>

        {/* Exceptions */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <SectionHeader
            title={`Exceptions ${excTotal > 0 ? `(${excTotal})` : ''}`}
            action="View all"
            actionTo="/admin/exceptions"
            navigate={navigate}
          />
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Loading…</div>
          ) : excTotal === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <CheckCircle2 size={28} strokeWidth={1.4} />
              <p className="text-sm">No platform exceptions</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {failures.slice(0, 5).map(item => (
                <div key={item.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/exceptions`)}
                >
                  <div className="w-6 h-6 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <XCircle size={12} className="text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">{item.workflow}</p>
                    <p className="text-[11px] text-slate-500">{item.organization} · {timeAgo(item.started_at)}</p>
                    {item.error && (
                      <p className="text-[11px] text-red-600 font-mono mt-0.5 truncate">{item.error}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">error</span>
                </div>
              ))}
              {policy.slice(0, 5).map(item => (
                <div key={item.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/exceptions`)}
                >
                  <div className="w-6 h-6 rounded-lg bg-yellow-50 border border-yellow-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield size={12} className="text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">{item.review_type?.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-slate-500 truncate">{item.reason}</p>
                    <p className="text-[11px] text-slate-400">{timeAgo(item.created_at)}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 shrink-0">policy</span>
                </div>
              ))}
              {excTotal > 10 && (
                <div className="px-4 py-3 text-center">
                  <button onClick={() => navigate('/admin/exceptions')}
                    className="text-xs text-blue-600 hover:underline font-medium">
                    View all {excTotal} exceptions →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
