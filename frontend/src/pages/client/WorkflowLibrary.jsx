// frontend/src/pages/client/WorkflowLibrary.jsx
// Workflow Library — shows ONLY workflows applicable to the org's industry
// and assigned by admin.  Data: GET /api/v1/catalog/assigned
// The backend enforces industry, plan entitlement, and assignment.
// The frontend never hardcodes industry → workflow mappings.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, ArrowRight, Play, Mail, Zap, Search, RefreshCw,
  Layers, AlertTriangle, Globe, Building2,
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
function WorkflowCard({ wf, onRun, isAdmin, navigate }) {
  const displayName = getDisplayName(wf.name, wf.display_name)
  const isEmailWf   = wf.name === 'email_summarizer' || wf.name?.includes('email')
  const isLaunchWf  = wf.name === 'product_launch_sprint' || wf.name?.includes('product_launch')

  function handleRun(e) {
    e.stopPropagation()
    if (isEmailWf)  { navigate('/workflows/email_summarizer'); return }
    if (isLaunchWf) { navigate('/workflows/product_launch');   return }
    onRun(wf)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <BookOpen size={16} className="text-blue-600" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
      <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-4">
        {wf.description || 'AI-powered workflow automation.'}
      </p>
      {wf.run_count > 0 && (
        <p className="text-[11px] text-gray-400 mb-3">
          {wf.run_count} run{wf.run_count !== 1 ? 's' : ''}
          {wf.last_run_at && ` · last ${new Date(wf.last_run_at).toLocaleDateString()}`}
        </p>
      )}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={handleRun}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Play size={12} className="fill-white" /> Run Now
        </button>
        {isAdmin && (
          <button
            onClick={() => navigate(`/workflows/builder?wf=${encodeURIComponent(wf.name)}`)}
            className="flex items-center gap-1 px-3 py-2 border border-gray-200 hover:border-blue-300 text-xs font-semibold text-gray-600 hover:text-blue-600 rounded-lg transition-colors"
          >
            Configure <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, count, accentClass }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${accentClass} mb-3`}>
      <Icon size={14} />
      <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      <span className="ml-auto text-xs opacity-70">{count}</span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function NoWorkflowsAssigned() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Layers size={24} className="text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">No workflows assigned</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        Your administrator hasn't assigned any workflows to your organization yet.
        Contact your SMBFlow admin to get started.
      </p>
    </div>
  )
}

// ── Category filter pills ─────────────────────────────────────────────────────
const ALL_CATEGORIES = ['All', 'productivity', 'marketing', 'sales', 'healthcare', 'finance', 'operations', 'compliance']

// ── Main ──────────────────────────────────────────────────────────────────────
export default function WorkflowLibrary() {
  const navigate        = useNavigate()
  const { api, isAdmin, user } = useAuth()

  const [workflows,  setWorkflows]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('All')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [selectedWf, setSelectedWf] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Backend enforces: org active + subscription + plan entitlement
      // + explicit admin assignment + industry applicability.
      // Frontend receives only what this org is allowed to see.
      const data = await api.get('/catalog/assigned')
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load workflows')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  // Search operates only over workflows already returned by the backend
  // (which are already industry-filtered).  A healthcare user searching
  // "finance" will see no results — correct behavior.
  const filtered = useMemo(() => {
    let list = workflows
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
  }, [workflows, search, category])

  // Derive active categories from what's actually returned
  const activeCategories = useMemo(() => {
    const cats = new Set(workflows.map(w => w.category).filter(Boolean))
    return ALL_CATEGORIES.filter(c => c === 'All' || cats.has(c))
  }, [workflows])

  // Split into industry-specific and global groups for display
  // Only shown when not searching/filtering (to keep the grouped view clean)
  const showGrouped = !search && category === 'All'
  const industryWfs = useMemo(() => filtered.filter(w => w.scope === 'INDUSTRY'), [filtered])
  const globalWfs   = useMemo(() => filtered.filter(w => (w.scope || 'GLOBAL') === 'GLOBAL'), [filtered])

  // Derive org industry label from first industry workflow, or from user profile
  const orgIndustry = useMemo(() => {
    const industryWf = workflows.find(w => w.industry)
    return industryWf?.industry || user?.industry || null
  }, [workflows, user])

  const INDUSTRY_LABELS = {
    saas:        'SaaS / Growth',
    healthcare:  'Healthcare',
    finance:     'Finance',
    real_estate: 'Real Estate',
    retail:      'Retail',
    general:     'General',
  }

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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Loading…'
              : `${workflows.length} workflow${workflows.length !== 1 ? 's' : ''} available to your organization`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/workflows/builder')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + New Workflow
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={14} className="shrink-0" />{error}
        </div>
      )}

      {/* Search + Category filter */}
      {!loading && workflows.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-56"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {activeCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors border capitalize ${
                  category === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          <RefreshCw size={16} className="animate-spin mr-2" /> Loading workflows…
        </div>
      ) : filtered.length === 0 && workflows.length === 0 ? (
        <NoWorkflowsAssigned />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No workflows match "{search}"
          {category !== 'All' && ` in ${category}`}
        </div>
      ) : showGrouped && (industryWfs.length > 0 || globalWfs.length > 0) ? (
        // Grouped view — industry section first, then global
        <div className="flex flex-col gap-8">
          {industryWfs.length > 0 && (
            <div>
              <SectionHeader
                icon={Building2}
                title={orgIndustry ? `${INDUSTRY_LABELS[orgIndustry] || orgIndustry} Workflows` : 'Your Workflows'}
                count={`${industryWfs.length} workflow${industryWfs.length !== 1 ? 's' : ''}`}
                accentClass="bg-amber-50 text-amber-800"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {industryWfs.map(wf => (
                  <WorkflowCard key={wf.id || wf.name} wf={wf} onRun={handleRun} isAdmin={isAdmin} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {globalWfs.length > 0 && (
            <div>
              <SectionHeader
                icon={Globe}
                title="Global Workflows"
                count={`${globalWfs.length} workflow${globalWfs.length !== 1 ? 's' : ''}`}
                accentClass="bg-indigo-50 text-indigo-800"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {globalWfs.map(wf => (
                  <WorkflowCard key={wf.id || wf.name} wf={wf} onRun={handleRun} isAdmin={isAdmin} navigate={navigate} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Flat view — when searching or filtering by category
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(wf => (
            <WorkflowCard key={wf.id || wf.name} wf={wf} onRun={handleRun} isAdmin={isAdmin} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  )
}
