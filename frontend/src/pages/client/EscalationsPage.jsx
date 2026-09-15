// frontend/src/pages/client/EscalationsPage.jsx
// Action Center - explainable AI recommendations and human-in-the-loop approvals

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  Inbox,
  Mail,
  MessageSquareText,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { timeAgo, truncate, AGENT_LABELS, fmtCost } from '../../utils/helpers'

const POLL_MS = 8000

const CATEGORY_META = {
  sla_risk: { label: 'SLA Risk', short: 'SLA', tone: 'bg-red-50 text-red-700 border-red-200' },
  billing_dispute: { label: 'Billing Dispute', short: 'Billing', tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  service_outage: { label: 'Service Outage', short: 'Outage', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  executive_partner: { label: 'Executive Partner', short: 'Executive', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  routine_inquiry: { label: 'Routine Inquiry', short: 'Routine', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
  // Inbound Lead-to-Demo classifications
  sales_ready: { label: 'Sales-Ready Lead', short: 'Sales-Ready', tone: 'bg-green-50 text-green-700 border-green-200' },
  nurture: { label: 'Nurture Lead', short: 'Nurture', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  low_fit: { label: 'Low-Fit Lead', short: 'Low-Fit', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
  needs_review: { label: 'Needs Review', short: 'Review', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const TONES = [
  { key: 'empathetic', label: 'Empathetic', full: 'Empathetic & Reassuring' },
  { key: 'executive', label: 'Executive', full: 'Executive & Concise' },
  { key: 'warm', label: 'Warm', full: 'Warm & Supportive' },
  { key: 'formal', label: 'Formal', full: 'Formal Enterprise' },
]

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
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">x</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function getPayload(item) {
  const payload = item?.payload || {}
  const innerPayload = payload.payload || {}
  const proposedAction = payload.proposed_action || innerPayload.proposed_action || {}
  const source = payload.source || innerPayload.source || {}
  return { payload, innerPayload, proposedAction, source }
}

function getCategory(item) {
  const { payload, innerPayload } = getPayload(item)
  return item?.category || payload.category || innerPayload.category || 'routine_inquiry'
}

function getUrgency(item) {
  const { payload, innerPayload } = getPayload(item)
  const raw = item?.urgency_score || payload.urgency_score || innerPayload.urgency_score || 7
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 7
}

function getDraftParts(esc) {
  const { payload, innerPayload, proposedAction, source } = getPayload(esc)
  const recipient =
    proposedAction.recipient ||
    payload.to_address ||
    payload.to ||
    payload.recipient ||
    source.sender ||
    innerPayload.to_address ||
    innerPayload.recipient ||
    'client@enterprise.com'

  const subject =
    proposedAction.subject ||
    payload.subject ||
    source.subject ||
    innerPayload.subject ||
    'Incident Investigation Update'

  const draft =
    proposedAction.body ||
    proposedAction.draft_reply ||
    payload.draft_reply ||
    payload.draft_content ||
    payload.draft_text ||
    payload.body ||
    innerPayload.draft_reply ||
    innerPayload.body ||
    `Hi,\n\nThank you for raising this. Our team is reviewing the details now and will follow up with a clear update shortly.\n\nBest,\nSMBFlow Enterprise Support`

  return { recipient, subject, draft, source }
}

function humanizeDraft(baseDraft, tone, recipient, subject) {
  const greetingName = recipient?.split('@')[0]?.split(/[._-]/)[0]
  const greeting = greetingName ? `Hi ${greetingName.charAt(0).toUpperCase()}${greetingName.slice(1)},` : 'Hi,'
  const topic = subject ? `"${subject.replace(/^re:\s*/i, '')}"` : 'your note'

  if (tone === 'executive') {
    return `${greeting}\n\nI am following up on ${topic}. We understand the urgency and have the right team actively reviewing it now.\n\nWe will send a concise status update with impact, next steps, and owner by the committed response window.\n\nBest,\nSMBFlow Enterprise Support`
  }
  if (tone === 'warm') {
    return `${greeting}\n\nThank you for reaching out and for giving us the chance to look into this quickly. I am following up on ${topic}.\n\nOur team is already reviewing the details, and we will keep you updated with what we know, what we are doing next, and when you can expect the next checkpoint.\n\nWarmly,\nSMBFlow Enterprise Support`
  }
  if (tone === 'formal') {
    return `${greeting}\n\nThank you for notifying us. I am following up on ${topic}. We recognize the importance of this matter and have initiated an internal review with the appropriate support and engineering stakeholders.\n\nWe will provide a confirmed update within the stated response window, including current status and next steps.\n\nSincerely,\nSMBFlow Enterprise Support`
  }
  return `${greeting}\n\nThank you for flagging this. I understand this may be disruptive, and we are treating it with the urgency it deserves. I am following up on ${topic}.\n\nOur team is actively investigating now. We will follow up within the committed response window with a clear update on impact, next steps, and the path to resolution.\n\nBest,\nSMBFlow Enterprise Support`
}

function confidencePct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '90%'
  return `${Math.round(n <= 1 ? n * 100 : n)}%`
}

function Metric({ label, value }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

function EscDecideModal({ esc, onClose, api, onDone }) {
  const { payload, innerPayload, proposedAction } = getPayload(esc)
  const { recipient, subject, draft: initialDraft, source } = getDraftParts(esc)

  // Source email(s) this reply is addressed to — surfaced for transparency so the
  // reviewer can see exactly which inbound message(s) triggered the drafted response.
  const sourceList = (
    Array.isArray(payload.sources) ? payload.sources
    : Array.isArray(innerPayload.sources) ? innerPayload.sources
    : Array.isArray(proposedAction.sources) ? proposedAction.sources
    : (source && (source.sender || source.subject || source.message_id)) ? [source]
    : []
  ).filter(s => s && (s.sender || s.subject || s.message_id))
  const category = getCategory(esc)
  const categoryMeta = CATEGORY_META[category] || CATEGORY_META.routine_inquiry
  const urgencyScore = getUrgency(esc)
  const xai = esc.xai_explanation || payload.xai_explanation || innerPayload.xai_explanation || {}
  const metrics = xai.confidence_metrics || {}
  const keywords = esc.trigger_keywords || payload.trigger_keywords || innerPayload.trigger_keywords || []
  const sentiment = esc.detected_sentiment || payload.detected_sentiment || innerPayload.detected_sentiment || 'concerned'

  const isDraftApproval = !!(
    payload.draft_reply ||
    proposedAction.body ||
    payload.to_address ||
    payload.recipient ||
    esc.node_id === 'humanize_draft' ||
    esc.node_id === 'evaluate_actions' ||
    esc.review_type === 'email_response' ||
    esc.recommended_action === 'approve_draft'
  )

  const [action] = useState(esc?.recommended_action || (isDraftApproval ? 'approve_draft' : ''))
  const [decidedBy, setDecidedBy] = useState('Operator')
  const [notes, setNotes] = useState('')
  const [draftText, setDraftText] = useState(initialDraft)
  const [activeTone, setActiveTone] = useState('empathetic')
  const [xaiOpen, setXaiOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const applyTone = (tone) => {
    setActiveTone(tone)
    setDraftText(humanizeDraft(initialDraft, tone, recipient, subject))
  }

  const submitDecision = async (chosenAction) => {
    setLoading(true); setError('')
    try {
      const escId = esc?.id || esc?.escalation_id
      const patch = isDraftApproval
        ? { draft_reply: draftText, tone_selected: activeTone, proposed_action: { ...proposedAction, body: draftText } }
        : null
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
    <Modal open onClose={onClose} title={isDraftApproval ? 'Review Proposed Action' : 'Decision Required'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${categoryMeta.tone}`}>
                {categoryMeta.label}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 capitalize">
                {String(sentiment).replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{esc.context_brief || esc.reason}</p>
            <p className="text-xs text-gray-500 mt-1">{esc.reason}</p>
          </div>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-xs font-semibold text-red-700">Urgency Ranking</span>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-bold text-red-700">{urgencyScore}</span>
              <span className="text-xs text-red-600 mb-1">/ 10</span>
            </div>
          </div>
        </div>

        {isDraftApproval && (
          <div className="space-y-3 bg-white p-3.5 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-gray-500 block">Recipient</span>
                <p className="text-xs font-mono text-gray-800 bg-gray-50 px-2 py-1 rounded border border-gray-200 mt-0.5 truncate">{recipient}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500 block">Response Timer</span>
                <p className="text-xs font-medium text-gray-800 bg-gray-50 px-2 py-1 rounded border border-gray-200 mt-0.5">Target: within 60 minutes</p>
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-500 block">Subject</span>
              <p className="text-xs font-medium text-gray-900 bg-gray-50 px-2 py-1 rounded border border-gray-200 mt-0.5">{subject}</p>
            </div>

            {sourceList.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-600">
                    Replying To {sourceList.length > 1 ? `· ${sourceList.length} source emails` : '· source email'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sourceList.map((s, idx) => (
                    <div key={s.message_id || idx} className="bg-blue-50/60 border border-blue-100 rounded-lg px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-blue-500 font-semibold">From</span>
                        {s.message_id && (
                          <span className="text-[10px] font-mono text-gray-400 truncate max-w-[55%]" title={s.message_id}>
                            id: {s.message_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono font-semibold text-gray-900 truncate" title={s.sender}>
                        {s.sender || 'unknown sender'}
                      </p>
                      {s.subject && (
                        <p className="text-[11px] text-gray-600 truncate mt-0.5" title={s.subject}>
                          <span className="text-gray-400">Re:</span> {s.subject}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-600">Tone Selector</span>
                <span className="text-[10px] text-gray-400 font-mono">{draftText.length} characters</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {TONES.map(tone => (
                  <button
                    key={tone.key}
                    type="button"
                    title={tone.full}
                    onClick={() => applyTone(tone.key)}
                    className={`px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      activeTone === tone.key
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {tone.label}
                  </button>
                ))}
              </div>
              <textarea
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                rows={8}
                className="w-full border border-gray-300 rounded-lg p-3 text-xs font-mono bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
                placeholder="Compose or edit email draft..."
              />
            </div>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setXaiOpen(v => !v)}
            className="w-full px-3 py-2.5 bg-gray-50 flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Why did AI flag and draft this?
            </span>
            {xaiOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {xaiOpen && (
            <div className="p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500">Trigger Rationale</p>
                <p className="text-sm text-gray-700 mt-0.5">{xai.trigger_rationale || `Matched ${categoryMeta.label.toLowerCase()} signals with urgency ${urgencyScore}/10.`}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">Strategy Rationale</p>
                <p className="text-sm text-gray-700 mt-0.5">{xai.strategy_rationale || 'Recommended a human-reviewed response because the action is customer-facing and time-sensitive.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(keywords) ? keywords : []).map((kw, idx) => (
                  <span key={`${kw}-${idx}`} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">{kw}</span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Intent Match" value={confidencePct(metrics.intent_match || payload.confidence)} />
                <Metric label="Sentiment" value={confidencePct(metrics.sentiment_confidence)} />
                <Metric label="Safety" value={confidencePct(metrics.safety_boundary_cleared)} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reviewer Name</label>
          <input value={decidedBy} onChange={e => setDecidedBy(e.target.value)} placeholder="Jane Smith"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (Optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Approval comments..."
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {isDraftApproval ? (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => submitDecision('approve_draft')}
              disabled={loading}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {loading ? 'Processing...' : 'Approve Draft (Test Mode)'}
            </button>
            <button
              onClick={() => submitDecision('reject')}
              disabled={loading}
              className="px-4 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        ) : (
          <button onClick={() => submitDecision(action)} disabled={loading || !action}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            {loading ? 'Submitting...' : 'Submit Decision'}
          </button>
        )}
      </div>
    </Modal>
  )
}

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

function Tab({ label, active, onClick, icon: Icon }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}>
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </button>
  )
}

function FilterChip({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
        active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label} <span className={active ? 'text-gray-200' : 'text-gray-400'}>{count}</span>
    </button>
  )
}

function ActionRow({ item, onDecide }) {
  const isA2A = item._type === 'a2a'
  const isResolved = item.status === 'resolved' || item.status === 'decided' || item.status === 'approved' || item.status === 'rejected'
  const { payload } = getPayload(item)
  const isEmail = item.payload && (payload.draft_reply || payload.to_address || payload.proposed_action)
  const category = getCategory(item)
  const categoryMeta = CATEGORY_META[category] || CATEGORY_META.routine_inquiry
  const urgency = getUrgency(item)

  return (
    <div className="flex items-start gap-4 p-4 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors bg-white">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isResolved ? (item.status === 'rejected' ? 'bg-red-50' : 'bg-green-50')
        : (urgency >= 9 ? 'bg-red-50' : isEmail ? 'bg-blue-50' : 'bg-amber-50')
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
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {isEmail ? `Review Email Action: ${payload.subject || 'Incident Notice'}`
             : isA2A ? `${AGENT_LABELS[item.requesting_agent] || item.requesting_agent} -> ${AGENT_LABELS[item.target_agent] || item.target_agent}`
             : (item.node_id || 'Decision Required')}
          </p>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${categoryMeta.tone}`}>
            {categoryMeta.short}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
            item.status === 'approved' || item.status === 'resolved' ? 'bg-green-50 text-green-700 border border-green-200'
            : item.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {item.status || 'Pending'}
          </span>
        </div>
        <p className="text-sm text-gray-600">{truncate(item.reason, 140)}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1.5">
          <span>{timeAgo(item.created_at)}</span>
          <span className={urgency >= 9 ? 'text-red-600 font-semibold' : 'text-amber-600 font-medium'}>Urgency: {urgency}/10</span>
          {payload.detected_sentiment && <span className="capitalize">{String(payload.detected_sentiment).replace('_', ' ')}</span>}
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

function SummaryPanel({ items, pendingItems }) {
  const stats = useMemo(() => {
    const emailItems = items.filter(i => i._type !== 'a2a')
    const categoryCounts = {}
    const sentimentCounts = { positive: 0, neutral: 0, concerned: 0, urgent_negative: 0 }
    let urgencyTotal = 0
    let highest = 0

    emailItems.forEach(item => {
      const { payload } = getPayload(item)
      const category = getCategory(item)
      const urgency = getUrgency(item)
      const sentiment = payload.detected_sentiment || item.detected_sentiment || 'concerned'
      categoryCounts[category] = (categoryCounts[category] || 0) + 1
      sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1
      urgencyTotal += urgency
      highest = Math.max(highest, urgency)
    })

    return {
      total: emailItems.length,
      pending: pendingItems.filter(i => i._type !== 'a2a').length,
      categoryCounts,
      sentimentCounts,
      avgUrgency: emailItems.length ? (urgencyTotal / emailItems.length).toFixed(1) : '0.0',
      highest,
      slaMinutes: highest >= 9 ? 60 : 120,
    }
  }, [items, pendingItems])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={Inbox} label="Batch Volume" value={stats.total} helper="Reviewable items" />
        <KpiCard icon={AlertTriangle} label="Pending Approval" value={stats.pending} helper="Human decisions" />
        <KpiCard icon={Gauge} label="Avg Urgency" value={stats.avgUrgency} helper={`Highest ${stats.highest}/10`} />
        <KpiCard icon={Clock} label="Response SLA" value={`${stats.slaMinutes}m`} helper="Suggested timer" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900">Category Breakdown</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <ProgressRow key={key} label={meta.label} value={stats.categoryCounts[key] || 0} total={Math.max(stats.total, 1)} />
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareText className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-gray-900">Sentiment Distribution</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(stats.sentimentCounts).map(([label, value]) => (
              <ProgressRow key={label} label={label.replace('_', ' ')} value={value} total={Math.max(stats.total, 1)} />
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-900">Workflow Run Digest</h3>
        <p className="text-sm text-gray-600 mt-1">
          Latest action intelligence is prioritizing {stats.pending} pending customer-facing approval{stats.pending === 1 ? '' : 's'}.
          The queue is sorted by urgency and grouped by operational category so SLA, billing, outage, and executive partner risks are easy to triage.
        </p>
      </section>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{helper}</p>
    </div>
  )
}

function ProgressRow({ label, value, total }) {
  const pct = Math.round((value / total) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-gray-600 capitalize">{label}</span>
        <span className="text-gray-400">{value}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function EscalationsPage() {
  const { api } = useAuth()
  const { subscribe } = useWebSocket()

  const [mainTab, setMainTab] = useState('intelligence')
  const [statusTab, setStatusTab] = useState('pending')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [escs, setEscs] = useState([])
  const [a2as, setA2as] = useState([])
  const [resolved, setResolved] = useState([])
  const [loading, setLoading] = useState(true)
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
      subscribe('escalation_created', load),
      subscribe('escalation_resolved', load),
      subscribe('approval_created', load),
      subscribe('approval_decided', load),
      subscribe('a2a_permission_requested', load),
      subscribe('a2a_decided', load),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [subscribe, load])

  const pendingEscs = escs.map(e => ({ ...e, _type: 'escalation' }))
  const pendingA2a = a2as.filter(a => a.status === 'pending_permission').map(a => ({ ...a, _type: 'a2a' }))
  const resolvedItems = [
    ...resolved.map(e => ({ ...e, _type: 'escalation' })),
    ...a2as.filter(a => a.status !== 'pending_permission').map(a => ({ ...a, _type: 'a2a' })),
  ]

  const pendingItems = [...pendingEscs, ...pendingA2a].sort((a, b) => getUrgency(b) - getUrgency(a))
  const allItems = [...pendingItems, ...resolvedItems]
  const statusFiltered = statusTab === 'all' ? allItems
    : statusTab === 'pending' ? pendingItems
    : statusTab === 'approved' ? resolvedItems.filter(i => i.status === 'approved' || i.status === 'resolved' || i.action_chosen)
    : resolvedItems.filter(i => i.status === 'rejected')

  const filtered = statusFiltered.filter(item => categoryFilter === 'all' || item._type === 'a2a' || getCategory(item) === categoryFilter)
  const categoryCounts = Object.keys(CATEGORY_META).reduce((acc, key) => {
    acc[key] = allItems.filter(item => item._type !== 'a2a' && getCategory(item) === key).length
    return acc
  }, {})

  const handleDecide = (item) => {
    if (item._type === 'a2a') setA2aModal(item)
    else setDeciding(item)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Action Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">Human-in-the-loop review with explainable recommendations, urgency scoring, and humanized response drafts.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Tab label="Batch Summary & Intelligence" icon={BarChart3} active={mainTab === 'intelligence'} onClick={() => setMainTab('intelligence')} />
        <Tab label="Action Approvals" icon={CheckCircle2} active={mainTab === 'approvals'} onClick={() => setMainTab('approvals')} />
      </div>

      {mainTab === 'intelligence' ? (
        loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
        ) : (
          <SummaryPanel items={allItems} pendingItems={pendingItems} />
        )
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-lg p-1">
                {[['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) => (
                  <Tab key={v} label={l} active={statusTab === v} onClick={() => setStatusTab(v)} />
                ))}
              </div>
              <span className="text-sm text-gray-400 font-medium">{filtered.length} Items</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All" active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} count={allItems.length} />
              <FilterChip label="SLA Breaches" active={categoryFilter === 'sla_risk'} onClick={() => setCategoryFilter('sla_risk')} count={categoryCounts.sla_risk || 0} />
              <FilterChip label="Billing Disputes" active={categoryFilter === 'billing_dispute'} onClick={() => setCategoryFilter('billing_dispute')} count={categoryCounts.billing_dispute || 0} />
              <FilterChip label="Service Outages" active={categoryFilter === 'service_outage'} onClick={() => setCategoryFilter('service_outage')} count={categoryCounts.service_outage || 0} />
              <FilterChip label="Executive Partners" active={categoryFilter === 'executive_partner'} onClick={() => setCategoryFilter('executive_partner')} count={categoryCounts.executive_partner || 0} />
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Inbox className="w-10 h-10 text-gray-300" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-500">No actions require your attention</p>
                  <p className="text-xs text-gray-400 mt-1">AI recommendations will appear here when workflows generate decisions or email drafts requiring review.</p>
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
      )}

      {deciding && <EscDecideModal esc={deciding} onClose={() => setDeciding(null)} api={api} onDone={load} />}
      {a2aModal && <A2ADecideModal req={a2aModal} onClose={() => setA2aModal(null)} api={api} onDone={load} />}
    </div>
  )
}
