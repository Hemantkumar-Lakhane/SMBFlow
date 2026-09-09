import { useState, useEffect, useCallback } from 'react'
import { Server, Search, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminModelCatalog() {
  const { api } = useAuth()
  const [models, setModels] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setModels(await api.get('/config/models')) } catch {}
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const allModels = models ? Object.entries(models.all_available_models || {}).flatMap(([provider, list]) =>
    Array.isArray(list) ? list.map(m => ({ ...m, provider })) : []
  ) : []

  const filtered = allModels.filter(m => !search || m.label?.toLowerCase().includes(search.toLowerCase()) || m.id?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Model Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage models available to SMBFlow. Models are discovered from connected providers or registered manually.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Model
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search models..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
          </div>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"><option>All providers</option></select>
        </div>

        {loading ? <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Server className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No models available</p>
            <p className="text-xs text-gray-400 text-center">Connect a provider to discover models automatically, or use the button above to register a model manually.</p>
            <button className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">Add model</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['MODEL','PROVIDER','CAPABILITIES','AVAILABILITY','CONTEXT','USED BY'].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{filtered.map(m=>(
              <tr key={`${m.provider}-${m.id}`} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3"><p className="text-sm font-semibold text-gray-900">{m.label}</p><p className="text-xs text-gray-400 font-mono">{m.id?.split('/').pop()}</p></td>
                <td className="px-5 py-3 text-sm text-gray-500 capitalize">{m.provider}</td>
                <td className="px-5 py-3 text-sm text-gray-400">—</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">Available</span></td>
                <td className="px-5 py-3 text-sm text-gray-400">—</td>
                <td className="px-5 py-3 text-sm text-gray-400">—</td>
              </tr>
            ))}</tbody>
          </table>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">A model may exist in the catalog but be unavailable if its provider is disconnected, the credential is expired, or the model has been disabled. Availability is checked against the connected provider API.</p>
          </div>
        )}
      </div>
    </div>
  )
}
