import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const PROVIDERS = [
  { id:'anthropic', label:'Anthropic',  initial:'A', color:'bg-amber-100 text-amber-700',  type:'LLM Provider' },
  { id:'openai',    label:'OpenAI',     initial:'O', color:'bg-green-100 text-green-700',   type:'LLM Provider' },
  { id:'google',    label:'Google AI',  initial:'G', color:'bg-blue-100 text-blue-700',     type:'LLM Provider' },
  { id:'groq',      label:'Groq',       initial:'Gr',color:'bg-purple-100 text-purple-700', type:'LLM Provider (high-speed)' },
]

export default function AdminProviderConnections() {
  const { api } = useAuth()
  const [health, setHealth] = useState(null)

  const load = useCallback(async () => {
    try { setHealth(await api.get('/health')) } catch {}
  }, [api])

  useEffect(() => { load() }, [load])

  const llm = health?.llm_providers || {}

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Connections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect and manage AI providers used by SMBFlow.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">{['PROVIDER','TYPE','CONNECTION STATUS','MODELS AVAILABLE','LAST TESTED','USAGE',''].map(h=><th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {PROVIDERS.map(p => {
              const info = llm[p.id] || {}
              const configured = info.status === 'configured'
              return (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${p.color} flex items-center justify-center text-xs font-bold`}>{p.initial}</div>
                      <span className="text-sm font-semibold text-gray-900">{p.label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{p.type}</td>
                  <td className="px-5 py-4">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${configured ? 'text-green-600' : 'text-gray-400'}`}>
                      <span className={`w-3 h-3 rounded-full border-2 ${configured ? 'border-green-500' : 'border-gray-300'} flex items-center justify-center`}>
                        {!configured && <span className="w-1.5 h-0.5 bg-gray-400 rounded" />}
                      </span>
                      {configured ? 'Configured' : 'Not configured'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-400">—</td>
                  <td className="px-5 py-4 text-sm text-gray-400">Never</td>
                  <td className="px-5 py-4 text-sm text-gray-400">—</td>
                  <td className="px-5 py-4 text-sm text-gray-400">···</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border border-gray-400 flex-shrink-0" />
          <p className="text-xs text-gray-500">API credentials are encrypted at rest and never returned to the UI after saving. Status shows <strong>Configured</strong> or <strong>Not configured</strong> — never the key itself.</p>
        </div>
      </div>
    </div>
  )
}
