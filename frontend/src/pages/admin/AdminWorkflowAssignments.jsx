// AdminWorkflowAssignments — Cross-org workflow assignment matrix
// Shows which organizations have access to which workflows.
// Platform Admin can assign/revoke directly from this view.
// Data from:
//   GET /api/v1/admin/workflows/catalog
//   GET /api/v1/admin/organizations
//   GET /api/v1/admin/workflows/assignments
//   POST /api/v1/admin/organizations/:orgId/workflows/:workflowId/assign
//   DELETE /api/v1/admin/organizations/:orgId/workflows/:workflowId/assign
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GitBranch, RefreshCw, XCircle, Search, CheckCircle2,
  Plus, Minus, Building2, Layers, AlertCircle, ChevronRight,
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

// ── Assignment cell ───────────────────────────────────────────────────────────
function AssignCell({ assigned, assignmentStatus, loading, onAssign, onRevoke }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
      </div>
    )
  }

  if (assigned) {
    return (
      <button
        onClick={onRevoke}
        title="Revoke access"
        className="group flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-red-50 hover:border-red-200 transition-all"
      >
        <CheckCircle2 size={14} className="text-emerald-500 group-hover:hidden" />
        <Minus size={13} className="text-red-500 hidden group-hover:block" />
      </button>
    )
  }

  return (
    <button
      onClick={onAssign}
      title="Assign workflow"
      className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-all"
    >
      <Plus size={13} className="text-slate-400 hover:text-blue-500" />
    </button>
  )
}

// ── Org row ───────────────────────────────────────────────────────────────────
function OrgRow({ org, catalog, assignmentMap, onAssign, onRevoke, pendingCells, navigate }) {
  const assignedCount = catalog.filter(wf => assignmentMap[`${org.id}:${wf.id}`]).length

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      {/* Org info */}
      <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-100 z-10 min-w-[200px]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-700 text-xs font-bold">{(org.name || '?')[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{org.name}</p>
            <p className="text-[11px] text-slate-400">
              {org.plan_name || org.plan_slug || '—'} · {assignedCount}/{catalog.length}
            </p>
          </div>
          <button
            onClick={() => navigate(`/admin/organizations/${org.id}`)}
            className="ml-auto p-1 text-slate-300 hover:text-blue-500 transition-colors shrink-0"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </td>

      {/* Assignment cells — one per workflow */}
      {catalog.map(wf => {
        const key = `${org.id}:${wf.id}`
        const assigned = !!assignmentMap[key]
        const cellLoading = pendingCells.has(key)
        return (
          <td key={wf.id} className="px-2 py-3 text-center">
            <AssignCell
              assigned={assigned}
              loading={cellLoading}
              onAssign={() => onAssign(org.id, wf.id, key)}
              onRevoke={() => onRevoke(org.id, wf.id, key)}
            />
          </td>
        )
      })}
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminWorkflowAssignments() {
  const { api } = useAuth()
  const navigate = useNavigate()

  const [catalog, setCatalog]       = useState([])  // workflow catalog entries
  const [orgs, setOrgs]             = useState([])  // organizations
  const [assignments, setAssignments] = useState([]) // all org-workflow assignments
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [search, setSearch]         = useState('')
  const [pendingCells, setPending]  = useState(new Set())  // org:wf keys being toggled

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [cat, org, ass] = await Promise.all([
        api.get('/admin/workflows/catalog'),
        api.get('/admin/organizations'),
        api.get('/admin/workflows/assignments'),
      ])
      setCatalog(Array.isArray(cat) ? cat.filter(w => w.active) : [])
      setOrgs(Array.isArray(org) ? org : [])
      setAssignments(Array.isArray(ass) ? ass : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  // Build fast lookup: "orgId:workflowId" → assignment object
  const assignmentMap = useMemo(() => {
    const m = {}
    assignments.forEach(a => {
      if (a.status === 'active') {
        m[`${a.organization_id}:${a.workflow_id}`] = a
      }
    })
    return m
  }, [assignments])

  // Filtered orgs by search
  const filteredOrgs = useMemo(() => {
    if (!search) return orgs
    const q = search.toLowerCase()
    return orgs.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.industry?.toLowerCase().includes(q) ||
      o.plan_name?.toLowerCase().includes(q)
    )
  }, [orgs, search])

  // Column-level stats
  const catalogStats = useMemo(() => {
    return catalog.map(wf => ({
      id: wf.id,
      assignedCount: orgs.filter(o => assignmentMap[`${o.id}:${wf.id}`]).length,
    }))
  }, [catalog, orgs, assignmentMap])

  async function handleAssign(orgId, workflowId, key) {
    setPending(p => new Set(p).add(key))
    try {
      await api.post(`/admin/organizations/${orgId}/workflows/${workflowId}/assign`, {})
      // Optimistic update
      setAssignments(prev => [
        ...prev.filter(a => !(a.organization_id === orgId && a.workflow_id === workflowId)),
        { organization_id: orgId, workflow_id: workflowId, status: 'active', assigned_at: new Date().toISOString() },
      ])
    } catch (e) {
      setError(`Failed to assign: ${e?.response?.data?.detail || e.message}`)
    } finally {
      setPending(p => { const s = new Set(p); s.delete(key); return s })
    }
  }

  async function handleRevoke(orgId, workflowId, key) {
    setPending(p => new Set(p).add(key))
    try {
      await api.delete(`/admin/organizations/${orgId}/workflows/${workflowId}/assign`)
      // Optimistic update
      setAssignments(prev => prev.filter(a => !(a.organization_id === orgId && a.workflow_id === workflowId)))
    } catch (e) {
      setError(`Failed to revoke: ${e?.response?.data?.detail || e.message}`)
    } finally {
      setPending(p => { const s = new Set(p); s.delete(key); return s })
    }
  }

  const totalAssignments = assignments.filter(a => a.status === 'active').length

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Workflow Assignments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${totalAssignments} active assignment${totalAssignments !== 1 ? 's' : ''} across ${orgs.length} organization${orgs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <AlertCircle size={14} className="shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Backend enforced.</span> An organization can only execute a workflow when:
          the org is active · the subscription is active · the plan entitles the workflow · AND an explicit assignment exists here.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={15} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text" placeholder="Filter organizations…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : catalog.length === 0 ? (
        <EmptyState icon={Layers}
          title="No workflows in catalog"
          description="Add workflows to the catalog before assigning them to organizations."
          action={<button onClick={() => navigate('/admin/workflows/catalog')} className="text-sm text-blue-600 hover:underline font-medium">Go to Workflow Catalog →</button>}
        />
      ) : orgs.length === 0 ? (
        <EmptyState icon={Building2}
          title="No organizations"
          description="Create organizations to start assigning workflows."
          action={<button onClick={() => navigate('/admin/organizations')} className="text-sm text-blue-600 hover:underline font-medium">Go to Organizations →</button>}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Scrollable matrix */}
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                {/* Workflow names as column headers */}
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-white border-r border-slate-100 min-w-[200px]">
                    Organization
                  </th>
                  {catalog.map((wf, i) => {
                    const stat = catalogStats[i]
                    return (
                      <th key={wf.id} className="px-2 py-3 text-center min-w-[90px] max-w-[90px]">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className="text-[11px] font-semibold text-slate-700 leading-tight text-center break-words max-w-[80px]"
                            title={wf.name}
                          >
                            {wf.name.length > 16 ? wf.name.slice(0, 14) + '…' : wf.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {stat?.assignedCount}/{orgs.length}
                          </span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.length === 0 ? (
                  <tr>
                    <td colSpan={catalog.length + 1} className="px-5 py-12 text-center text-slate-400 text-sm">
                      No organizations match your search
                    </td>
                  </tr>
                ) : (
                  filteredOrgs.map(org => (
                    <OrgRow
                      key={org.id}
                      org={org}
                      catalog={catalog}
                      assignmentMap={assignmentMap}
                      onAssign={handleAssign}
                      onRevoke={handleRevoke}
                      pendingCells={pendingCells}
                      navigate={navigate}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-6 text-xs text-slate-500 bg-slate-50/50">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 size={11} className="text-emerald-500" />
              </span>
              Assigned (hover to revoke)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Plus size={11} className="text-slate-400" />
              </span>
              Not assigned (click to assign)
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
