// frontend/src/pages/client/WorkflowsPage.jsx
// Matches Figma: Workflows list — manage and monitor AI workflow automations

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost } from '../../utils/helpers'

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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${map[s] || map.draft}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s === 'active' ? 'bg-green-500' : s === 'draft' ? 'bg-gray-400' : s === 'paused' ? 'bg-amber-500' : 'bg-red-400'}`} />
      {s.charAt(0).toUpperCase() + s.slice(1)}
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
  const [loading,     setLoading]     = useState(true)

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
    const completed = wfRuns.filter(i => i.status === 'completed')
    const lastRun   = wfRuns.sort((a,b) => new Date(b.started_at) - new Date(a.started_at))[0]
    const successRate = wfRuns.length > 0 ? Math.round((completed.length / wfRuns.length) * 100) : null
    const totalCost = wfRuns.reduce((s, r) => s + (r.total_cost_usd || 0), 0)
    return { ...wf, totalRuns: wfRuns.length, successRate, lastRun, totalCost, displayStatus: wf.status || 'active' }
  })

  const filtered = enriched.filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase()) || (w.display_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All statuses' || w.displayStatus === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage and monitor your AI workflow automations</p>
        </div>
        <button
          onClick={() => navigate('/workflows/builder')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Create Workflow
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-400">{filtered.length} workflow{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Workflow','Status','Total Runs','Success Rate','Last Run','Cost'].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No workflows found</p>
                    <p className="text-xs text-gray-400">Create your first workflow to get started</p>
                    <button onClick={() => navigate('/workflows/builder')}
                      className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                      Create Workflow
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(wf => (
                <tr key={wf.name} onClick={() => navigate('/workflows/builder')}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors last:border-0">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">{wf.display_name || wf.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{wf._meta?.industry || wf.industry || ''}</p>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={wf.displayStatus} /></td>
                  <td className="px-5 py-4 text-sm text-gray-500">{wf.totalRuns || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{wf.successRate != null ? `${wf.successRate}%` : '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{wf.lastRun ? timeAgo(wf.lastRun.started_at) : '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{wf.totalCost > 0 ? fmtCost(wf.totalCost) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
