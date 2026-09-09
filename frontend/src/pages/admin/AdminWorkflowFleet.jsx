import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminWorkflowFleet() {
  const { api } = useAuth()
  const [workflows, setWorkflows] = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    try { const d = await api.get('/config/workflows'); setWorkflows(Array.isArray(d) ? d : []) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = workflows.filter(w => !search || w.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workflow Fleet</h1>
        <p className="text-sm text-gray-500 mt-0.5">Monitor workflows across all SMBFlow tenants</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workflows..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex items-center gap-3">
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All statuses</option></select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <GitBranch className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No workflow data available</p>
            <p className="text-xs text-gray-400 text-center">Workflow fleet data will appear here once the platform API is connected.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['WORKFLOW','INDUSTRY','STATUS','RUNS','SUCCESS RATE','LAST RUN'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(w=>(
              <tr key={w.name} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">{w.display_name||w.name}</td>
                <td className="px-5 py-3.5 text-sm text-gray-500 capitalize">{w._meta?.industry||'—'}</td>
                <td className="px-5 py-3.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">Active</span></td>
                <td className="px-5 py-3.5 text-sm text-gray-500">—</td>
                <td className="px-5 py-3.5 text-sm text-gray-500">—</td>
                <td className="px-5 py-3.5 text-sm text-gray-400">—</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
