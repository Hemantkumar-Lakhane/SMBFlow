import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'

export default function AdminAuditLog() {
  const { api } = useAuth()
  const [events,  setEvents]  = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { const d = await api.get('/admin/system-events'); setEvents(Array.isArray(d) ? d : []) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = events.filter(e => !search || e.event_type?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track important platform and administrative actions</p>
        </div>
        <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white transition-colors">Export CSV</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search logs..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <div className="flex items-center gap-2">
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All actions</option></select>
            <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All time</option></select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">{['TIMESTAMP','ACTOR','ACTION','RESOURCE','DETAILS','IP ADDRESS'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <ClipboardList className="w-10 h-10 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">No audit logs available</p>
                  <p className="text-xs text-gray-400 text-center">Audit log entries will appear here once the platform API is connected and events are recorded.</p>
                </div>
              </td></tr>
            ) : filtered.map((e,i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-xs font-mono text-gray-400">{timeAgo(e.created_at)}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{e.actor||'system'}</td>
                <td className="px-5 py-3 text-xs text-gray-700 font-medium">{e.event_type}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{e.tenant_id?.slice(0,8)||'—'}</td>
                <td className="px-5 py-3 text-xs text-gray-400 max-w-[200px] truncate">{e.message||'—'}</td>
                <td className="px-5 py-3 text-xs text-gray-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
