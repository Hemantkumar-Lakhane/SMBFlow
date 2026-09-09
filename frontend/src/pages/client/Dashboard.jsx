// frontend/src/pages/client/Dashboard.jsx
// Matches Figma: Home screen — KPI cards, Recent Activity, Workflow Performance, Cost Overview

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, RefreshCw, ArrowUpRight, CheckCircle2, AlertTriangle, Play, Zap, DollarSign } from 'lucide-react'
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
function ProgressRow({ name, pct, color }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900 mb-2 truncate">{name}</p>
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
  const { user, api } = useAuth()
  const { subscribe } = useWebSocket()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    if (!user?.tenant_id) return
    try {
      const res = await api.get(`/dashboard/${user.tenant_id}`)
      setData(res)
      setError('')
    } catch {
      setError('Failed to load dashboard data')
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

  const chartData = data?.cost_overview?.daily_trend?.map((item, idx) => ({ idx, cost: item.cost })) || []
  const sparkData = data?.tasks_completed?.trend?.map((v, idx) => ({ idx, v })) || []

  const activeRuns    = data?.active_runs?.current ?? 0
  const pendingAppr   = data?.pending_approvals?.total ?? 0
  const tasksComp     = data?.tasks_completed?.total ?? 0
  const netSavings    = data?.net_savings?.value != null ? fmtCost(data.net_savings.value) : '—'
  const activity      = data?.recent_activity || []
  const performance   = data?.workflow_performance || []
  const mtdSpend      = data?.cost_overview?.mtd_spend || 0
  const avgCost       = data?.cost_overview?.avg_cost_per_run || 0

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Home</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your operational summary and recent activity</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Active Runs"
          icon={<Activity className="w-4 h-4" />}
          value={loading ? '—' : activeRuns || <span className="text-gray-400">No data</span>}
          sub={activeRuns ? `${data?.active_runs?.initiated_today || 0} initiated today` : 'No runs yet'}
        />
        <KpiCard
          title="Pending Approvals"
          icon={<AlertTriangle className="w-4 h-4" />}
          value={loading ? '—' : pendingAppr || <span className="text-gray-400">No data</span>}
          sub={pendingAppr ? 'Require attention' : 'No approvals pending'}
        />
        <KpiCard
          title="Tasks Completed"
          icon={<CheckCircle2 className="w-4 h-4" />}
          value={loading ? '—' : tasksComp || <span className="text-gray-400">No data</span>}
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
          title="Net Savings"
          icon={<DollarSign className="w-4 h-4" />}
          value={loading ? '—' : <span className={netSavings === '—' ? 'text-gray-400 text-lg' : ''}>{netSavings || <span className="text-gray-400">No data</span>}</span>}
          sub="No spend data"
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 h-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-gray-900">Recent Activity</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/workflows/builder')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Activity className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Loading…</p>
                </div>
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Activity className="w-10 h-10 text-gray-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">No activity yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Activity will appear here once workflows start running.</p>
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
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Workflow Performance</h2>
              <button
                onClick={() => navigate('/workflows/builder')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {performance.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 gap-2">
                <div className="w-8 h-8 text-gray-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg></div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">No workflows to report</p>
                  <p className="text-xs text-gray-400 mt-0.5">Create a workflow to see performance data.</p>
                </div>
                <button
                  onClick={() => navigate('/workflows/builder')}
                  className="mt-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Create workflow
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {performance.slice(0, 5).map((p, i) => {
                  const colors = ['bg-green-500', 'bg-blue-500', 'bg-blue-400', 'bg-amber-500', 'bg-red-400']
                  return <ProgressRow key={p.name} name={p.name} pct={p.success_rate || 0} color={colors[i] || 'bg-blue-500'} />
                })}
              </div>
            )}
          </div>

          {/* Cost Overview */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Cost Overview</h2>

            {chartData.length === 0 && mtdSpend === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 gap-2">
                <DollarSign className="w-8 h-8 text-gray-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">No spend data</p>
                  <p className="text-xs text-gray-400 mt-0.5">Cost data will appear once workflows run.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">MTD Spend</p>
                    <p className="text-2xl font-bold text-gray-900">{fmtCost(mtdSpend)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Avg / run</p>
                    <p className="text-lg font-bold text-gray-900">{fmtCost(avgCost)}</p>
                  </div>
                </div>
                <div className="h-24 border border-gray-100 rounded-lg overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Tooltip
                        contentStyle={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
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
