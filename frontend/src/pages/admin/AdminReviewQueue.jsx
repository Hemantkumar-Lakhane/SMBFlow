import { useState, useEffect, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'

const TABS = ['Pending','In Review','Resolved']

export default function AdminReviewQueue() {
  const { api } = useAuth()
  const [tab, setTab] = useState('Pending')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const status = tab === 'Pending' ? 'pending' : tab === 'Resolved' ? 'resolved' : 'pending'
      const d = await api.get(`/escalations?status=${status}`)
      setItems(Array.isArray(d) ? d : [])
    } finally { setLoading(false) }
  }, [api, tab])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">Human-in-the-loop decisions. Workflow runs flagged for review by AI policy, confidence threshold, or risk gate.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex px-4 pt-4 gap-2 border-b border-gray-100 pb-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${tab===t ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'Pending' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              {t === 'In Review' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
              {t === 'Resolved' && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
              {t}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading ? <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <MessageSquare className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No pending reviews</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">Workflow runs requiring a human decision will appear here. The AI flagged no items as needing review.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">{['RUN','WORKFLOW','REASON','CREATED'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{items.map(e=>(
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{e.instance_id?.slice(0,8)||'—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{e.node_id}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{e.reason}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(e.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="px-4 pb-4 text-xs text-gray-400 border-t border-gray-50 pt-3">
          Reviews are generated when a workflow run reaches a human-approval step or when an AI confidence score falls below the configured threshold. Connect the platform API to load live review items.
        </div>
      </div>
    </div>
  )
}
