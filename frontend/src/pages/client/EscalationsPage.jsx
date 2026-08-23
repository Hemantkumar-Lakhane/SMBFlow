// frontend/src/pages/client/EscalationsPage.jsx
// Shows all pending and resolved escalations + A2A requests with decision forms.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }  from 'react-router-dom'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import {
  Card, Button, Modal, Input, Textarea, Alert, Spinner, EmptyState, Badge, TabGroup
} from '../../components/ui'
import { timeAgo, truncate, AGENT_ICONS, AGENT_LABELS, fmtCost } from '../../utils/helpers'

const POLL_MS = 8000

// ── Escalation decision modal ─────────────────────────────────────────────────
function EscDecideModal({ esc, onClose, api, onDone }) {
  const [action,    setAction]    = useState(esc?.recommended_action || '')
  const [decidedBy, setDecidedBy] = useState('')
  const [notes,     setNotes]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  if (!esc) return null

  const submit = async () => {
    if (!action || !decidedBy) { setError('Action and your name are required'); return }
    setLoading(true); setError('')
        try {
      const escId = esc?.id || esc?.escalation_id
      if (!escId) { setError('Escalation ID not found. Try refreshing.'); return }
      await api.post(`/escalations/${escId}/decide`, {
        decision:      { notes },
        action_chosen: action,
        decided_by:    decidedBy,
      })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="⚠️ Decision Required">
      <div className="space-y-4">
        {/* Context brief */}
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4">
          <div className="text-xs text-yellow-400 font-semibold mb-1 uppercase tracking-wide">
            Escalated at node: {esc.node_id}
          </div>
          <p className="text-sm text-gray-300">{esc.reason}</p>
        </div>

        {/* Full context */}
        {esc.context_brief && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Full Context</div>
            <pre className="text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded-lg p-3 overflow-auto max-h-36 whitespace-pre-wrap">
              {esc.context_brief}
            </pre>
          </div>
        )}

        {/* Agent recommendation */}
        {esc.recommended_action && (
          <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2 text-xs text-green-300">
            🤖 Agent recommends: <strong>{esc.recommended_action}</strong>
          </div>
        )}

        <Input
          label="Action to take *"
          value={action}
          onChange={e => setAction(e.target.value)}
          placeholder="e.g. send_csm_outreach_email"
          hint="Use an action_id from your action library"
          required
        />
        <Input
          label="Your name *"
          value={decidedBy}
          onChange={e => setDecidedBy(e.target.value)}
          placeholder="Jane Smith"
          required
        />
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Additional context for the audit trail…"
          rows={2}
        />
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        <Button
          variant="success"
          loading={loading}
          onClick={submit}
          disabled={!action || !decidedBy}
          className="w-full"
        >
          ✓ Submit Decision &amp; Resume Workflow
        </Button>
      </div>
    </Modal>
  )
}

// ── A2A decision modal ────────────────────────────────────────────────────────
function A2ADecideModal({ req, onClose, api, onDone }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  if (!req) return null

  const decide = async (approved) => {
    setLoading(true); setError('')
    try {
      await api.post(`/a2a/${req.a2a_id}/decide`, {
        approved,
        reason: approved ? 'Approved by user' : 'Rejected by user',
      })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="🤖 Agent-to-Agent Request">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 bg-blue-900/40 border border-blue-600/40 text-blue-300 text-xs rounded-full animate-pulse">
            Needs Your Approval
          </span>
          <span className="text-xs text-gray-500">Est. extra cost: {fmtCost(req.estimated_cost_usd || 0.001)}</span>
        </div>

        {/* Flow */}
        <div className="flex items-center gap-3 p-4 bg-gray-800/60 rounded-xl">
          <div className="text-center">
            <div className="text-2xl flex justify-center">{(() => { const Icon = AGENT_ICONS[req.requesting_agent]; return <Icon className="w-6 h-6" />; })()}</div>
            <div className="text-xs text-gray-400 mt-1">{AGENT_LABELS[req.requesting_agent] || req.requesting_agent}</div>
          </div>
          <div className="flex-1 text-center text-blue-400 text-xs px-2">↩ requests re-run</div>
          <div className="text-center">
            <div className="text-2xl flex justify-center">{(() => { const Icon = AGENT_ICONS[req.target_agent]; return <Icon className="w-6 h-6" />; })()}</div>
            <div className="text-xs text-gray-400 mt-1">{AGENT_LABELS[req.target_agent] || req.target_agent}</div>
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Reason</div>
          <p className="text-sm text-gray-300 bg-gray-800/50 rounded-lg p-3">{req.reason}</p>
        </div>

        {req.refinement_note && (
          <div>
            <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">What to look for</div>
            <p className="text-xs text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded-lg p-3 font-mono leading-relaxed">
              {req.refinement_note}
            </p>
          </div>
        )}


        {/* Feature 1: show extra tools the agent is requesting */}
        {req.new_tools && req.new_tools.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
              Extra Tools Requested
            </p>
            <div className="flex flex-wrap gap-1 mb-1">
              {req.new_tools.map(t => (
                <code
                  key={t}
                  className="text-[10px] text-green-300 bg-green-900/20 border border-green-800/40 rounded px-1.5 py-0.5"
                >
                  {t}
                </code>
              ))}
            </div>
            <p className="text-[10px] text-gray-600">
              These tools will be added to the agent's toolset for this re-run only.
              They were NOT in the original workflow definition.
            </p>
          </div>
        )}

        <div className="text-xs text-yellow-400">
          ⚠️ Allowing this will re-run the {AGENT_LABELS[req.target_agent] || req.target_agent} agent
          and add ~{fmtCost(req.estimated_cost_usd || 0.001)} to your session cost.
        </div>

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="flex gap-3">
          <Button variant="success" loading={loading} onClick={() => decide(true)}  className="flex-1">
            ✓ Allow Re-run
          </Button>
          <Button variant="danger"  loading={loading} onClick={() => decide(false)} className="flex-1">
            ✗ Reject
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main EscalationsPage ───────────────────────────────────────────────────────
export default function EscalationsPage() {
  const navigate       = useNavigate()
  const { api, user }  = useAuth()
  const { subscribe }  = useWebSocket()

  const [tab,      setTab]       = useState('pending')
  const [escs,     setEscs]      = useState([])
  const [a2as,     setA2as]      = useState([])
  const [resolved, setResolved]  = useState([])
  const [loading,  setLoading]   = useState(true)
  const [error,    setError]     = useState('')
  const [deciding, setDeciding]  = useState(null)  // escalation obj
  const [a2aDecide,setA2aDecide] = useState(null)  // a2a obj

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
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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

  const pendingCount = escs.length + a2as.filter(a => a.status === 'pending_permission').length

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🔔 Escalations &amp; A2A</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Human decisions required · {pendingCount > 0
              ? <span className="text-red-400 font-semibold">{pendingCount} need your attention</span>
              : 'all clear'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <TabGroup
        tabs={[
          { value: 'pending',  label: '⏳ Pending',  badge: pendingCount },
          { value: 'a2a',      label: '🤖 A2A',      badge: a2as.length },
          { value: 'resolved', label: '✓ Resolved',  badge: 0 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Pending escalations */}
      {tab === 'pending' && (
        <Card title="Pending Escalations" action={<span className="text-xs text-gray-500">{escs.length}</span>}>
          {escs.length === 0 ? (
            <EmptyState icon="✅" title="No pending escalations" description="Workflows are running autonomously" />
          ) : (
            <div className="space-y-3">
              {escs.map(e => (
                <div
                  key={e.id}
                  className="bg-yellow-900/10 border border-yellow-700/30 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-300 font-semibold text-sm">⚠️ {e.node_id}</span>
                        <span className="text-xs text-gray-500">{timeAgo(e.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-300">{truncate(e.reason, 120)}</p>
                      {e.recommended_action && (
                        <p className="text-xs text-green-400 mt-1">
                          🤖 Recommends: <strong>{e.recommended_action}</strong>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/workflows/${e.instance_id}`)}>
                        View Run →
                      </Button>
                      <Button size="sm" variant="warning" onClick={() => setDeciding(e)}>
                        Decide
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* A2A requests */}
      {tab === 'a2a' && (
        <Card title="Agent-to-Agent Requests" action={<span className="text-xs text-gray-500">{a2as.length}</span>}>
          {a2as.length === 0 ? (
            <EmptyState icon="🤖" title="No A2A requests" description="Agents are not requesting data refinements" />
          ) : (
            <div className="space-y-3">
              {a2as.map(a => (
                <div
                  key={a.a2a_id}
                  className={`border rounded-xl p-4 ${
                    a.status === 'pending_permission'
                      ? 'bg-blue-900/10 border-blue-700/30'
                      : a.status === 'approved'
                      ? 'bg-green-900/10 border-green-700/30'
                      : 'bg-gray-800/30 border-gray-700/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-blue-300 text-sm font-medium">
                          {AGENT_LABELS[a.requesting_agent] || a.requesting_agent}
                          {' → '}
                          {AGENT_LABELS[a.target_agent] || a.target_agent}
                        </span>
                        <Badge status={a.status === 'pending_permission' ? 'pending' : a.status} />
                        <span className="text-xs text-gray-500">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-300">{truncate(a.reason, 100)}</p>
                      <p className="text-xs text-yellow-400 mt-1">Est. cost: {fmtCost(a.estimated_cost_usd)}</p>
                    </div>
                    {a.status === 'pending_permission' && (
                      <Button size="sm" variant="ghost" onClick={() => setA2aDecide(a)} className="flex-shrink-0">
                        Decide
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Resolved */}
      {tab === 'resolved' && (
        <Card title="Resolved Escalations" action={<span className="text-xs text-gray-500">{resolved.length}</span>}>
          {resolved.length === 0 ? (
            <EmptyState icon="📋" title="No resolved escalations yet" />
          ) : (
            <div className="space-y-2">
              {resolved.slice(0, 30).map(e => (
                <div key={e.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-800/30 rounded-lg border border-gray-800/50">
                  <div className="min-w-0">
                    <span className="text-xs text-gray-400">{e.node_id}</span>
                    <span className="text-xs text-gray-600 ml-2">{truncate(e.reason, 60)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {e.action_chosen && (
                      <span className="text-xs text-green-400 font-mono">{e.action_chosen}</span>
                    )}
                    <span className="text-xs text-gray-500">{timeAgo(e.decided_at || e.created_at)}</span>
                    <Badge status="completed" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      {deciding  && <EscDecideModal  esc={deciding}   onClose={() => setDeciding(null)}   api={api} onDone={load} />}
      {a2aDecide && <A2ADecideModal  req={a2aDecide}  onClose={() => setA2aDecide(null)}  api={api} onDone={load} />}
    </div>
  )
}