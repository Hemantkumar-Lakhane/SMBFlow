// AdminExceptions — Platform-level failures and policy escalations
// Data from: GET /api/v1/admin/exceptions
// This is NOT the SMB Owner approval queue. It covers:
//   - Failed workflow runs (system/infra errors)
//   - Policy escalations (policy_violation, provider_failure, system_error, etc.)
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertTriangle, RefreshCw, XCircle, Search,
  Zap, ShieldAlert, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/ui'

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

const SEVERITY_META = {
  error:   { cls: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500'    },
  warning: { cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
}

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] || SEVERITY_META.warning
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {severity}
    </span>
  )
}

function FailureRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0 mt-0.5">
          <Zap size={14} className="text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.workflow}</p>
              <button
                onClick={() => navigate(`/admin/organizations/${item.organization_id}`)}
                className="text-xs text-blue-600 hover:underline"
              >
                {item.organization}
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SeverityBadge severity={item.severity} />
              <span className="text-xs text-slate-400">{timeAgo(item.started_at)}</span>
            </div>
          </div>
          {item.error && (
            <p className="text-xs text-red-600 mt-1.5 font-mono line-clamp-2">{item.error}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div><span className="font-semibold text-slate-500">Run ID:</span> <span className="font-mono">{item.id}</span></div>
            <div><span className="font-semibold text-slate-500">Org ID:</span> <span className="font-mono">{item.organization_id}</span></div>
            <div><span className="font-semibold text-slate-500">Started:</span> {item.started_at ? new Date(item.started_at).toLocaleString() : '—'}</div>
          </div>
          {item.error && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Error Log</p>
              <pre className="text-xs font-mono text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{item.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PolicyRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-8 h-8 rounded-lg bg-yellow-50 border border-yellow-100 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldAlert size={14} className="text-yellow-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.review_type?.replace(/_/g, ' ')}</p>
              <button
                onClick={() => navigate(`/admin/organizations/${item.organization_id}`)}
                className="text-xs text-blue-600 hover:underline"
              >
                org: {item.organization_id?.slice(0, 8)}…
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SeverityBadge severity={item.severity} />
              <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">{item.reason}</p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div><span className="font-semibold text-slate-500">Item ID:</span> <span className="font-mono">{item.id}</span></div>
            <div><span className="font-semibold text-slate-500">Review type:</span> {item.review_type}</div>
            <div><span className="font-semibold text-slate-500">Created:</span> {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminExceptions() {
  const { api } = useAuth()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [tab, setTab]           = useState('failures')  // 'failures' | 'policy'

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await api.get('/admin/exceptions')
      setData(d)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load exceptions')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const failures = useMemo(() => {
    const list = data?.workflow_failures || []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(i =>
      i.workflow?.toLowerCase().includes(q) ||
      i.organization?.toLowerCase().includes(q) ||
      i.error?.toLowerCase().includes(q)
    )
  }, [data, search])

  const policy = useMemo(() => {
    const list = data?.policy_escalations || []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(i =>
      i.review_type?.toLowerCase().includes(q) ||
      i.reason?.toLowerCase().includes(q)
    )
  }, [data, search])

  const activeList = tab === 'failures' ? failures : policy

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Exceptions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Platform-level failures and policy escalations. Not the SMB Owner approval queue.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
        </div>
      )}

      {/* Summary cards */}
      {!loading && data && (
        <div className="grid grid-cols-2 gap-4">
          <div
            onClick={() => setTab('failures')}
            className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${tab === 'failures' ? 'border-red-200 ring-1 ring-red-200' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-2xl font-bold text-red-600">{data.workflow_failures?.length ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">Workflow Failures</p>
          </div>
          <div
            onClick={() => setTab('policy')}
            className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${tab === 'policy' ? 'border-yellow-200 ring-1 ring-yellow-200' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-2xl font-bold text-yellow-600">{data.policy_escalations?.length ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">Policy Escalations</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input type="text" placeholder="Search exceptions…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={tab === 'failures' ? 'No workflow failures' : 'No policy escalations'}
          description={search ? 'No matches for your search.' : 'Nothing to review right now.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {tab === 'failures'
            ? failures.map(item => <FailureRow key={item.id} item={item} />)
            : policy.map(item  => <PolicyRow  key={item.id} item={item} />)
          }
        </div>
      )}
    </div>
  )
}
