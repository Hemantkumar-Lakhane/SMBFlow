// frontend/src/pages/client/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, CheckCircle2, AlertTriangle, DollarSign, Play, Pause,
  Square, RefreshCw, Plus, ChevronRight, Activity, Clock,
  TrendingUp, Bot, ArrowUpRight, Loader2,
} from 'lucide-react'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import {
  Card, StatCard, Badge, Button, Spinner, Alert, EmptyState,
  Modal, Select, Textarea, LiveDot, cn,
} from '../../components/ui'
import { fmtCost, timeAgo, truncate, AGENT_ICONS, AGENT_LABELS } from '../../utils/helpers'

const POLL_MS = 5000

// ── Trigger Modal ─────────────────────────────────────────────────────────────
function TriggerModal({ open, onClose, tenantId, api, onDone }) {
  const [workflow,  setWorkflow]  = useState('')
  const [workflows, setWorkflows] = useState([])
  const [signal,    setSignal]    = useState('{"type":"manual","source":"dashboard"}')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [estimate,  setEstimate]  = useState(null)
  const [estimating,setEstimating]= useState(false)

  useEffect(() => {
    if (!open) return
    api.get('/config/workflows').then(setWorkflows).catch(() => {})
  }, [open, api])

  const onWorkflowChange = async (wf) => {
    setWorkflow(wf)
    if (!wf || !tenantId) return
    setEstimating(true)
    try {
      const est = await api.get(`/workflows/estimate-cost?tenant_id=${tenantId}&workflow_name=${wf}`)
      setEstimate(est)
    } catch { setEstimate(null) }
    finally { setEstimating(false) }
  }

  const submit = async () => {
    if (!workflow) { setError('Select a workflow'); return }
    let signalData
    try { signalData = JSON.parse(signal) } catch { setError('Invalid JSON'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post('/workflows/trigger', { tenant_id: tenantId, workflow_name: workflow, signal_data: signalData })
      onDone(res); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Trigger Workflow" subtitle="Start a new autonomous workflow run">
      <div className="space-y-4">
        <Select
          label="Workflow"
          value={workflow}
          onChange={e => onWorkflowChange(e.target.value)}
          options={[{ value: '', label: '— select a workflow —' }, ...workflows.map(w => ({ value: w.name, label: `${w.display_name || w.name} (${w.name})` }))]}
        />

        {estimating && <div className="text-xs text-[rgb(var(--text-muted))] animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Estimating cost…</div>}

        {estimate && !estimating && (
          <div className="p-3 surface-card rounded-xl text-xs space-y-1.5">
            <p className="font-semibold text-[rgb(var(--text-secondary))] mb-2">Cost Estimate</p>
            <div className="flex justify-between">
              <span className="text-[rgb(var(--text-muted))]">Estimated cost</span>
              <span className="font-mono text-warning font-semibold">{estimate.estimated_cost_usd != null ? `$${estimate.estimated_cost_usd.toFixed(5)}` : '—'}</span>
            </div>
            {estimate.estimated_savings_pct > 0 && (
              <div className="flex justify-between">
                <span className="text-[rgb(var(--text-muted))]">Savings at current level</span>
                <span className="text-success">+{estimate.estimated_savings_pct.toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        <Textarea label="Trigger Signal (JSON)" value={signal} onChange={e => setSignal(e.target.value)} rows={3} hint="Context passed to all agents" />

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="flex gap-2">
          <Button variant="gradient" loading={loading} onClick={submit} className="flex-1" icon={<Zap className="w-4 h-4" />}>
            Launch Workflow
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Workflow Card ─────────────────────────────────────────────────────────────
function WorkflowCard({ w, api, navigate, onRefresh }) {
  const [controlling, setControlling] = useState(null)
  const isRunning = w.status === 'running'
  const isPaused  = w.status === 'paused'

  const control = async (action, e) => {
    e.stopPropagation()
    setControlling(action)
    try {
      await api.post(`/workflows/${w.run_id}/${action}`, {})
      await onRefresh()
    } finally { setControlling(null) }
  }

  const STATUS_BG = {
    running:   'border-success/25 bg-success/4',
    completed: 'border-emerald-500/20 bg-emerald-500/4',
    failed:    'border-danger/25 bg-danger/4',
    escalated: 'border-warning/25 bg-warning/4',
    paused:    'border-warning/20 bg-warning/4',
    stopped:   'border-[rgb(var(--border))] bg-[rgb(var(--bg-card))]',
    pending:   'border-[rgb(var(--border))] bg-[rgb(var(--bg-card))]',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative border rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:shadow-md group',
        STATUS_BG[w.status] || STATUS_BG.pending,
      )}
      onClick={() => navigate(`/workflows/${w.run_id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge status={w.status} />
            <p className="text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{w.workflow_name}</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[rgb(var(--text-muted))]">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(w.started_at)}</span>
            <span className="flex items-center gap-1 text-warning font-mono font-medium"><DollarSign className="w-3 h-3" />{fmtCost(w.total_cost_usd)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRunning && (
            <>
              <Button size="xs" variant="warning" onClick={(e) => control('pause', e)} loading={controlling === 'pause'} icon={<Pause className="w-3 h-3" />} />
              <Button size="xs" variant="danger"  onClick={(e) => control('stop',  e)} loading={controlling === 'stop'}  icon={<Square className="w-3 h-3" />} />
            </>
          )}
          {isPaused && (
            <Button size="xs" variant="success" onClick={(e) => control('resume', e)} loading={controlling === 'resume'} icon={<Play className="w-3 h-3" />} />
          )}
          <ChevronRight className="w-3.5 h-3.5 text-[rgb(var(--text-muted))] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {isRunning && (
        <div className="mt-2 flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-success animate-pulse" />
          <div className="flex-1 h-1 bg-[rgb(var(--bg-hover))] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-primary rounded-full animate-shimmer" style={{ width: '60%' }} />
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── A2A Banner ─────────────────────────────────────────────────────────────────
function A2ABanner({ req, api, onDone, navigate }) {
  const [loading, setLoading] = useState(false)
  const decide = async (approved) => {
    setLoading(true)
    try { await api.post(`/a2a/${req.a2a_id}/decide`, { approved }); onDone() }
    finally { setLoading(false) }
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-primary-500/8 border border-primary-500/25 rounded-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">Agent-to-Agent Request</p>
            <span className="px-2 py-0.5 bg-primary-500/10 text-primary-400 text-[10px] font-semibold rounded-full border border-primary-500/20 animate-pulse">
              Action Needed
            </span>
          </div>
          <p className="text-xs text-[rgb(var(--text-secondary))] mb-1">
            <span className="font-medium text-primary-400">{AGENT_LABELS[req.requesting_agent] || req.requesting_agent}</span>
            {' → '}
            <span className="font-medium text-primary-400">{AGENT_LABELS[req.target_agent] || req.target_agent}</span>
          </p>
          <p className="text-xs text-[rgb(var(--text-muted))]">{truncate(req.reason, 100)}</p>
          <p className="text-xs text-warning mt-1">Est. cost: {fmtCost(req.estimated_cost_usd || 0.001)}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="success" loading={loading} onClick={() => decide(true)}>✓ Allow</Button>
        <Button size="sm" variant="danger"  loading={loading} onClick={() => decide(false)}>✗ Reject</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/workflows/${req.run_id}`)}>View Run <ArrowUpRight className="w-3 h-3" /></Button>
      </div>
    </motion.div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate       = useNavigate()
  const { user, api }  = useAuth()
  const { subscribe }  = useWebSocket()
  const [workflows,   setWorkflows]   = useState([])
  const [escalations, setEscalations] = useState([])
  const [a2aRequests, setA2aRequests] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [trigger,     setTrigger]     = useState(false)
  const [filter,      setFilter]      = useState('all')

  const load = useCallback(async () => {
    try {
      const [wfs, escs, a2as] = await Promise.all([
        api.get('/workflows'),
        api.get('/escalations?status=pending').catch(() => []),
        api.get('/a2a/requests').catch(() => []),
      ])
      setWorkflows(Array.isArray(wfs) ? wfs : [])
      setEscalations(Array.isArray(escs) ? escs : [])
      setA2aRequests(Array.isArray(a2as) ? a2as : [])
      setError('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const unsubs = [
      subscribe('escalation_created',       load),
      subscribe('a2a_permission_requested', load),
      subscribe('a2a_decided',              load),
      subscribe('workflow_completed',       (ev) => {
        setWorkflows(p => p.map(w => w.run_id === ev.data?.run_id ? { ...w, status: 'completed' } : w))
        setTimeout(load, 500)
      }),
      subscribe('workflow_failed', (ev) => {
        setWorkflows(p => p.map(w => w.run_id === ev.data?.run_id ? { ...w, status: 'failed' } : w))
        setTimeout(load, 500)
      }),
      subscribe('workflow_stopped', load),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [subscribe, load])

  const myRuns = workflows.filter(w => !user?.tenant_id || w.tenant_id === user.tenant_id)
  const totalCost = myRuns.reduce((s, w) => s + (w.total_cost_usd || 0), 0)

  const stats = {
    running:   myRuns.filter(w => w.status === 'running').length,
    completed: myRuns.filter(w => ['completed','WorkflowStatus.COMPLETED'].includes(w.status)).length,
    pending:   escalations.length + a2aRequests.length,
    cost:      fmtCost(totalCost),
  }

  const FILTERS = ['all', 'running', 'completed', 'failed', 'escalated']
  const filtered = filter === 'all' ? myRuns : myRuns.filter(w => w.status === filter)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-3 animate-float">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm text-[rgb(var(--text-muted))]">Loading workflows…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--text-primary))]">
            Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">Monitor and manage your autonomous workflows</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load} icon={<RefreshCw className="w-3.5 h-3.5" />}>Refresh</Button>
          <Button variant="gradient" onClick={() => setTrigger(true)} icon={<Zap className="w-4 h-4" />}>Launch Workflow</Button>
        </div>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Activity,     label: 'Active Runs',   value: stats.running,   color: 'text-success' },
          { icon: CheckCircle2, label: 'Completed',     value: stats.completed, color: 'text-emerald-400' },
          { icon: AlertTriangle,label: 'Need Action',   value: stats.pending,   color: stats.pending > 0 ? 'text-danger' : 'text-[rgb(var(--text-muted))]' },
          { icon: DollarSign,   label: 'Total Cost',    value: stats.cost,      color: 'text-warning' },
        ].map(({ icon, label, value, color }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <StatCard icon={icon} label={label} value={value} color={color} />
          </motion.div>
        ))}
      </div>

      {/* A2A Alerts */}
      <AnimatePresence>
        {a2aRequests.map(req => (
          <A2ABanner key={req.a2a_id} req={req} api={api} onDone={load} navigate={navigate} />
        ))}
      </AnimatePresence>

      {/* Escalation Alerts */}
      <AnimatePresence>
        {escalations.slice(0, 2).map(esc => (
          <motion.div
            key={esc.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-warning/8 border border-warning/25 rounded-2xl flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">Escalation: {esc.node_id}</p>
                  <span className="px-2 py-0.5 bg-warning/10 text-warning text-[10px] rounded-full border border-warning/20 animate-pulse">Decision Needed</span>
                </div>
                <p className="text-xs text-[rgb(var(--text-muted))]">{truncate(esc.reason, 100)}</p>
              </div>
            </div>
            <Button size="sm" variant="warning" onClick={() => navigate('/escalations')}>Decide</Button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Workflow list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[rgb(var(--text-primary))]">Workflow Runs</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-[rgb(var(--bg-base))] rounded-xl p-1 gap-0.5">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-[11px] font-semibold capitalize transition-all',
                    filter === f ? 'bg-[rgb(var(--bg-card))] text-[rgb(var(--text-primary))] shadow-sm' : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-xs text-[rgb(var(--text-muted))]">{filtered.length} runs</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={filter === 'all' ? 'No workflows yet' : `No ${filter} workflows`}
            description="Launch your first workflow to get started"
            action={<Button variant="gradient" onClick={() => setTrigger(true)} icon={<Plus className="w-4 h-4" />}>Launch Workflow</Button>}
          />
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
            }}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence>
              {filtered.slice(0, 30).map(w => (
                <motion.div
                  key={w.run_id}
                  variants={{
                    hidden: { opacity: 0, y: 12, scale: 0.98 },
                    show:   { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
                  }}
                >
                  <WorkflowCard w={w} api={api} navigate={navigate} onRefresh={load} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </Card>

      <TriggerModal
        open={trigger}
        onClose={() => setTrigger(false)}
        tenantId={user?.tenant_id}
        api={api}
        onDone={(res) => {
          if (res?.run_id) navigate(`/workflows/${res.run_id}`)
          else load()
        }}
      />
    </div>
  )
}