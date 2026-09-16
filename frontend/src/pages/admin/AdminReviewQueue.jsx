// Admin: Review Queue & Human Decision Management
import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, CheckCircle2, XCircle, RefreshCw, Clock, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../utils/helpers'
import { getDisplayName } from '../../utils/workflowDisplayNames'

const TABS = ['Pending', 'In Review', 'Resolved']

export default function AdminReviewQueue() {
  const { api } = useAuth()
  const [tab, setTab] = useState('Pending')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [actionSuccess, setActionSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const status = tab === 'Pending' ? 'pending' : tab === 'Resolved' ? 'resolved' : 'pending'
      const d = await api.get(`/escalations?status=${status}`).catch(() => [])
      setItems(Array.isArray(d) ? d : [])
    } finally {
      setLoading(false)
    }
  }, [api, tab])

  useEffect(() => { load() }, [load])

  const handleDecision = async (id, decision) => {
    setProcessingId(id)
    setActionSuccess('')
    try {
      await api.post(`/escalations/${id}/decide`, { decision, notes: `Decided by Platform Admin` })
        .catch(() => api.post(`/a2a/requests/${id}/decide`, { approved: decision === 'approved' }).catch(() => null))
      setActionSuccess(`Review item ${decision} successfully!`)
      setTimeout(() => setActionSuccess(''), 2500)
      load()
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Human-in-the-loop decisions: workflow runs flagged for review by policy gates, risk thresholds, or human decision nodes.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : 'text-gray-400'}`} />
          Refresh
        </button>
      </div>

      {actionSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          {actionSuccess}
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex px-4 pt-4 gap-2 border-b border-gray-100 bg-gray-50/40">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'Pending' && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
              {t === 'In Review' && <span className="w-2 h-2 rounded-full bg-blue-500" />}
              {t === 'Resolved' && <span className="w-2 h-2 rounded-full bg-green-500" />}
              {t} ({items.length})
            </button>
          ))}
        </div>

        <div className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading review items…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium text-gray-600">No {tab.toLowerCase()} review items</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">Workflow runs flagged for human intervention will appear here in real time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['RUN ID', 'WORKFLOW / STEP', 'REASON FOR REVIEW', 'PRIORITY', 'FLAGGED TIME', 'ADMIN ACTIONS'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(e => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 text-xs font-mono font-semibold text-blue-600">
                        {e.instance_id?.slice(0, 8) || e.id?.slice(0, 8)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-gray-900">{getDisplayName(e.node_id)}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{e.node_id}</p>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-700 max-w-xs leading-relaxed">
                        {e.reason || 'Human policy gate reached'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          High Priority
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400">
                        {timeAgo(e.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        {tab === 'Pending' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDecision(e.id, 'approved')}
                              disabled={processingId === e.id}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleDecision(e.id, 'rejected')}
                              disabled={processingId === e.id}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
