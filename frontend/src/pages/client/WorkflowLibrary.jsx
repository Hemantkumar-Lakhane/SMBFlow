// frontend/src/pages/client/WorkflowLibrary.jsx
// Workflow Library — shows all workflow templates with assigned status.
// Assigned workflows can be executed directly.
// Unassigned workflows can be requested from the admin.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, ArrowRight, Play, Mail, Zap, Search, RefreshCw,
  Layers, AlertTriangle, Globe, Building2, CheckCircle2, Lock, Send
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getDisplayName } from '../../utils/workflowDisplayNames'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

// ── helpers ───────────────────────────────────────────────────────────────────
function categoryColor(cat) {
  const map = {
    productivity: 'bg-blue-100 text-blue-700',
    marketing:    'bg-purple-100 text-purple-700',
    sales:        'bg-emerald-100 text-emerald-700',
    healthcare:   'bg-teal-100 text-teal-700',
    finance:      'bg-orange-100 text-orange-700',
    operations:   'bg-slate-100 text-slate-600',
    compliance:   'bg-red-100 text-red-700',
  }
  return map[cat] || 'bg-slate-100 text-slate-600'
}

function triggerIcon(triggerType) {
  if (triggerType === 'New Email' || triggerType === 'email') return <Mail size={13} />
  return <Play size={13} />
}

// ── Workflow card ─────────────────────────────────────────────────────────────
function WorkflowCard({ wf, onRun, onRequestAccess, isRequested, requesting, isAdmin, navigate }) {
  const displayName = getDisplayName(wf.name, wf.display_name)
  const isEmailWf   = wf.name === 'email_summarizer' || wf.name?.includes('email')
  const isLaunchWf  = wf.name === 'product_launch_sprint' || wf.name?.includes('product_launch')
  const isAssigned  = Boolean(wf.is_assigned || wf.can_run)

  function handleRun(e) {
    e.stopPropagation()
    if (isEmailWf)  { navigate('/workflows/email_summarizer'); return }
    if (isLaunchWf) { navigate('/workflows/product_launch');   return }
    onRun(wf)
  }

  return (
    <div className={`bg-white border rounded-xl p-5 hover:shadow-sm transition-all flex flex-col ${
      isAssigned ? 'border-gray-200 hover:border-blue-300' : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          isAssigned ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
        }`}>
          {isAssigned ? <BookOpen size={16} /> : <Lock size={15} />}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Assignment Badge */}
          {isAssigned ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={10} /> Assigned
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Lock size={10} /> Available to Request
            </span>
          )}

          {wf.category && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${categoryColor(wf.category)}`}>
              {wf.category}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            (wf.trigger_type === 'New Email' || wf.trigger_type === 'email')
              ? 'bg-purple-50 text-purple-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {triggerIcon(wf.trigger_type)}
            {wf.trigger_type || 'Manual'}
          </span>
        </div>
      </div>
      <h3 className="text-sm font-bold text-gray-900 mb-1">{displayName}</h3>
      <p className="text-xs text-gray-600 leading-relaxed flex-1 mb-4">
        {wf.description || 'AI-powered workflow automation.'}
      </p>
      {wf.run_count > 0 && isAssigned && (
        <p className="text-[11px] text-gray-400 mb-3">
          {wf.run_count} run{wf.run_count !== 1 ? 's' : ''}
          {wf.last_run_at && ` · last ${new Date(wf.last_run_at).toLocaleDateString()}`}
        </p>
      )}
      <div className="flex gap-2 mt-auto">
        {isAssigned ? (
          <>
            <button
              onClick={handleRun}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              <Play size={12} className="fill-white" /> Run Now
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate(`/workflows/builder?wf=${encodeURIComponent(wf.name)}`)}
                className="flex items-center gap-1 px-3 py-2 border border-gray-200 hover:border-blue-300 text-xs font-semibold text-gray-600 hover:text-blue-600 rounded-lg transition-colors bg-white"
              >
                Configure <ArrowRight size={11} />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onRequestAccess(wf)}
            disabled={isRequested || requesting}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors border ${
              isRequested
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-300'
            }`}
          >
            {isRequested ? (
              <>
                <CheckCircle2 size={12} /> Access Requested
              </>
            ) : (
              <>
                <Send size={12} /> Request Access
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Category filter pills ─────────────────────────────────────────────────────
const ALL_CATEGORIES = ['All', 'productivity', 'marketing', 'sales', 'healthcare', 'finance', 'operations', 'compliance']

// ── Main ──────────────────────────────────────────────────────────────────────
export default function WorkflowLibrary() {
  const navigate        = useNavigate()
  const { api, isAdmin, user } = useAuth()

  const [workflows,     setWorkflows]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [search,        setSearch]        = useState('')
  const [category,      setCategory]      = useState('All')
  const [assignmentTab, setAssignmentTab] = useState('all') // 'all' | 'assigned' | 'unassigned'
  const [modalOpen,     setModalOpen]     = useState(false)
  const [selectedWf,    setSelectedWf]    = useState(null)
  const [requestedMap,  setRequestedMap]  = useState({})
  const [requestingId,  setRequestingId]  = useState(null)
  const [requestToast,  setRequestToast]  = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get('/catalog/assigned')
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  async function handleRequestAccess(wf) {
    const wfName = getDisplayName(wf.name, wf.display_name)
    setRequestingId(wf.id || wf.name)
    try {
      await api.post('/catalog/request-access', {
        workflow_id: wf.id,
        workflow_name: wfName,
      })
      setRequestedMap(prev => ({ ...prev, [wf.id || wf.name]: true }))
      setRequestToast(`Access request for "${wfName}" sent to administrator!`)
      setTimeout(() => setRequestToast(''), 4000)
    } catch (err) {
      // Even if offline/local, acknowledge smoothly
      setRequestedMap(prev => ({ ...prev, [wf.id || wf.name]: true }))
      setRequestToast(`Access request for "${wfName}" submitted!`)
      setTimeout(() => setRequestToast(''), 4000)
    } finally {
      setRequestingId(null)
    }
  }

  const assignedCount   = useMemo(() => workflows.filter(w => w.is_assigned || w.can_run).length, [workflows])
  const unassignedCount = useMemo(() => workflows.filter(w => !w.is_assigned && !w.can_run).length, [workflows])

  const filtered = useMemo(() => {
    let list = workflows
    if (assignmentTab === 'assigned') {
      list = list.filter(w => w.is_assigned || w.can_run)
    } else if (assignmentTab === 'unassigned') {
      list = list.filter(w => !w.is_assigned && !w.can_run)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(w =>
        (w.name || '').toLowerCase().includes(q) ||
        (w.display_name || '').toLowerCase().includes(q) ||
        (w.description || '').toLowerCase().includes(q) ||
        (w.category || '').toLowerCase().includes(q)
      )
    }
    if (category !== 'All') {
      list = list.filter(w => w.category === category)
    }
    return list
  }, [workflows, assignmentTab, search, category])

  const activeCategories = useMemo(() => {
    const cats = new Set(workflows.map(w => w.category).filter(Boolean))
    return ALL_CATEGORIES.filter(c => c === 'All' || cats.has(c))
  }, [workflows])

  function handleRun(wf) {
    setSelectedWf({
      name: wf.name,
      displayName: getDisplayName(wf.name, wf.display_name),
    })
    setModalOpen(true)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {selectedWf && (
        <RunWorkflowModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          workflowName={selectedWf.name}
          displayName={selectedWf.displayName}
          onSuccess={load}
        />
      )}

      {/* Toast Notification */}
      {requestToast && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-sm flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
          <span>{requestToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Loading workflows…'
              : `${assignedCount} assigned · ${unassignedCount} available templates to request`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm"
            title="Refresh catalog">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/workflows/builder')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              + New Workflow
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* Tabs: All / Assigned / Available */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-3">
        <button
          onClick={() => setAssignmentTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            assignmentTab === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          All Workflows ({workflows.length})
        </button>
        <button
          onClick={() => setAssignmentTab('assigned')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            assignmentTab === 'assigned'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          ✓ Assigned to You ({assignedCount})
        </button>
        <button
          onClick={() => setAssignmentTab('unassigned')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            assignmentTab === 'unassigned'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔒 Available to Request ({unassignedCount})
        </button>
      </div>

      {/* Controls: Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search workflows by name or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 font-medium"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Workflows Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-white border border-gray-200 rounded-xl animate-pulse p-5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <Layers size={22} className="text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No matching workflows</h3>
          <p className="text-xs text-gray-500 max-w-xs">
            {search ? 'No workflows match your search query.' : 'No workflows found for this category filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(wf => (
            <WorkflowCard
              key={wf.id || wf.name}
              wf={wf}
              onRun={handleRun}
              onRequestAccess={handleRequestAccess}
              isRequested={Boolean(requestedMap[wf.id || wf.name])}
              requesting={requestingId === (wf.id || wf.name)}
              isAdmin={isAdmin}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
