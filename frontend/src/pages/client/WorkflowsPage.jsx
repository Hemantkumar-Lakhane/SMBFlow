// frontend/src/pages/client/WorkflowsPage.jsx
// Workflows list & monitor — manage automations, trigger runs, and inspect executions

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Play, Mail, Zap, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, Layers, ArrowRight, Activity,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost, fmtTokens } from '../../utils/helpers'
import { getDisplayName } from '../../utils/workflowDisplayNames'
import { Modal } from '../../components/ui'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

const STATUS_OPTS = ['All statuses', 'active', 'draft', 'paused', 'stopped']

function StatusBadge({ status }) {
  const map = {
    active:    'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    draft:     'bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#233048]',
    paused:    'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    stopped:   'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800/60',
    running:   'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
    completed: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    failed:    'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800/60',
  }
  const s = (status || 'draft').toLowerCase()
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${map[s] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s === 'active' || s === 'completed' ? 'bg-emerald-500' : s === 'draft' ? 'bg-slate-400' : s === 'paused' ? 'bg-amber-500' : s === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  )
}

function TriggerBadge({ triggerType }) {
  const isEmail = triggerType === 'New Email' || triggerType === 'email'
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border bg-blue-50 dark:bg-[#182234] text-blue-700 dark:text-blue-300 border-blue-200 dark:border-[#233048]">
      {isEmail ? <Mail className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      {triggerType || 'Manual'}
    </span>
  )
}

export default function WorkflowsPage() {
  const navigate      = useNavigate()
  const { api, isAdmin } = useAuth()
  const [workflows,   setWorkflows]   = useState([])
  const [instances,   setInstances]   = useState([])
  const [search,      setSearch]      = useState('')
  const [statusFilter,setStatusFilter] = useState('All statuses')
  const [categoryFilter,setCategoryFilter] = useState('All categories')
  const [activeTab,   setActiveTab]   = useState('workflows') // 'workflows' | 'runs'
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [targetWf,    setTargetWf]    = useState({ name: 'email_summarizer', displayName: 'Email Summarizer' })
  const [selectModalOpen, setSelectModalOpen] = useState(false)
  const openSelectModal = () => setSelectModalOpen(true)

  const load = useCallback(async () => {
    try {
      const [catalog, runs] = await Promise.all([
        // /api/v1/catalog/assigned is assignment-enforced: admins get full catalog,
        // org users get only their assigned + entitled workflows
        api.get('/catalog/assigned').catch(() => []),
        api.get('/api/v1/workflow-instances').catch(() => []),
      ])
      setWorkflows(Array.isArray(catalog) ? catalog : [])
      setInstances(Array.isArray(runs) ? runs : [])
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  // Enrich DAGs with run stats
  const enriched = workflows.map(wf => {
    const wfRuns = instances.filter(i => i.workflow_name === wf.name)
    const completed = wfRuns.filter(i => i.status === 'completed' || i.status === 'WorkflowStatus.COMPLETED')
    const lastRun   = [...wfRuns].sort((a,b) => new Date(b.started_at) - new Date(a.started_at))[0]
    const successRate = wfRuns.length > 0 ? Math.round((completed.length / wfRuns.length) * 100) : null
    const totalCost = wfRuns.reduce((s, r) => s + (r.total_cost_usd || 0), 0)
    const isEmail = wf.name === 'email_summarizer' || wf.name?.includes('email')
    return {
      ...wf,
      totalRuns: wfRuns.length,
      successRate,
      lastRun,
      totalCost,
      category: wf.category || (wf.name === 'finance_operations' ? 'finance' : wf.name === 'medical_journey_operations' ? 'healthcare' : isEmail ? 'productivity' : 'marketing'),
      displayStatus: wf.status || 'active',
      triggerType: wf.trigger_type || (isEmail ? 'New Email' : 'Manual'),
      source: wf.source || (isEmail ? 'Synthetic Inbox' : 'Direct'),
      automationStatus: wf.automation_status || (isEmail ? 'Enabled' : 'Configured'),
    }
  })

  const filteredWorkflows = enriched.filter(w => {
    const norm = (str) => (str || '').toLowerCase().replace(/[\s_]+/g, '')
    const normSearch = norm(search)
    const matchSearch = !search ||
      norm(w.name).includes(normSearch) ||
      norm(w.display_name).includes(normSearch) ||
      norm(w.category).includes(normSearch) ||
      norm(w.description).includes(normSearch)
    const matchStatus = statusFilter === 'All statuses' || w.displayStatus === statusFilter
    const matchCategory = categoryFilter === 'All categories' || (w.category || '').toLowerCase() === categoryFilter.toLowerCase()
    return matchSearch && matchStatus && matchCategory
  })

  const filteredRuns = instances.filter(r => {
    if (!search) return true
    return (
      r.workflow_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.run_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.trigger_type?.toLowerCase().includes(search.toLowerCase())
    )
  })

  const openRunModal = (wf, e) => {
    if (e) e.stopPropagation()
    const name = wf.name || 'email_summarizer'
    if (name === 'email_summarizer' || name.includes('email')) {
      navigate('/workflows/email_summarizer')
      return
    }
    if (name === 'product_launch' || name === 'product_launch_sprint' || name.includes('product_launch')) {
      navigate('/workflows/product_launch')
      return
    }
    setTargetWf({
      name: name,
      displayName: getDisplayName(wf.name, wf.display_name),
    })
    setModalOpen(true)
  }

  return (
    <div className="p-6 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 min-h-full transition-colors">
      {/* Run Workflow Modal */}
      <RunWorkflowModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workflowName={targetWf.name}
        displayName={targetWf.displayName}
        onSuccess={() => {
          load()
        }}
      />

      {/* Trigger Workflow Selection Modal */}
      <Modal
        open={selectModalOpen}
        onClose={() => setSelectModalOpen(false)}
        title="Trigger Workflow"
        width="max-w-lg"
      >
        <div className="space-y-2 py-1">
          {enriched.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">No workflows available.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
              {enriched.map(wf => (
                <button
                  key={wf.name}
                  className="flex items-center justify-between w-full p-3 bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] hover:border-blue-500 rounded-xl transition-all text-left group cursor-pointer"
                  onClick={() => {
                    const name = wf.name || 'email_summarizer'
                    if (name === 'email_summarizer' || name.includes('email')) {
                      setSelectModalOpen(false)
                      navigate('/workflows/email_summarizer')
                      return
                    }
                    if (name === 'product_launch' || name === 'product_launch_sprint' || name.includes('product_launch')) {
                      setSelectModalOpen(false)
                      navigate('/workflows/product_launch')
                      return
                    }
                    setTargetWf({ name: wf.name, displayName: getDisplayName(wf.name, wf.display_name) })
                    setModalOpen(true)
                    setSelectModalOpen(false)
                  }}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 text-sm transition-colors">
                      {getDisplayName(wf.name, wf.display_name)}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{wf.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={wf.displayStatus} />
                    <TriggerBadge triggerType={wf.triggerType} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Workflows</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage, monitor, and manually trigger AI workflow automations</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={openSelectModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#182234] text-sm font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <Play className="w-4 h-4 text-blue-600 dark:text-blue-500 fill-blue-600 dark:fill-blue-500" /> Trigger Workflow
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/workflows/builder')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Create Workflow
            </button>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#233048] mb-5">
        <button
          onClick={() => setActiveTab('workflows')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'workflows'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          All Workflows ({workflows.length})
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'runs'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Workflow Runs ({instances.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'workflows' ? "Search workflows..." : "Search runs..."}
            className="pl-9 pr-4 py-2 border border-slate-200 dark:border-[#233048] rounded-lg text-sm bg-white dark:bg-[#121826] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-64 shadow-2xs"
          />
        </div>
        {activeTab === 'workflows' && (
          <>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="border border-slate-200 dark:border-[#233048] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#121826] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 capitalize shadow-2xs"
            >
              {['All categories', 'finance', 'healthcare', 'marketing', 'sales', 'operations', 'productivity', 'compliance', 'general'].map(c => (
                <option key={c} value={c} className="bg-white dark:bg-[#121826] text-slate-900 dark:text-white">{c === 'All categories' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-200 dark:border-[#233048] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#121826] text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              {STATUS_OPTS.map(s => <option key={s} value={s} className="bg-white dark:bg-[#121826] text-slate-900 dark:text-white">{s}</option>)}
            </select>
          </>
        )}
        <button
          onClick={load}
          className="p-2 border border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] rounded-lg hover:bg-slate-50 dark:hover:bg-[#182234] text-slate-500 dark:text-slate-400 transition-colors shadow-2xs cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      {activeTab === 'workflows' ? (
        <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17]/50">
                {['Workflow','Category','Status','Trigger','Source','Runs / Success','Last Run','Cost','Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">Loading workflows…</td></tr>
              ) : filteredWorkflows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#182234] flex items-center justify-center">
                        <Plus className="w-5 h-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No workflows found</p>
                      {isAdmin && (
                        <button onClick={() => navigate('/workflows/builder')}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition-colors">
                          Create Workflow
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredWorkflows.map(wf => (
                  <tr
                    key={wf.name}
                    onClick={() => {
                      if (wf.name === 'product_launch' || wf.name === 'product_launch_sprint' || wf.name?.includes('product_launch')) {
                        navigate('/workflows/product_launch')
                      } else if (wf.name === 'email_summarizer' || wf.name?.includes('email')) {
                        navigate('/workflows/email_summarizer')
                      } else if (isAdmin) {
                        navigate(`/workflows/builder?wf=${encodeURIComponent(wf.name)}`)
                      } else {
                        openRunModal(wf)
                      }
                    }}
                    className="border-b border-slate-100 dark:border-[#1a2336] hover:bg-slate-50/80 dark:hover:bg-[#182234]/80 cursor-pointer transition-colors last:border-0 group"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {getDisplayName(wf.name, wf.display_name)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{wf.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#233048]">
                        {wf.category || 'general'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={wf.displayStatus} />
                    </td>
                    <td className="px-5 py-4">
                      <TriggerBadge triggerType={wf.triggerType} />
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#182234] rounded border border-slate-200 dark:border-[#233048]">
                        {wf.source}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm text-slate-900 dark:text-slate-200 font-medium">
                        {wf.totalRuns} {wf.totalRuns === 1 ? 'run' : 'runs'}
                      </div>
                      {wf.successRate != null && (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                          {wf.successRate}% success
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {wf.lastRun ? (
                        <div>
                          <span className="text-slate-900 dark:text-slate-200 font-medium">{timeAgo(wf.lastRun.started_at)}</span>
                          <span className="block text-slate-400 text-[10px] uppercase font-semibold">{wf.lastRun.status}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {wf.totalCost > 0 ? fmtCost(wf.totalCost) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => openRunModal(wf, e)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-white" /> Run Now
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Workflow Runs Tab */
        <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17]/50">
                {['Run ID','Workflow','Status','Trigger','Messages','Cost','Started','Action'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">Loading runs…</td></tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">
                    No workflow execution records found. Click <strong>Run Now</strong> to start an execution.
                  </td>
                </tr>
              ) : (
                filteredRuns.map(r => (
                  <tr
                    key={r.run_id}
                    onClick={() => navigate(`/workflows/${r.run_id}`)}
                    className="border-b border-slate-100 dark:border-[#1a2336] hover:bg-slate-50 dark:hover:bg-[#182234] cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-5 py-3.5 text-xs font-mono font-medium text-blue-600 dark:text-blue-400">
                      {r.run_id?.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {r.workflow_name || r.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <TriggerBadge triggerType={r.trigger_type || (r.trigger_source === 'manual_ui' ? 'Manual' : 'New Email')} />
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {r.message_count ? `${r.message_count} msgs` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {timeAgo(r.started_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        View <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
