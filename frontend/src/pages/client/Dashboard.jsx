// frontend/src/pages/client/Dashboard.jsx
// Matches Figma: Home screen — KPI cards, Recent Activity, Workflow Performance, Cost Overview

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, RefreshCw, ArrowUpRight, CheckCircle2, AlertTriangle, Play, Zap, DollarSign, BookOpen, Sparkles } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { fmtCost, timeAgo } from '../../utils/helpers'

const POLL_MS = 5000

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, icon, value, sub, chart }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
      {chart && (
        <div className="absolute bottom-3 right-3 w-20 h-8 opacity-60">
          {chart}
        </div>
      )}
    </div>
  )
}

// ── Timeline Item ─────────────────────────────────────────────────────────────
function TimelineItem({ run, isLast }) {
  const isCompleted = run.status === 'completed' || run.status === 'WorkflowStatus.COMPLETED'
  const isRunning   = run.status === 'running'
  const isEscalated = run.status === 'escalated' || run.status === 'pending' || run.status === 'pending_a2a'
  const isFailed    = run.status === 'failed' || run.status === 'stopped'

  let icon, badge
  if (isCompleted) {
    icon  = <CheckCircle2 className="w-5 h-5 text-green-500" />
    badge = <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Completed</span>
  } else if (isRunning) {
    icon  = <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    badge = <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">In Progress</span>
  } else if (isEscalated) {
    icon  = <AlertTriangle className="w-5 h-5 text-amber-500" />
    badge = <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Awaiting Approval</span>
  } else if (isFailed) {
    icon  = <AlertTriangle className="w-5 h-5 text-red-500" />
    badge = <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Failed</span>
  } else {
    icon  = <Play className="w-4 h-4 text-gray-400" />
    badge = <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">{run.status}</span>
  }

  return (
    <div className="relative flex gap-4">
      {/* Connector line */}
      {!isLast && <div className="absolute left-[9px] top-6 bottom-0 w-px bg-gray-200" />}
      {/* Icon */}
      <div className="w-5 h-5 mt-0.5 flex-shrink-0 bg-white z-10">{icon}</div>
      {/* Content */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-sm font-semibold text-gray-900">{run.name || run.workflow_name}</p>
          {badge}
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{run.description || run.workflow_name}</p>
        <p className="text-xs text-gray-400 mt-1 font-medium">{timeAgo(run.timestamp || run.started_at)}</p>
      </div>
    </div>
  )
}

// ── Progress Row ──────────────────────────────────────────────────────────────
function ProgressRow({ name, pct, color, runs, onOpen }) {
  return (
    <div
      onClick={onOpen}
      className={onOpen ? 'cursor-pointer group -mx-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors' : undefined}
      title={onOpen ? `Open ${name} in builder` : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className={`text-sm font-semibold text-gray-900 truncate${onOpen ? ' group-hover:text-blue-600 transition-colors' : ''}`}>{name}</p>
        {runs != null && (
          <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">
            {runs} {runs === 1 ? 'run' : 'runs'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold text-gray-900 w-9 text-right">{pct}%</span>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate      = useNavigate()
  const { user, api, isAdmin } = useAuth()
  const { subscribe } = useWebSocket()

  const [data,           setData]           = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [workflowCount,  setWorkflowCount]  = useState(null)  // org-specific, industry-filtered

  const load = useCallback(async () => {
    // Guard: do not call /dashboard/null if org context isn't resolved yet
    if (!user?.tenant_id) {
      setLoading(false)
      return
    }
    try {
      const res = await api.get(`/dashboard/${user.tenant_id}`)
      setData(res)
      setError('')
    } catch (err) {
      // 404 = org exists but no data yet (new workspace) — show empty state, not error
      if (err?.status === 404 || err?.response?.status === 404) {
        setData(null)
        setError('')
      } else if (err?.status === 403 || err?.response?.status === 403) {
        if (user?.is_email_confirmed === false && user?.email_verification_sent) {
          setError('📧 Please verify your email. A confirmation link was sent to your inbox.')
        } else {
          setData(null)
          setError('')
        }
      } else {
        setError('')
      }
    } finally {
      setLoading(false)
    }
  }, [api, user?.tenant_id])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const unsubs = [
      subscribe('escalation_created', load),
      subscribe('workflow_completed', load),
      subscribe('workflow_failed', load),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [subscribe, load])

  // Load org-specific workflow count (industry-filtered, assignment-enforced)
  useEffect(() => {
    if (!user?.tenant_id) return
    api.get('/catalog/assigned')
      .then(data => setWorkflowCount(Array.isArray(data) ? data.length : null))
      .catch(() => setWorkflowCount(null))
  }, [api, user?.tenant_id])

  const chartData = data?.cost_overview?.daily_trend?.map((item, idx) => ({ idx, cost: item.cost })) || []
  const sparkData = data?.tasks_completed?.trend?.map((v, idx) => ({ idx, v })) || []

  const activeRuns    = data?.active_runs?.current ?? 0
  const activeRunning = data?.active_runs?.running ?? 0
  const activeAwait   = data?.active_runs?.awaiting ?? 0
  const pendingAppr   = data?.pending_approvals?.total ?? 0
  const tasksComp     = data?.tasks_completed?.total ?? 0
  const netSavings    = data?.net_savings?.value != null ? fmtCost(data.net_savings.value) : '—'
  const activity      = data?.recent_activity || []
  const performance   = data?.workflow_performance || []
  const mtdSpend      = data?.cost_overview?.mtd_spend || 0
  const avgCost       = data?.cost_overview?.avg_cost_per_run || 0

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-950 min-h-full transition-colors">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Real-time operational summary, KPIs, and autonomous workflow performance</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/copilot')}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Assistant</span>
          </button>

          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-blue-600" />
            <span>Run Workflow</span>
          </button>
        </div>
      </div>

      {/* AI Assistant Quick Assist Banner */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-600/10 via-blue-600/5 to-transparent border border-purple-200/60 dark:border-purple-800/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Workflow AI Assistant</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold">
                Autonomous Node Engine
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Describe your business automation needs or ask the assistant to synthesize operational workflows.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/copilot')}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Summarize Emails
          </button>
          <button
            onClick={() => navigate('/copilot')}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Review Approvals
          </button>
          <button
            onClick={() => navigate('/copilot')}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>Open Assistant</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className={`mb-4 p-4 rounded-xl text-sm flex items-center gap-3 border ${
          error.includes('📧')
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-sm'
            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard
          title="Active Runs"
          icon={<Activity className="w-4 h-4" />}
          value={loading ? '—' : activeRuns}
          sub={
            loading
              ? ''
              : activeRuns > 0
                ? `${activeRunning} running · ${activeAwait} awaiting`
                : `${data?.active_runs?.initiated_today || 0} initiated today`
          }
        />
        <KpiCard
          title="Pending Approvals"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          value={loading ? '—' : pendingAppr || <span className="text-slate-400">0</span>}
          sub={pendingAppr ? 'Require attention' : 'No approvals pending'}
        />
        <KpiCard
          title="Tasks Completed"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          value={loading ? '—' : tasksComp || <span className="text-slate-400">0</span>}
          sub={tasksComp ? 'Actions processed' : 'No tasks completed'}
          chart={sparkData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        />
        <KpiCard
          title="Available Workflows"
          icon={<BookOpen className="w-4 h-4 text-blue-500" />}
          value={workflowCount != null ? workflowCount : <span className="text-slate-400">—</span>}
          sub="Assigned to your workspace"
        />
        <KpiCard
          title="Net Savings"
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
          value={loading ? '—' : <span className={netSavings === '—' ? 'text-slate-400 text-lg' : ''}>{netSavings || <span className="text-slate-400">No data</span>}</span>}
          sub="Governor cost optimization"
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-7">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-6 h-full transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Recent Activity</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/workflows')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  View all <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Activity className="w-8 h-8 opacity-30 animate-pulse" />
                  <p className="text-sm">Loading activity…</p>
                </div>
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No activity yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Activity will appear here once workflows start running.</p>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                {activity.map((run, i) => (
                  <TimelineItem key={run.id || i} run={run} isLast={i === activity.length - 1} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Workflow Performance */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-6 transition-colors">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Workflow Performance</h2>
              <button
                onClick={() => navigate('/workflows')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {performance.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 gap-2">
                <div className="w-8 h-8 text-slate-300 dark:text-slate-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No workflows to report</p>
                  <p className="text-xs text-slate-400 mt-0.5">Assigned workflows will show execution rates here.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {performance.slice(0, 5).map((p, i) => {
                  const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-amber-500', 'bg-red-400']
                  return <ProgressRow key={p.name} name={p.name} pct={p.success_rate || 0} color={colors[i] || 'bg-blue-500'} runs={p.runs} onOpen={() => navigate('/workflows')} />
                })}
              </div>
            )}
          </div>

          {/* Cost Overview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-6 transition-colors">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Cost Overview</h2>

            {chartData.length === 0 && mtdSpend === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 gap-2">
                <DollarSign className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No spend data</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cost data will appear once workflows execute.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">MTD Spend</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fmtCost(mtdSpend)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Avg / run</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{fmtCost(avgCost)}</p>
                  </div>
                </div>
                <div className="h-24 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Tooltip
                        contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, fontSize: 12, color: '#fff' }}
                        formatter={v => [fmtCost(v), 'Cost']}
                        labelFormatter={() => ''}
                      />
                      <Line type="monotone" dataKey="cost" stroke="#2563EB" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

