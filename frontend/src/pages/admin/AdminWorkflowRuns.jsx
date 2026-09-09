import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Search, Mail, Play, ArrowRight, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost, fmtTokens } from '../../utils/helpers'

export default function AdminWorkflowRuns() {
  const navigate = useNavigate()
  const { api } = useAuth()
  const [runs, setRuns] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const d = await api.get('/workflows')
      setRuns(Array.isArray(d) ? d : [])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = runs.filter(r => {
    const matchSearch = !search ||
      r.workflow_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.run_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.trigger_type?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All statuses' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Runs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor workflow executions across all organizations — includes trigger source, token usage, and cost</p>
        </div>
        <button
          onClick={load}
          className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search runs by ID, workflow, trigger..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>All statuses</option>
              <option value="completed">completed</option>
              <option value="running">running</option>
              <option value="escalated">escalated</option>
              <option value="failed">failed</option>
            </select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading runs…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No run data available</p>
            <p className="text-xs text-gray-400 text-center">Workflow run records will appear here as automatic and manual executions are performed.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['RUN ID','WORKFLOW','STATUS','TRIGGER','MESSAGES','TOKENS IN','TOKENS OUT','COST','STARTED','ACTION'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isEmail = (r.trigger_type === 'New Email' || r.trigger_source === 'email_event_detector')
                return (
                  <tr
                    key={r.run_id}
                    onClick={() => navigate(`/workflows/${r.run_id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-xs font-mono text-blue-600 font-semibold">{r.run_id?.slice(0,8)}...</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-900 truncate max-w-[150px]">{r.workflow_name || r.name}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        r.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        r.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        r.status === 'escalated' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isEmail ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {isEmail ? <Mail className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {r.trigger_type || (r.trigger_source === 'manual_ui' ? 'Manual' : 'New Email')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">
                      {r.message_count ? `${r.message_count} msgs` : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_in)}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_out)}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-800">{r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(r.started_at)}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                        View <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
