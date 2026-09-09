import { useState, useEffect, useCallback } from 'react'
import { Zap, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost, fmtTokens } from '../../utils/helpers'

export default function AdminWorkflowRuns() {
  const { api } = useAuth()
  const [runs, setRuns] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { const d = await api.get('/workflows'); setRuns(Array.isArray(d) ? d : []) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = runs.filter(r => !search || r.workflow_name?.toLowerCase().includes(search.toLowerCase()) || r.run_id?.includes(search))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workflow Runs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Monitor workflow executions across all tenants — includes token usage and cost once API is connected</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search runs..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex items-center gap-2">
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All statuses</option></select>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All time</option></select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>
        {loading ? <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No run data available</p>
            <p className="text-xs text-gray-400 text-center">Workflow run records with token usage and cost will appear here once the platform API is connected.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['RUN ID','WORKFLOW','TENANT','STATUS','TOKENS IN','TOKENS OUT','COST','STARTED'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(r=>(
              <tr key={r.run_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-xs font-mono text-gray-500">{r.run_id?.slice(0,8)}</td>
                <td className="px-5 py-3 text-xs text-gray-700 truncate max-w-[120px]">{r.workflow_name}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{r.tenant_id?.slice(0,8)||'—'}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status==='completed'?'bg-green-50 text-green-700':r.status==='running'?'bg-blue-50 text-blue-700':'bg-gray-100 text-gray-500'}`}>{r.status}</span></td>
                <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_in)}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_out)}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}</td>
                <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(r.started_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
