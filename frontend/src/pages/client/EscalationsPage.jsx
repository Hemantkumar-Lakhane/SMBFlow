// frontend/src/pages/client/EscalationsPage.jsx
// Matches Figma: Action Center — human-in-the-loop AI recommendations & approvals

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Mail, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
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

// ── Escalation & Approval Decision Modal ───────────────────────────────────────
function EscDecideModal({ esc, onClose, api, onDone }) {
  const payload = esc?.payload || {}
  const isDraftApproval = !!(payload.draft_reply || payload.to_address || esc.node_id === 'evaluate_actions')

  const [action,    setAction]    = useState(esc?.recommended_action || (isDraftApproval ? 'approve_draft' : ''))
  const [decidedBy, setDecidedBy] = useState('Operator')
  const [notes,     setNotes]     = useState('')
  const [draftText, setDraftText] = useState(payload.draft_reply || '')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const submitDecision = async (chosenAction) => {
    setLoading(true); setError('')
    try {
      const escId = esc?.id || esc?.escalation_id
      const patch = isDraftApproval && draftText !== payload.draft_reply ? { draft_reply: draftText } : null
      await api.post(`/escalations/${escId}/decide`, {
        decision: { notes, patch_payload: patch },
        action_chosen: chosenAction || action || 'approve',
        decided_by: decidedBy || 'Operator',
      })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title={isDraftApproval ? "Review Proposed Action" : "Decision Required"}>
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-800">Node: {esc.node_id || 'evaluate_actions'}</span>
            {payload.urgency_score && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded-full">
                Urgency: {payload.urgency_score}/10
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 font-medium">{esc.reason}</p>
        </div>

        {isDraftApproval && (
          <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div>
              <span className="text-xs font-semibold text-gray-500 block">Recipient</span>
              <p className="text-xs font-mono text-gray-800">{payload.to_address || payload.to || 'client@enterprise.com'}</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-500 block">Subject</span>
              <p className="text-xs font-medium text-gray-900">{payload.subject || 'Incident Update'}</p>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-500 block mb-1">Proposed Draft Reply</span>
              <textarea
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                rows={5}
                className="w-full border border-gray-300 rounded-lg p-2 text-xs font-mono bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {esc.recommended_action && !isDraftApproval && (
          <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            AI recommends: <strong>{esc.recommended_action}</strong>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reviewer Name</label>
          <input value={decidedBy} onChange={e => setDecidedBy(e.target.value)} placeholder="Jane Smith"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (Optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Approval comments…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {isDraftApproval ? (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => submitDecision('approve_draft')}
              disabled={loading}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {loading ? 'Processing…' : 'Approve Draft (Test Mode)'}
            </button>
            <button
              onClick={() => submitDecision('reject')}
              disabled={loading}
              className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        ) : (
          <button onClick={() => submitDecision(action)} disabled={loading || !action}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            {loading ? 'Submitting…' : 'Submit Decision'}
          </button>
        )}
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
function ActionRow({ item, onDecide }) {
  const isA2A      = item._type === 'a2a'
  const isResolved = item.status === 'resolved' || item.status === 'decided' || item.status === 'approved' || item.status === 'rejected'
  const isEmail    = item.payload && (item.payload.draft_reply || item.payload.to_address)

  return (
    <div className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors bg-white shadow-xs">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isResolved ? (item.status === 'rejected' ? 'bg-red-50' : 'bg-green-50')
        : (isEmail ? 'bg-blue-50' : 'bg-amber-50')
      }`}>
        {isEmail ? (
          <Mail className={`w-4 h-4 ${isResolved ? 'text-green-600' : 'text-blue-600'}`} />
        ) : isA2A ? (
          <ShieldAlert className="w-4 h-4 text-purple-600" />
        ) : (
          <Inbox className={`w-4 h-4 ${isResolved ? 'text-green-500' : 'text-amber-500'}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900">
            {isEmail ? `Review Email Action: ${item.payload.subject || 'Incident Notice'}`
             : isA2A ? `${AGENT_LABELS[item.requesting_agent] || item.requesting_agent} → ${AGENT_LABELS[item.target_agent] || item.target_agent}`
             : (item.node_id || 'Decision Required')}
          </p>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
            item.status === 'approved' || item.status === 'resolved' ? 'bg-green-50 text-green-700 border border-green-200'
            : item.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {item.status || 'Pending'}
          </span>
        </div>
        <p className="text-sm text-gray-600">{truncate(item.reason, 120)}</p>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1.5">
          <span>{timeAgo(item.created_at)}</span>
          {item.payload?.urgency_score && (
            <span className="text-red-600 font-medium">Urgency: {item.payload.urgency_score}/10</span>
          )}
          {item.decided_by && <span>Decided by: {item.decided_by}</span>}
        </div>
      </div>
      {!isResolved && (
        <button onClick={() => onDecide(item)}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0">
          Review & Decide
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
      subscribe('approval_created',         load),
      subscribe('approval_decided',         load),
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
                 : tab === 'approved' ? resolvedItems.filter(i => i.status === 'approved' || i.status === 'resolved' || i.action_chosen)
                 : resolvedItems.filter(i => i.status === 'rejected')

  const handleDecide = (item) => {
    if (item._type === 'a2a') setA2aModal(item)
    else setDeciding(item)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Action Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Human-in-the-loop review — AI recommendations & proposed email actions awaiting your decision</p>
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
                <p className="text-xs text-gray-400 mt-1">AI recommendations will appear here when<br />workflows generate decisions or email drafts requiring review.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, i) => (
                <ActionRow key={item.id || item.escalation_id || item.a2a_id || i} item={item} onDecide={handleDecide} />
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
