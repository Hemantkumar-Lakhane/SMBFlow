// frontend/src/pages/admin/GodView.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, DollarSign, Bell, Wifi, Pause, Play, Square,
  RefreshCw, Zap, Users, Activity, AlertTriangle, Bot,
  ChevronRight, Circle, TrendingUp, Eye,
} from 'lucide-react'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import {
  Card, StatCard, Badge, Button, Spinner, Alert, EmptyState,
  Modal, Input, Textarea, Select, LiveDot, cn,
} from '../../components/ui'
import { fmtCost, fmtTokens, timeAgo, truncate, AGENT_ICONS, AGENT_LABELS } from '../../utils/helpers'

const POLL_MS = 6000

// ── Trigger Modal ─────────────────────────────────────────────────────────────
function TriggerModal({ open, onClose, tenants, onDone, api }) {
  const [tenantId, setTenantId]   = useState('')
  const [workflow, setWorkflow]   = useState('')
  const [workflows, setWorkflows] = useState([])
  const [signal, setSignal]       = useState('{"type":"manual","source":"admin"}')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!open) return
    api.get('/config/workflows').then(setWorkflows).catch(() => {})
    if (tenants.length > 0 && !tenantId) setTenantId(tenants[0].id)
  }, [open, tenants, api, tenantId])

  const submit = async () => {
    if (!tenantId || !workflow) { setError('Select a tenant and workflow'); return }
    let signalData
    try { signalData = JSON.parse(signal) } catch { setError('Invalid signal JSON'); return }
    setLoading(true); setError('')
    try {
      await api.post('/workflows/trigger', { tenant_id: tenantId, workflow_name: workflow, signal_data: signalData })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="⚡ Trigger Workflow" subtitle="Start a run for any tenant">
      <div className="space-y-4">
        <Select label="Tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} options={tenants.map(t => ({ value: t.id, label: t.name }))} />
        <Select label="Workflow" value={workflow} onChange={e => setWorkflow(e.target.value)} options={[{ value: '', label: '— select —' }, ...workflows.map(w => ({ value: w.name, label: `${w.display_name || w.name} (${w.name})` }))]} />
        <Textarea label="Trigger Signal (JSON)" value={signal} onChange={e => setSignal(e.target.value)} rows={3} hint="JSON object passed to all agents" />
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="gradient" className="flex-1" loading={loading} onClick={submit} icon={<Zap className="w-4 h-4" />}>Launch Workflow</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Escalation Decide Modal ────────────────────────────────────────────────────
function EscDecideModal({ esc, onClose, api, onDone }) {
  const [action, setAction] = useState(esc?.recommended_action || '')
  const [by, setBy]         = useState('Admin')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!esc) return null

  const submit = async () => {
    if (!action) { setError('Action required'); return }
    setLoading(true); setError('')
    try {
      const escId = esc?.id || esc?.escalation_id
      if (!escId) { setError('Escalation ID not found'); return }
      await api.post(`/escalations/${escId}/decide`, { decision: { by }, action_chosen: action, decided_by: by })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="⚠️ Decide Escalation">
      <div className="space-y-4">
        <div className="p-3 bg-warning/8 border border-warning/25 rounded-xl text-sm text-[rgb(var(--text-secondary))]">{esc.reason}</div>
        {esc.context_brief && <pre className="text-xs text-[rgb(var(--text-secondary))] bg-[rgb(var(--bg-base))] border border-[rgb(var(--border))] rounded-xl p-3 overflow-auto max-h-24 whitespace-pre-wrap">{esc.context_brief}</pre>}
        {esc.recommended_action && <Alert type="success">🤖 Recommends: <strong>{esc.recommended_action}</strong></Alert>}
        <Input label="Action *" value={action} onChange={e => setAction(e.target.value)} placeholder="action_id" required />
        <Input label="Decided By" value={by} onChange={e => setBy(e.target.value)} />
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        <Button variant="success" loading={loading} onClick={submit} className="w-full">Submit & Resume Workflow</Button>
      </div>
    </Modal>
  )
}

// ── A2A Decide Modal ──────────────────────────────────────────────────────────
function A2ADecideModal({ req, onClose, api, onDone }) {
  const [loading, setLoading] = useState(false)
  if (!req) return null
  const decide = async (approved) => {
    setLoading(true)
    try { await api.post(`/a2a/${req.a2a_id}/decide`, { approved }); onDone(); onClose() }
    finally { setLoading(false) }
  }
  return (
    <Modal open onClose={onClose} title="🤖 A2A Request">
      <div className="space-y-4">
        <div className="flex items-center gap-4 p-4 bg-primary-500/8 border border-primary-500/20 rounded-2xl">
          <div className="text-center"><div className="text-2xl">{AGENT_ICONS[req.requesting_agent]||'🤖'}</div><div className="text-[10px] text-[rgb(var(--text-muted))] mt-1">{AGENT_LABELS[req.requesting_agent]||req.requesting_agent}</div></div>
          <div className="flex-1 text-center text-xs text-primary-400">↩ re-run</div>
          <div className="text-center"><div className="text-2xl">{AGENT_ICONS[req.target_agent]||'🤖'}</div><div className="text-[10px] text-[rgb(var(--text-muted))] mt-1">{AGENT_LABELS[req.target_agent]||req.target_agent}</div></div>
        </div>
        <div className="text-sm text-[rgb(var(--text-secondary))] bg-[rgb(var(--bg-base))] rounded-xl p-3 leading-relaxed">{req.reason}</div>
        {req.refinement_note && <div className="text-xs text-primary-400 bg-primary-500/8 border border-primary-500/20 rounded-xl p-3 font-mono leading-relaxed">{req.refinement_note}</div>}
        <p className="text-xs text-warning">Est. cost: {fmtCost(req.estimated_cost_usd || 0.001)}</p>
        <div className="flex gap-2">
          <Button variant="success" loading={loading} onClick={() => decide(true)} className="flex-1">✓ Allow</Button>
          <Button variant="danger"  loading={loading} onClick={() => decide(false)} className="flex-1">✗ Reject</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tenant Heatmap Cell ────────────────────────────────────────────────────────
function TenantCell({ tenant, cost, runs, active }) {
  const intensity = Math.min(100, (cost / 1) * 100) // normalize
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative border rounded-xl p-4 transition-all hover:border-primary-500/40 cursor-default"
      style={{
        background: `rgba(108,99,255,${Math.max(0.02, Math.min(0.15, cost / 5))})`,
        borderColor: `rgba(108,99,255,${Math.max(0.1, Math.min(0.4, cost / 5))})`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{tenant.name}</p>
          <p className="text-[11px] text-[rgb(var(--text-muted))]">{tenant.industry} · {runs} runs</p>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-sm font-bold text-warning font-mono">{fmtCost(cost)}</p>
          {active > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-success">
              <Circle className="w-2 h-2 fill-current" />
              {active} active
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main GodView ──────────────────────────────────────────────────────────────
export default function GodView() {
  const { api }                = useAuth()
  const { events, status, subscribe } = useWebSocket()
  const navigate               = useNavigate()
  const [data, setData]        = useState(null)
  const [loading, setLoading]  = useState(true)
  const [error, setError]      = useState('')
  const [controlling, setControlling] = useState({})
  const [showTrigger, setShowTrigger] = useState(false)
  const [escDecide, setEscDecide]     = useState(null)
  const [a2aDecide, setA2ADecide]     = useState(null)
  const eventRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const d = await api.get('/admin/god-view')
      setData(d); setError('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (eventRef.current) eventRef.current.scrollTop = eventRef.current.scrollHeight
  }, [events])

  const control = async (runId, action) => {
    setControlling(p => ({ ...p, [runId]: action }))
    try { await api.post(`/workflows/${runId}/${action}`, {}); await load() }
    catch (err) { setError(err.message) }
    finally { setControlling(p => { const n = { ...p }; delete n[runId]; return n }) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  const { fleet_stats = {}, active_workflows = [], all_workflows = [], tenants = [], pending_escalations = [], pending_a2a = [] } = data || {}
  const liveEvents = [...events].reverse().slice(0, 60)

  // Compute tenant cost map
  const tenantCostMap = all_workflows.reduce((acc, w) => {
    const tid = w.tenant_id
    if (!acc[tid]) acc[tid] = { cost: 0, runs: 0, active: 0 }
    acc[tid].cost  += (w.total_cost_usd || 0)
    acc[tid].runs  += 1
    if (w.status === 'running') acc[tid].active += 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))] flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary-400" />
            Admin God View
          </h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">Full system visibility — all tenants, all workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-primary-500/10 text-primary-400 border border-primary-500/20 rounded-full text-xs font-semibold">SUPER ADMIN</span>
          <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border', status === 'connected' ? 'bg-success/8 border-success/25 text-success' : 'bg-[rgb(var(--bg-hover))] border-[rgb(var(--border))] text-[rgb(var(--text-muted))]')}>
            <LiveDot color={status === 'connected' ? 'green' : 'gray'} pulse={status === 'connected'} />
            {status}
          </div>
          <Button size="sm" variant="secondary" onClick={load} icon={<RefreshCw className="w-3.5 h-3.5" />} />
          <Button size="sm" variant="gradient" onClick={() => setShowTrigger(true)} icon={<Zap className="w-4 h-4" />}>Trigger</Button>
        </div>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Activity,  label: 'Active Workflows',   value: active_workflows.length,            color: 'text-success' },
          { icon: DollarSign,label: 'Fleet Cost',         value: fmtCost(fleet_stats.total_cost_usd), color: 'text-warning' },
          { icon: Bell,      label: 'Pending Escalations',value: pending_escalations.length,          color: pending_escalations.length > 0 ? 'text-danger' : 'text-[rgb(var(--text-muted))]' },
          { icon: Wifi,      label: 'WS Clients',         value: fleet_stats.ws_clients || 0,         color: 'text-accent' },
        ].map(({ icon, label, value, color }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <StatCard icon={icon} label={label} value={value} color={color} />
          </motion.div>
        ))}
      </div>

      {/* Two-column: live event feed + active runs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Live Event Feed */}
        <Card title="Live Event Stream" action={<LiveDot color={status === 'connected' ? 'green' : 'gray'} pulse={status === 'connected'} />}>
          <div className="bg-[rgb(var(--bg-base))] rounded-xl border border-[rgb(var(--border))] overflow-hidden">
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-[rgb(var(--border))] bg-[rgb(var(--bg-elevated))]">
              <div className="w-3 h-3 rounded-full bg-danger/60" /><div className="w-3 h-3 rounded-full bg-warning/60" /><div className="w-3 h-3 rounded-full bg-success/60" />
              <span className="text-[11px] font-mono text-[rgb(var(--text-muted))] ml-2">live.stream</span>
            </div>
            <div ref={eventRef} className="h-48 overflow-y-auto px-4 py-2 space-y-0 font-mono text-[11px]">
              {liveEvents.length === 0 && <div className="text-[rgb(var(--text-muted))] py-4 text-center">Waiting for events…</div>}
              {liveEvents.map((ev, i) => (
                <div key={i} className={cn('flex gap-2 py-0.5 border-b border-[rgb(var(--border-subtle))]/20',
                  ev.type?.includes('fail') ? 'text-danger' : ev.type?.includes('complet') ? 'text-success' : ev.type?.includes('escalat') ? 'text-warning' : ev.type?.includes('a2a') ? 'text-primary-400' : 'text-[rgb(var(--text-muted))]'
                )}>
                  <span className="text-[rgb(var(--text-muted))]/50 flex-shrink-0 tabular-nums">{ev._receivedAt?.slice(11,19)}</span>
                  <span className="flex-shrink-0 text-[10px]">[{ev.type}]</span>
                  <span className="truncate text-[rgb(var(--text-muted))]">
                    {ev.data?.run_id?.slice(0,8)}{ev.data?.workflow && ` · ${ev.data.workflow}`}{ev.data?.cost_usd != null && ` · ${fmtCost(ev.data.cost_usd)}`}
                    {ev.data?.tenant_id && ` · ${tenants.find(t=>t.id===ev.data?.tenant_id)?.name||ev.data?.tenant_id?.slice(0,8)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Active Runs */}
        <Card title="Active Runs" action={<Badge status="running">{active_workflows.length} running</Badge>}>
          <div className="space-y-2">
            {active_workflows.length === 0 && <EmptyState icon={Activity} title="No active workflows" description="All quiet on the frontier" />}
            {active_workflows.slice(0, 5).map(w => {
              const tenant = tenants.find(t => t.id === w.tenant_id)
              return (
                <div
                  key={w.run_id}
                  className="flex items-center justify-between p-3 border border-[rgb(var(--border))] rounded-xl hover:border-primary-500/30 cursor-pointer hover:bg-[rgb(var(--bg-hover))] transition-all"
                  onClick={() => navigate(`/workflows/${w.run_id}`)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5"><Badge status={w.status} /><span className="text-xs font-semibold text-[rgb(var(--text-primary))] truncate">{w.workflow_name}</span></div>
                    <p className="text-[11px] text-[rgb(var(--text-muted))]">{tenant?.name||w.tenant_id?.slice(0,8)} · {timeAgo(w.started_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-warning font-mono font-semibold">{fmtCost(w.total_cost_usd)}</span>
                    {w.status === 'running' && <><Button size="xs" variant="warning" loading={controlling[w.run_id]==='pause'} onClick={()=>control(w.run_id,'pause')} icon={<Pause className="w-3 h-3"/>}/><Button size="xs" variant="danger" loading={controlling[w.run_id]==='stop'} onClick={()=>control(w.run_id,'stop')} icon={<Square className="w-3 h-3"/>}/></>}
                    {w.status === 'paused' && <Button size="xs" variant="success" loading={controlling[w.run_id]==='resume'} onClick={()=>control(w.run_id,'resume')} icon={<Play className="w-3 h-3"/>}/>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Pending Escalations */}
      {pending_escalations.length > 0 && (
        <Card title={`⚠️ Pending Escalations (${pending_escalations.length})`}>
          <div className="space-y-2">
            {pending_escalations.map(e => {
              const tenant = tenants.find(t => t.id === e.tenant_id)
              return (
                <div key={e.id} className="flex items-center justify-between p-3 bg-warning/5 border border-warning/20 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-warning">{e.node_id}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))]">{truncate(e.reason, 80)}</p>
                    <p className="text-[11px] text-[rgb(var(--text-muted))] mt-0.5">{tenant?.name||e.tenant_id?.slice(0,8)} · {timeAgo(e.created_at)}</p>
                  </div>
                  <Button size="sm" variant="warning" onClick={() => setEscDecide(e)}>Decide</Button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Pending A2A */}
      {pending_a2a.length > 0 && (
        <Card title={`🤖 Pending A2A (${pending_a2a.length})`}>
          <div className="space-y-2">
            {pending_a2a.map(a => {
              const tenant = tenants.find(t => t.id === a.tenant_id)
              return (
                <div key={a.a2a_id} className="flex items-center justify-between p-3 bg-primary-500/5 border border-primary-500/20 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-primary-400">{AGENT_LABELS[a.requesting_agent]||a.requesting_agent} → {AGENT_LABELS[a.target_agent]||a.target_agent}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))]">{truncate(a.reason, 70)}</p>
                    <p className="text-[11px] text-[rgb(var(--text-muted))] mt-0.5">{tenant?.name||a.tenant_id?.slice(0,8)} · Est. {fmtCost(a.estimated_cost_usd)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setA2ADecide(a)}>Decide</Button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Tenant Heatmap */}
      <Card title="Tenant Cost Heatmap">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tenants.map(t => {
            const d = tenantCostMap[t.id] || { cost: 0, runs: 0, active: 0 }
            return <TenantCell key={t.id} tenant={t} cost={d.cost} runs={d.runs} active={d.active} />
          })}
          {tenants.length === 0 && <div className="col-span-full text-center text-sm text-[rgb(var(--text-muted))] py-8">No tenants registered</div>}
        </div>
      </Card>

      {/* All Workflows Table */}
      <Card title="All Workflow Runs" action={<span className="text-xs text-[rgb(var(--text-muted))]">{all_workflows.length} total</span>} noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[rgb(var(--text-muted))] border-b border-[rgb(var(--border))]">
                {['Run ID','Workflow','Tenant','Status','Cost','Tokens','Started','Actions'].map(h => (
                  <th key={h} className={cn('px-4 py-3 font-medium text-left first:pl-5', ['Cost','Tokens'].includes(h) && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all_workflows.slice(0, 25).map(w => {
                const tenant = tenants.find(t => t.id === w.tenant_id)
                return (
                  <tr key={w.run_id} className="border-b border-[rgb(var(--border-subtle))] hover:bg-[rgb(var(--bg-hover))] cursor-pointer transition-colors" onClick={() => navigate(`/workflows/${w.run_id}`)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-[rgb(var(--text-muted))]">{w.run_id?.slice(0,8)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[rgb(var(--text-primary))] max-w-[120px] truncate">{w.workflow_name}</td>
                    <td className="px-4 py-3 text-xs text-[rgb(var(--text-secondary))]">{tenant?.name||w.tenant_id?.slice(0,8)}</td>
                    <td className="px-4 py-3"><Badge status={w.status} /></td>
                    <td className="px-4 py-3 text-right text-xs text-warning font-mono font-semibold">{fmtCost(w.total_cost_usd)}</td>
                    <td className="px-4 py-3 text-right text-xs text-[rgb(var(--text-muted))] font-mono">{fmtTokens(w.total_tokens_in)}</td>
                    <td className="px-4 py-3 text-right text-xs text-[rgb(var(--text-muted))]">{timeAgo(w.started_at)}</td>
                    <td className="px-4 py-3 text-right pr-5" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {w.status === 'running' && <><Button size="xs" variant="warning" loading={controlling[w.run_id]==='pause'} onClick={()=>control(w.run_id,'pause')} icon={<Pause className="w-3 h-3"/>}/><Button size="xs" variant="danger" loading={controlling[w.run_id]==='stop'} onClick={()=>control(w.run_id,'stop')} icon={<Square className="w-3 h-3"/>}/></>}
                        {w.status === 'paused' && <Button size="xs" variant="success" loading={controlling[w.run_id]==='resume'} onClick={()=>control(w.run_id,'resume')} icon={<Play className="w-3 h-3"/>}/>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!all_workflows.length && <EmptyState icon={Activity} title="No workflow runs yet" description="Trigger a workflow to get started" />}
        </div>
      </Card>

      {/* Modals */}
      <TriggerModal open={showTrigger} onClose={() => setShowTrigger(false)} tenants={tenants} api={api} onDone={load} />
      {escDecide && <EscDecideModal esc={escDecide} onClose={() => setEscDecide(null)} api={api} onDone={load} />}
      {a2aDecide && <A2ADecideModal req={a2aDecide} onClose={() => setA2ADecide(null)} api={api} onDone={load} />}
    </div>
  )
}