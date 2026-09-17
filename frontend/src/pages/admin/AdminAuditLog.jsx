// AdminAuditLog — Platform audit event log
// Data from: GET /api/v1/admin/audit
// Fields: id, organization_id, actor_id, action, entity_type, entity_id, metadata_, created_at
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ShieldAlert, Search, RefreshCw, XCircle, Download,
  ChevronDown, ChevronUp,
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

// Action category colour coding
function actionColor(action) {
  if (!action) return 'bg-slate-100 text-slate-500'
  if (action.includes('created') || action.includes('invited'))  return 'bg-emerald-100 text-emerald-700'
  if (action.includes('updated') || action.includes('changed'))  return 'bg-blue-100 text-blue-700'
  if (action.includes('deleted') || action.includes('removed'))  return 'bg-red-100 text-red-700'
  if (action.includes('suspend') || action.includes('deactivate')) return 'bg-orange-100 text-orange-700'
  if (action.includes('assigned') || action.includes('granted'))  return 'bg-purple-100 text-purple-700'
  return 'bg-slate-100 text-slate-600'
}

// ── Event row ─────────────────────────────────────────────────────────────────
function EventRow({ event }) {
  const [expanded, setExpanded] = useState(false)
  const hasMetadata = event.metadata_ && Object.keys(event.metadata_).length > 0

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${hasMetadata ? 'cursor-pointer' : ''}`}
        onClick={() => hasMetadata && setExpanded(v => !v)}
      >
        <td className="px-4 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">
          {event.created_at
            ? new Date(event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-700">
          {event.actor_id || <span className="text-slate-400 italic">system</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${actionColor(event.action)}`}>
            {event.action}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{event.entity_type || '—'}</td>
        <td className="px-4 py-3 text-xs font-mono text-slate-400 max-w-[120px] truncate">
          {event.entity_id ? event.entity_id.slice(0, 8) + '…' : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-400">
          {timeAgo(event.created_at)}
        </td>
        <td className="px-4 py-3">
          {hasMetadata && (
            <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </td>
      </tr>
      {expanded && hasMetadata && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={7} className="px-4 py-3">
            <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(event.metadata_, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminAuditLog() {
  const { api } = useAuth()
  const [events,  setEvents]  = useState([])
  const [orgs,    setOrgs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')
  const [filterAction,   setFilterAction]   = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')
  const [filterOrg, setFilterOrg] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (filterOrg)        params.set('organization_id', filterOrg)
      if (filterAction)     params.set('action', filterAction)
      if (filterEntityType) params.set('entity_type', filterEntityType)

      const [evData, orgsData] = await Promise.all([
        api.get(`/admin/audit?${params.toString()}`),
        api.get('/admin/organizations').catch(() => []),
      ])
      setEvents(Array.isArray(evData) ? evData : [])
      setOrgs(Array.isArray(orgsData) ? orgsData : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [api, filterOrg, filterAction, filterEntityType])

  useEffect(() => { load() }, [load])

  // Client-side text search on top of server-filtered results
  const filtered = useMemo(() => {
    if (!search) return events
    const q = search.toLowerCase()
    return events.filter(e =>
      e.action?.toLowerCase().includes(q) ||
      e.actor_id?.toLowerCase().includes(q) ||
      e.entity_type?.toLowerCase().includes(q) ||
      e.entity_id?.toLowerCase().includes(q)
    )
  }, [events, search])

  // Derive unique action and entity_type values from loaded events for filter dropdowns
  const actionOptions   = useMemo(() => [...new Set(events.map(e => e.action).filter(Boolean))].sort(), [events])
  const entityOptions   = useMemo(() => [...new Set(events.map(e => e.entity_type).filter(Boolean))].sort(), [events])

  function exportCSV() {
    const rows = [
      ['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Metadata'],
      ...filtered.map(e => [
        e.created_at || '',
        e.actor_id || '',
        e.action || '',
        e.entity_type || '',
        e.entity_id || '',
        JSON.stringify(e.metadata_ || {}),
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <Download size={13} /> Export CSV
          </button>
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search actor, action, entity…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="">All organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="">All actions</option>
          {actionOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none">
          <option value="">All entity types</option>
          {entityOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No audit events"
          description="Platform audit events appear here whenever an admin performs an action." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Timestamp', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Age', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(event => (
                <EventRow key={event.id} event={event} />
              ))}
            </tbody>
          </table>
          {events.length === 500 && (
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
              Showing latest 500 events. Use filters to narrow results.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
