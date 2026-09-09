import { useState, useEffect, useCallback } from 'react'
import { Building2, Search, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'

export default function AdminOrganizations() {
  const { api } = useAuth()
  const [tenants, setTenants] = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { const d = await api.get('/tenants'); setTenants(Array.isArray(d) ? d : []) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = tenants.filter(t => !search || t.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage customer organizations, their users, and workflow access.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Organization
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search organizations..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex items-center gap-3">
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
              <option>All statuses</option><option>Active</option><option>Inactive</option>
            </select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Building2 className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No organizations yet</p>
            <p className="text-xs text-gray-400 text-center max-w-xs">Organizations will appear here once the platform API is connected. Use the button above to manually onboard an organization.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['NAME','INDUSTRY','STATUS','CREATED'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(t=>(
              <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">{t.name}</td>
                <td className="px-5 py-3.5 text-sm text-gray-500 capitalize">{t.industry||'—'}</td>
                <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${t.active!==false?'bg-green-50 text-green-700 border-green-200':'bg-gray-100 text-gray-500 border-gray-200'}`}>{t.active!==false?'Active':'Inactive'}</span></td>
                <td className="px-5 py-3.5 text-sm text-gray-400">{timeAgo(t.created_at)||'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
