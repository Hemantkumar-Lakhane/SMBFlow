// frontend/src/pages/client/EscalationsPage.jsx
// Matches Figma: Action Center — human-in-the-loop AI recommendations

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { timeAgo, truncate, AGENT_LABELS, fmtCost } from '../../utils/helpers'

const POLL_MS = 8000

// ── Simple modal wrapper ──────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── Escalation Decision Modal ─────────────────────────────────────────────────
function EscDecideModal({ esc, onClose, api, onDone }) {
  const [action,    setAction]    = useState(esc?.recommended_action || '')
  const [decidedBy, setDecidedBy] = useState('')
  const [notes,     setNotes]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const submit = async () => {
    if (!action || !decidedBy) { setError('Action and your name are required'); return }
    setLoading(true); setError('')
    try {
      const escId = esc?.id || esc?.escalation_id
      await api.post(`/escalations/${escId}/decide`, { decision: { notes }, action_chosen: action, decided_by: decidedBy })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Decision Required">
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold text-amber-700 mb-1">Escalated at: {esc.node_id}</p>
          <p className="text-sm text-gray-700">{esc.reason}</p>
        </div>
        {esc.recommended_action && (
          <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            AI recommends: <strong>{esc.recommended_action}</strong>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Action *</label>
          <input value={action} onChange={e => setAction(e.target.value)} placeholder="e.g. send_email"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
          <input value={decidedBy} onChange={e => setDecidedBy(e.target.value)} placeholder="Jane Smith"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={submit} disabled={loading || !action || !decidedBy}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
          {loading ? 'Submitting…' : 'Submit Decision & Resume Workflow'}
        </button>
      </div>
    </Modal>
  )
}

// ── A2A Decision Modal ────────────────────────────────────────────────────────
function A2ADecideModal({ req, onClose, api, onDone }) {
  const [loading, setLoading] = useState(false)
  const decide = async (approved) => {
    setLoading(true)
    try {
      await api.post(`/a2a/${req.a2a_id}/decide`, { approved, reason: approved ? 'Approved' : 'Rejected' })
      onDone(); onClose()
    } finally { setLoading(false) }
  }
  return (
    <Modal open onClose={onClose} title="Agent-to-Agent Request">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{req.reason}</p>
        <p className="text-xs text-amber-600">Est. extra cost: {fmtCost(req.estimated_cost_usd || 0.001)}</p>
        <div className="flex gap-3">
          <button onClick={() => decide(true)} disabled={loading}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            Allow
          </button>
          <button onClick={() => decide(false)} disabled={loading}
            className="flex-1 py-2 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            Reject
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Pill tab ──────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'
      }`}>
      {label}
    </button>
  )
}

// ── Action row ────────────────────────────────────────────────────────────────
function ActionRow({ item, onDecide, onNavigate }) {
  const isPending  = item._type === 'escalation'
  const isA2A      = item._type === 'a2a'
  const isResolved = item.status === 'resolved' || item.status === 'decided'

  return (
    <div className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors bg-white">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isResolved ? 'bg-green-50' : isPending ? 'bg-amber-50' : 'bg-blue-50'
      }`}>
        <Inbox className={`w-4 h-4 ${isResolved ? 'text-green-500' : isPending ? 'text-amber-500' : 'text-blue-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900">
            {isPending ? item.node_id : isA2A ? `${AGENT_LABELS[item.requesting_agent] || item.requesting_agent} → ${AGENT_LABELS[item.target_agent] || item.target_agent}` : item.node_id}
          </p>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isResolved ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {isResolved ? 'Resolved' : 'Pending'}
          </span>
        </div>
        <p className="text-sm text-gray-500">{truncate(item.reason, 100)}</p>
        <p className="text-xs text-gray-400 mt-1">{timeAgo(item.created_at)}</p>
      </div>
      {!isResolved && (
        <button onClick={() => onDecide(item)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0">
          Review
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EscalationsPage() {
  const navigate      = useNavigate()
  const { api }       = useAuth()
  const { subscribe } = useWebSocket()

  const [tab,      setTab]     = useState('all')   // all | pending | approved | rejected
  const [escs,     setEscs]    = useState([])
  const [a2as,     setA2as]    = useState([])
  const [resolved, setResolved] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [deciding, setDeciding] = useState(null)
  const [a2aModal, setA2aModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [pEscs, rEscs, a2aList] = await Promise.all([
        api.get('/escalations?status=pending'),
        api.get('/escalations?status=resolved').catch(() => []),
        api.get('/a2a/requests').catch(() => []),
      ])
      setEscs(Array.isArray(pEscs) ? pEscs : [])
      setResolved(Array.isArray(rEscs) ? rEscs : [])
      setA2as(Array.isArray(a2aList) ? a2aList : [])
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const unsubs = [
      subscribe('escalation_created',       load),
      subscribe('escalation_resolved',      load),
      subscribe('a2a_permission_requested', load),
      subscribe('a2a_decided',              load),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [subscribe, load])

  // Build combined list
  const pendingEscs = escs.map(e => ({ ...e, _type: 'escalation' }))
  const pendingA2a  = a2as.filter(a => a.status === 'pending_permission').map(a => ({ ...a, _type: 'a2a' }))
  const resolvedItems = [
    ...resolved.map(e => ({ ...e, _type: 'escalation' })),
    ...a2as.filter(a => a.status !== 'pending_permission').map(a => ({ ...a, _type: 'a2a' })),
  ]

  const allItems = [...pendingEscs, ...pendingA2a, ...resolvedItems]
  const filtered = tab === 'all'      ? allItems
                 : tab === 'pending'  ? [...pendingEscs, ...pendingA2a]
                 : tab === 'approved' ? resolvedItems.filter(i => i.action_chosen || i.status === 'approved')
                 : resolvedItems.filter(i => i.status === 'rejected')
  const totalPending = pendingEscs.length + pendingA2a.length

  const handleDecide = (item) => {
    if (item._type === 'a2a') setA2aModal(item)
    else setDeciding(item)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Action Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Human-in-the-loop review — AI recommendations awaiting your decision</p>
      </div>

      {/* Tabs + count */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
            {[['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']].map(([v,l]) => (
              <Tab key={v} label={l} active={tab === v} onClick={() => setTab(v)} />
            ))}
          </div>
          <span className="text-sm text-gray-400 font-medium">{filtered.length} Items</span>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Inbox className="w-10 h-10 text-gray-300" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-500">No actions require your attention</p>
                <p className="text-xs text-gray-400 mt-1">AI recommendations will appear here when<br />workflows generate decisions requiring review.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, i) => (
                <ActionRow key={item.id || item.a2a_id || i} item={item} onDecide={handleDecide} onNavigate={navigate} />
              ))}
            </div>
          )}
        </div>
      </div>

      {deciding  && <EscDecideModal esc={deciding}  onClose={() => setDeciding(null)}  api={api} onDone={load} />}
      {a2aModal  && <A2ADecideModal req={a2aModal}  onClose={() => setA2aModal(null)}  api={api} onDone={load} />}
    </div>
  )
}
