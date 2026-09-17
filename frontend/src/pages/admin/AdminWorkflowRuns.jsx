// AdminWorkflowRuns — Platform-wide workflow run monitoring
// Data from: GET /api/v1/admin/runs  (platform admin endpoint, org-joined)
// GET /api/v1/admin/runs/:runId for detail + agent_runs
// No legacy /workflows, /admin/god-view, or /tenants endpoints used.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Zap, Search, RefreshCw, Building2, XCircle,
  CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp,
  ArrowLeft, Cpu, DollarSign,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(v) {
  if (v === null || v === undefined) return '—'
  return `$${Number(v).toFixed(4)}`
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    completed:   'bg-emerald-100 text-emerald-700',
    running:     'bg-blue-100 text-blue-700',
    failed:      'bg-red-100 text-red-700',
    pending:     'bg-slate-100 text-slate-500',
    escalated:   'bg-orange-100 text-orange-700',
    pending_a2a: 'bg-yellow-100 text-yellow-700',
    paused:      'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] || 'bg-slate-100 text-slate-500'}`}>
      {status || 'unknown'}
    </span>
  )
}

// ── Run detail drawer ─────────────────────────────────────────────────────────
function RunDetail({ runId, api, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    api.get(`/admin/runs/${runId}`)
      .then(d => setDetail(d))
      .catch(e => setError(e?.response?.data?.detail || e.message || 'Failed to load run'))
      .finally(() => setLoading(false))
  }, [runId, api])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {loading ? 'Loading…' : detail?.workflow || 'Run Detail'}
              </p>
              <p className="text-xs font-mono text-slate-400">{runId?.slice(0, 8)}…</p>
            </div>
          </div>
          {detail && <StatusBadge status={detail.status} />}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
          ) : error ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <XCircle size={14} />{error}
            </div>
          ) : detail ? (
            <div className="flex flex-col gap-5">
              {/* Meta grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Organization', value: detail.organization },
                  { label: 'Duration',     value: fmtDuration(detail.duration_ms) },
                  { label: 'Tokens In',    value: fmtTokens(detail.tokens_in) },
                  { label: 'Tokens Out',   value: fmtTokens(detail.tokens_out) },
                  { label: 'Cost',         value: fmtCost(detail.cost_usd) },
                  { label: 'Started',      value: detail.started_at ? new Date(detail.started_at).toLocaleString() : '—' },
                  { label: 'Completed',    value: detail.completed_at ? new Date(detail.completed_at).toLocaleString() : '—' },
                  { label: 'Node',         value: detail.current_node || '—' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Error log */}
              {detail.error_log && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Error Log</p>
                  <pre className="text-xs font-mono text-red-700 bg-red-50 border border-red-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                    {detail.error_log}
                  </pre>
                </div>
              )}

              {/* Agent runs */}
              {detail.agent_runs?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Agent Runs ({detail.agent_runs.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {detail.agent_runs.map((ar, i) => (
                      <div key={ar.id || i} className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                            <Cpu size={11} className="text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{ar.node_id || ar.agent_capability}</p>
                            <p className="text-[11px] text-slate-400">{ar.model_used || '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
                          <span>{fmtTokens((ar.tokens_in || 0) + (ar.tokens_out || 0))} tok</span>
                          <span>{fmtCost(ar.cost_usd)}</span>
                          <StatusBadge status={ar.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminWorkflowRuns() {
  const { api } = useAuth()
  const [runs, setRuns]         = useState([])
  const [orgs, setOrgs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orgFilter, setOrgFilter]       = useState('all')
  const [detailRunId, setDetailRunId]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [runsData, orgsData] = await Promise.all([
        api.get('/admin/runs?limit=200'),
        api.get('/admin/organizations').catch(() => []),
      ])
      setRuns(Array.isArray(runsData) ? runsData : [])
      setOrgs(Array.isArray(orgsData) ? orgsData : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load runs')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = runs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.run_id?.toLowerCase().includes(q) ||
        r.workflow?.toLowerCase().includes(q) ||
        r.organization?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter)
    if (orgFilter    !== 'all') list = list.filter(r => r.organization_id === orgFilter)
    return list
  }, [runs, search, statusFilter, orgFilter])

  // Summary counts
  const counts = useMemo(() => ({
    total:     runs.length,
    completed: runs.filter(r => r.status === 'completed').length,
    running:   runs.filter(r => r.status === 'running').length,
    failed:    runs.filter(r => r.status === 'failed').length,
  }), [runs])

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {detailRunId && (
        <RunDetail runId={detailRunId} api={api} onClose={() => setDetailRunId(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Workflow Runs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${runs.length} run${runs.length !== 1 ? 's' : ''} across all organizations`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total',     value: counts.total,     cls: 'text-slate-900'    },
            { label: 'Completed', value: counts.completed, cls: 'text-emerald-600'  },
            { label: 'Running',   value: counts.running,   cls: 'text-blue-600'     },
            { label: 'Failed',    value: counts.failed,    cls: 'text-red-600'      },
          ].map(c => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search by run ID, workflow, or org…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All statuses</option>
          {['completed','running','failed','pending','escalated','paused'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="all">All organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Zap} title="No runs found"
          description={search || statusFilter !== 'all' || orgFilter !== 'all' ? 'Try a different filter.' : 'No workflow runs yet.'} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Run ID', 'Workflow', 'Organization', 'Status', 'Duration', 'Tokens', 'Cost', 'Started', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => (
                <tr key={r.run_id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setDetailRunId(r.run_id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">
                    {r.run_id?.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-slate-900 max-w-[140px] truncate">{r.workflow}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                      <Building2 size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate max-w-[120px]">{r.organization || 'Unknown'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDuration(r.duration_ms)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{fmtTokens(r.tokens)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-800 font-mono">{fmtCost(r.cost_usd)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{timeAgo(r.started_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); setDetailRunId(r.run_id) }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
