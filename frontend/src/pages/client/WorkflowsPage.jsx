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
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

const STATUS_OPTS = ['All statuses', 'active', 'draft', 'paused', 'stopped']

function StatusBadge({ status }) {
  const map = {
    active:    'bg-green-50 text-green-700 border-green-200',
    draft:     'bg-gray-100 text-gray-600 border-gray-200',
    paused:    'bg-amber-50 text-amber-700 border-amber-200',
    stopped:   'bg-red-50 text-red-600 border-red-200',
    running:   'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    failed:    'bg-red-50 text-red-600 border-red-200',
  }
  const s = (status || 'draft').toLowerCase()
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${map[s] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s === 'active' || s === 'completed' ? 'bg-green-500' : s === 'draft' ? 'bg-gray-400' : s === 'paused' ? 'bg-amber-500' : s === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  )
}

function TriggerBadge({ triggerType }) {
  const isEmail = triggerType === 'New Email' || triggerType === 'email'
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${
      isEmail ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
    }`}>
      {isEmail ? <Mail className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      {triggerType || 'Manual'}
    </span>
  )
}

export default function WorkflowsPage() {
  const navigate      = useNavigate()
  const { api }       = useAuth()
  const [workflows,   setWorkflows]   = useState([])
  const [instances,   setInstances]   = useState([])
  const [search,      setSearch]      = useState('')
  const [statusFilter,setStatusFilter] = useState('All statuses')
  const [activeTab,   setActiveTab]   = useState('workflows') // 'workflows' | 'runs'
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [targetWf,    setTargetWf]    = useState({ name: 'email_summarizer', displayName: 'Email Summarizer' })

  const load = useCallback(async () => {
    try {
      const [dags, runs] = await Promise.all([
        api.get('/config/workflows').catch(() => []),
        api.get('/workflows').catch(() => []),
      ])
      setWorkflows(Array.isArray(dags) ? dags : [])
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
      displayStatus: wf.status || 'active',
      triggerType: wf.trigger_type || (isEmail ? 'New Email' : 'Manual'),
      source: wf.source || (isEmail ? 'Synthetic Inbox' : 'Direct'),
      automationStatus: wf.automation_status || (isEmail ? 'Enabled' : 'Configured'),
    }
  })

  const filteredWorkflows = enriched.filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase()) || (w.display_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All statuses' || w.displayStatus === statusFilter
    return matchSearch && matchStatus
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
    setTargetWf({
      name: wf.name || 'email_summarizer',
      displayName: wf.display_name || wf.name || 'Email Summarizer',
    })
    setModalOpen(true)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage, monitor, and manually trigger AI workflow automations</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openRunModal({ name: 'email_summarizer', display_name: 'Email Summarizer' })}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Play className="w-4 h-4 text-blue-600 fill-blue-600" /> Run Email Summarizer
          </button>
          <button
            onClick={() => navigate('/workflows/builder')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 mb-5">
        <button
          onClick={() => setActiveTab('workflows')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'workflows'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All Workflows ({workflows.length})
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'runs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Workflow Runs ({instances.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'workflows' ? "Search workflows..." : "Search runs..."}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
        {activeTab === 'workflows' && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
          </select>
        )}
        <button
          onClick={load}
          className="p-2 border border-gray-200 rounded-lg hover:bg-white text-gray-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      {activeTab === 'workflows' ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Workflow','Status','Trigger','Source','Runs / Success','Last Run','Cost','Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-400">Loading workflows…</td></tr>
              ) : filteredWorkflows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No workflows found</p>
                      <button onClick={() => navigate('/workflows/builder')}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                        Create Workflow
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredWorkflows.map(wf => (
                  <tr
                    key={wf.name}
                    onClick={() => navigate('/workflows/builder')}
                    className="border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition-colors last:border-0 group"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {wf.display_name || wf.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{wf.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={wf.displayStatus} />
                    </td>
                    <td className="px-5 py-4">
                      <TriggerBadge triggerType={wf.triggerType} />
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-gray-600">
                      <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">
                        {wf.source}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm text-gray-900 font-medium">
                        {wf.totalRuns} {wf.totalRuns === 1 ? 'run' : 'runs'}
                      </div>
                      {wf.successRate != null && (
                        <div className="text-xs text-green-600 font-semibold mt-0.5">
                          {wf.successRate}% success
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {wf.lastRun ? (
                        <div>
                          <span className="text-gray-900 font-medium">{timeAgo(wf.lastRun.started_at)}</span>
                          <span className="block text-gray-400 text-[10px] uppercase font-semibold">{wf.lastRun.status}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-gray-700">
                      {wf.totalCost > 0 ? fmtCost(wf.totalCost) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => openRunModal(wf, e)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Run ID','Workflow','Status','Trigger','Messages','Cost','Started','Action'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-400">Loading runs…</td></tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    No workflow execution records found. Click <strong>Run Now</strong> to start an execution.
                  </td>
                </tr>
              ) : (
                filteredRuns.map(r => (
                  <tr
                    key={r.run_id}
                    onClick={() => navigate(`/workflows/${r.run_id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-5 py-3.5 text-xs font-mono font-medium text-blue-600">
                      {r.run_id?.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">
                      {r.workflow_name || r.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <TriggerBadge triggerType={r.trigger_type || (r.trigger_source === 'manual_ui' ? 'Manual' : 'New Email')} />
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700">
                      {r.message_count ? `${r.message_count} msgs` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-700">
                      {r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {timeAgo(r.started_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
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
