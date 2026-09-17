// AdminUsageCost — Usage & Metering
// Data from: GET /api/v1/admin/usage?days=N (platform-wide)
//            GET /api/v1/admin/usage/:orgId?days=N (per-org drill-down)
// No legacy god-view or fleet endpoints used.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, RefreshCw, XCircle, Search,
  DollarSign, Zap, Cpu, Image, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtCost(v) {
  if (v === null || v === undefined) return 'No data'
  return `$${Number(v).toFixed(4)}`
}
function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
function fmt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

const DAYS_OPTIONS = [7, 14, 30, 60, 90]

// ── Summary card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, icon: Icon, accent = 'slate', note }) {
  const accents = {
    blue:   'bg-blue-50   text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    green:  'bg-emerald-50 text-emerald-600',
    slate:  'bg-slate-100  text-slate-500',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-xl shrink-0 ${accents[accent]}`}>
        <Icon size={17} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
      </div>
    </div>
  )
}

// ── Usage breakdown table ─────────────────────────────────────────────────────
function UsageTable({ rows, loading }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.usage_type?.toLowerCase().includes(q) ||
      r.workflow_key?.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Usage Breakdown</h2>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text" placeholder="Filter…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 w-44"
          />
        </div>
      </div>
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          {rows.length === 0 ? 'No usage events in this period' : 'No results for your filter'}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {['Usage Type', 'Workflow', 'Events', 'Tokens In', 'Tokens Out', 'Quantity'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-slate-700">{row.usage_type}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{row.workflow_key || '—'}</td>
                <td className="px-5 py-3 text-sm font-medium text-slate-800">{fmt(row.event_count)}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{fmtTokens(row.tokens_in)}</td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{fmtTokens(row.tokens_out)}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{fmt(row.total_quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Per-org usage drill-down ──────────────────────────────────────────────────
function OrgUsageTable({ orgs, days, api, navigate }) {
  const [orgUsage, setOrgUsage] = useState({})
  const [loading, setLoading]   = useState({})

  async function loadOrg(orgId) {
    if (orgUsage[orgId] !== undefined) return
    setLoading(l => ({ ...l, [orgId]: true }))
    try {
      const d = await api.get(`/admin/usage/${orgId}?days=${days}`)
      setOrgUsage(u => ({ ...u, [orgId]: d }))
    } catch {
      setOrgUsage(u => ({ ...u, [orgId]: null }))
    } finally {
      setLoading(l => ({ ...l, [orgId]: false }))
    }
  }

  const [expanded, setExpanded] = useState(null)
  function toggle(orgId) {
    if (expanded === orgId) { setExpanded(null); return }
    setExpanded(orgId)
    loadOrg(orgId)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Usage by Organization</h2>
        <p className="text-xs text-slate-400 mt-0.5">Click to expand per-org breakdown</p>
      </div>
      {orgs.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">No organizations</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {orgs.map(org => (
            <div key={org.id}>
              <div
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => toggle(org.id)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-700 text-xs font-bold">{(org.name || '?')[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{org.name}</p>
                    <p className="text-xs text-slate-400">{org.run_count ?? 0} runs · {org.plan_name || org.plan_slug || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-slate-500 font-mono">
                    {org.total_spend_usd !== null && org.total_spend_usd !== undefined
                      ? `$${Number(org.total_spend_usd).toFixed(4)}`
                      : 'No cost data'}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/admin/organizations/${org.id}`) }}
                    className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                    title="View org"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <span className={`text-slate-400 transition-transform ${expanded === org.id ? 'rotate-90' : ''}`}>
                    <ChevronRight size={13} />
                  </span>
                </div>
              </div>

              {expanded === org.id && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                  {loading[org.id] ? (
                    <p className="text-xs text-slate-400 text-center py-4">Loading usage…</p>
                  ) : !orgUsage[org.id] ? (
                    <p className="text-xs text-slate-400 text-center py-4">No usage data for this organization</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Total Cost', value: fmtCost(orgUsage[org.id].total_cost_usd) },
                          { label: 'Reported Events', value: fmt(orgUsage[org.id].reported_events) },
                          { label: 'Unreported Events', value: fmt(orgUsage[org.id].unreported_events) },
                        ].map(item => (
                          <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-3">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {orgUsage[org.id].breakdown?.length > 0 && (
                        <table className="w-full text-xs bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              {['Type', 'Workflow', 'Events', 'Tokens In', 'Tokens Out'].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orgUsage[org.id].breakdown.map((row, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 font-mono text-slate-600">{row.usage_type}</td>
                                <td className="px-3 py-2 text-slate-500">{row.workflow_key || '—'}</td>
                                <td className="px-3 py-2 text-slate-700">{fmt(row.event_count)}</td>
                                <td className="px-3 py-2 font-mono text-slate-500">{fmtTokens(row.tokens_in)}</td>
                                <td className="px-3 py-2 font-mono text-slate-500">{fmtTokens(row.tokens_out)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminUsageCost() {
  const { api } = useAuth()
  const navigate = useNavigate()

  const [days, setDays]         = useState(30)
  const [usage, setUsage]       = useState(null)
  const [orgs, setOrgs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [u, o] = await Promise.all([
        api.get(`/admin/usage?days=${days}`),
        api.get('/admin/organizations').catch(() => []),
      ])
      setUsage(u)
      setOrgs(Array.isArray(o) ? o : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load usage data')
    } finally {
      setLoading(false) }
  }, [api, days])

  useEffect(() => { load() }, [load])

  // Aggregate summary metrics from breakdown
  const summary = useMemo(() => {
    const b = usage?.breakdown || []
    return {
      wf_runs:    b.filter(r => r.usage_type === 'workflow_run').reduce((s, r) => s + (r.event_count || 0), 0),
      tokens_in:  b.reduce((s, r) => s + (r.tokens_in  || 0), 0),
      tokens_out: b.reduce((s, r) => s + (r.tokens_out || 0), 0),
      img_gens:   b.filter(r => r.usage_type === 'image_gen').reduce((s, r) => s + (r.event_count || 0), 0),
      cost:       usage?.total_cost_usd,
    }
  }, [usage])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Usage &amp; Metering</h1>
          <p className="text-sm text-slate-500 mt-0.5">Platform-wide AI usage, token consumption, and cost</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none"
          >
            {DAYS_OPTIONS.map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Workflow Runs" value={loading ? '…' : fmt(summary.wf_runs)}
          icon={Zap} accent="blue" note={`last ${days} days`} />
        <MetricCard label="AI Tokens In" value={loading ? '…' : fmtTokens(summary.tokens_in)}
          icon={Cpu} accent="purple" note="prompt tokens" />
        <MetricCard label="AI Tokens Out" value={loading ? '…' : fmtTokens(summary.tokens_out)}
          icon={Cpu} accent="slate" note="completion tokens" />
        <MetricCard label="Platform Cost" value={loading ? '…' : fmtCost(summary.cost)}
          icon={DollarSign} accent="green" note="reported events only" />
      </div>

      {/* Reported/unreported note */}
      {!loading && usage && (
        <div className="flex items-center gap-4 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600">
          <span><span className="font-semibold">{fmt(usage.reported_events)}</span> events with cost data</span>
          <span className="text-slate-300">·</span>
          <span><span className="font-semibold">{fmt(usage.unreported_events)}</span> events without cost (provider did not report)</span>
        </div>
      )}

      {/* Platform breakdown table */}
      <UsageTable rows={usage?.breakdown || []} loading={loading} />

      {/* Per-org drill-down */}
      <OrgUsageTable orgs={orgs} days={days} api={api} navigate={navigate} />
    </div>
  )
}
