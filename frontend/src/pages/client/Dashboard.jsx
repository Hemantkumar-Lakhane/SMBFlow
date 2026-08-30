// frontend/src/pages/client/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, AlertTriangle, Play,
  RefreshCw, ArrowUpRight, Activity, Zap
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import {
  Card, Button, Alert, cn,
} from '../../components/ui'
import { fmtCost, timeAgo, truncate } from '../../utils/helpers'

const POLL_MS = 5000

// ── Shared Dashboard Components ───────────────────────────────────────────────

function DashboardStatCard({ title, value, subtitle, badge, chart }) {
  return (
    <Card className="flex flex-col justify-between p-5 h-full relative overflow-hidden" hover>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-[13px] font-medium text-[rgb(var(--text-secondary))]">{title}</h3>
          {badge}
        </div>
        <p className="text-3xl font-bold text-[rgb(var(--text-primary))] mt-2">{value}</p>
      </div>
      <div className="relative z-10 flex justify-between items-end mt-3">
        <p className="text-xs text-[rgb(var(--text-muted))] truncate">{subtitle}</p>
      </div>
      {chart && (
        <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
          {chart}
        </div>
      )}
    </Card>
  )
}

function StatBadge({ text, variant = 'default', icon: Icon }) {
  const variants = {
    success: 'bg-[#E6F8F0] text-[#00A96B]',
    warning: 'bg-[#FFF3E0] text-[#F57C00]',
    default: 'bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))]'
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide', variants[variant])}>
      {Icon && <Icon className="w-3 h-3" />}
      {text}
    </span>
  )
}

function TimelineItem({ run }) {
  const isCompleted = run.status === 'completed' || run.status === 'WorkflowStatus.COMPLETED'
  const isRunning = run.status === 'running'
  const isPending = run.status === 'pending' || run.status === 'pending_a2a'
  const isEscalated = run.status === 'escalated'
  const isFailed = run.status === 'failed' || run.status === 'stopped'
  
  let iconObj = null
  let statusBadge = null
  
  if (isCompleted) {
    iconObj = <div className="w-6 h-6 rounded-full bg-[#E6F8F0] flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-[rgb(var(--bg-base))]"><CheckCircle2 className="w-4 h-4 text-[#00A96B]" /></div>
    statusBadge = <span className="px-2 py-0.5 bg-[#E6F8F0] text-[#00A96B] text-[10px] font-semibold rounded">Completed</span>
  } else if (isRunning) {
    iconObj = <div className="w-6 h-6 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-[rgb(var(--bg-base))]"><Activity className="w-4 h-4 text-[#1976D2]" /></div>
    statusBadge = <span className="px-2 py-0.5 bg-[#E3F2FD] text-[#1976D2] text-[10px] font-semibold rounded">In Progress</span>
  } else if (isEscalated || isPending) {
    iconObj = <div className="w-6 h-6 rounded-full bg-[#FFF3E0] flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-[rgb(var(--bg-base))]"><AlertTriangle className="w-4 h-4 text-[#F57C00]" /></div>
    statusBadge = <span className="px-2 py-0.5 bg-[#FFF3E0] text-[#F57C00] text-[10px] font-semibold rounded">Awaiting Approval</span>
  } else if (isFailed) {
    iconObj = <div className="w-6 h-6 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-[rgb(var(--bg-base))]"><AlertTriangle className="w-4 h-4 text-danger" /></div>
    statusBadge = <span className="px-2 py-0.5 bg-danger/10 text-danger text-[10px] font-semibold rounded">Failed</span>
  } else {
    iconObj = <div className="w-6 h-6 rounded-full bg-[rgb(var(--bg-hover))] flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-[rgb(var(--bg-base))]"><Play className="w-4 h-4 text-[rgb(var(--text-muted))]" /></div>
    statusBadge = <span className="px-2 py-0.5 bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))] text-[10px] font-semibold rounded">{run.status}</span>
  }

  return (
    <div className="relative pl-10 pb-6 group">
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-[rgb(var(--border))] group-last:hidden" />
      
      {/* Icon */}
      <div className="absolute left-0 top-1">
        {iconObj}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[rgb(var(--text-primary))]">{run.name}</h4>
          {statusBadge}
        </div>
        <p className="text-sm text-[rgb(var(--text-secondary))] leading-relaxed">
          {run.description}
        </p>
        <span className="text-xs text-[rgb(var(--text-muted))] font-medium mt-1">
          {timeAgo(run.timestamp)}
        </span>
      </div>
    </div>
  )
}

function ProgressBar({ percentage, color = 'bg-[#00A96B]' }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-2 bg-[rgb(var(--bg-hover))] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-sm font-semibold text-[rgb(var(--text-primary))] w-10 text-right">{percentage}%</span>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate       = useNavigate()
  const { user, api }  = useAuth()
  const { subscribe }  = useWebSocket()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  
  const load = useCallback(async () => {
    if (!user?.tenant_id) return
    try {
      const res = await api.get(`/dashboard/${user.tenant_id}`)
      setData(res)
      setError('')
    } catch (err) {
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
      subscribe('a2a_permission_requested', load),
      subscribe('a2a_decided', load),
      subscribe('workflow_completed', load),
      subscribe('workflow_failed', load),
      subscribe('workflow_stopped', load),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [subscribe, load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[rgb(var(--c-primary))] to-[rgb(var(--c-accent))] flex items-center justify-center mx-auto mb-3 animate-float shadow-md">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm text-[rgb(var(--text-muted))] font-medium tracking-wide animate-pulse">Loading dashboard telemetry…</p>
      </div>
    </div>
  )

  const firstName = user?.full_name ? user.full_name.split(' ')[0] : 'User'

  // Cost chart data formatting
  const chartData = data?.cost_overview?.daily_trend?.map((item, idx) => ({
    name: idx, // Just index for x-axis
    cost: item.cost
  })) || []
  
  // Sparkline data
  const sparklineData = data?.tasks_completed?.trend?.map((val, idx) => ({
    name: idx,
    value: val
  })) || []

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col gap-1 mb-2">
        <h1 className="text-[28px] font-bold text-[rgb(var(--text-primary))] tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-[15px] text-[rgb(var(--text-muted))] font-medium">
          Here is a summary of your workspace operational telemetry.
        </p>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-32">
        <DashboardStatCard
          title="Active Runs"
          value={data?.active_runs?.current || 0}
          subtitle={`+${data?.active_runs?.initiated_today || 0} initiated today`}
          badge={<StatBadge text="Live" variant="success" />}
        />
        <DashboardStatCard
          title="Pending Approvals"
          value={data?.pending_approvals?.total || 0}
          subtitle="Requires manual review"
          badge={data?.pending_approvals?.total > 0 ? <StatBadge text="Action Required" variant="warning" /> : <StatBadge text="Clear" variant="success" />}
        />
        <DashboardStatCard
          title="Tasks Completed"
          value={data?.tasks_completed?.total || 0}
          subtitle="Standard actions processed"
          badge={null}
          chart={
            sparklineData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sparklineData}>
                  <Bar dataKey="value" fill="#00A96B" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        />
        <DashboardStatCard
          title="Net Savings"
          value={data?.net_savings?.value != null ? fmtCost(data.net_savings.value) : "—"}
          subtitle={data?.net_savings?.status === 'not_measured' ? 'Not yet measured' : 'MTD workflow cost savings'}
          badge={<StatBadge text="-" variant="default" />}
        />
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (Activity) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          <Card className="flex-1 p-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-[rgb(var(--text-primary))]">Recent Activity</h2>
              <button onClick={load} className="text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] transition-colors">
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
            
            <div className="pt-2">
              {(!data?.recent_activity || data.recent_activity.length === 0) ? (
                <div className="text-sm text-[rgb(var(--text-muted))] py-4">No recent activity found.</div>
              ) : (
                data.recent_activity.map(run => <TimelineItem key={run.id} run={run} />)
              )}
            </div>
          </Card>
        </div>

        {/* Right Column (Performance & Cost) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
          
          <Card className="p-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[15px] font-bold text-[rgb(var(--text-primary))]">Workflow Performance</h2>
              <span className="text-[13px] font-medium text-[#1976D2]">By success rate</span>
            </div>
            <div className="space-y-6">
              {(!data?.workflow_performance || data.workflow_performance.length === 0) ? (
                <div className="text-sm text-[rgb(var(--text-muted))]">Not enough data to calculate performance.</div>
              ) : (
                data.workflow_performance.map((perf, i) => {
                  let color = 'bg-[#00A96B]'
                  if (perf.success_rate < 80) color = 'bg-[#F57C00]'
                  if (perf.success_rate > 80 && perf.success_rate < 90) color = 'bg-[#1976D2]'
                  // Alternate colors for variety in top 5
                  if (i === 1) color = 'bg-[#00A96B]' 
                  if (i === 2 || i === 3) color = 'bg-[#3b82f6]' 
                  if (i === 4) color = 'bg-[#F57C00]'
                  return (
                    <div key={perf.name} className="flex flex-col gap-2.5">
                      <span className="text-[13px] font-semibold text-[rgb(var(--text-primary))] truncate">{perf.name}</span>
                      <ProgressBar percentage={perf.success_rate} color={color} />
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[15px] font-bold text-[rgb(var(--text-primary))] mb-6">Cost Overview</h2>
            
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[13px] text-[rgb(var(--text-secondary))] mb-1.5">MTD Spend</p>
                <p className="text-[28px] font-bold text-[rgb(var(--text-primary))] tracking-tight">{fmtCost(data?.cost_overview?.mtd_spend || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] text-[rgb(var(--text-secondary))] mb-1.5">Avg cost per run</p>
                <p className="text-xl font-bold text-[rgb(var(--text-primary))]">{fmtCost(data?.cost_overview?.avg_cost_per_run || 0)}</p>
              </div>
            </div>

            <div>
              <p className="text-[13px] text-[rgb(var(--text-secondary))] mb-3">Daily Spend Trend (last 10 days)</p>
              
              <div className="h-32 pt-2 -ml-4">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <Tooltip 
                        cursor={{fill: 'rgba(var(--bg-hover), 0.5)'}}
                        contentStyle={{ backgroundColor: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(val) => [fmtCost(val), 'Cost']}
                        labelFormatter={() => ''}
                      />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#00A96B' : 'rgb(var(--border))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full border border-[rgb(var(--border))] rounded-lg bg-[rgb(var(--bg-base))] flex items-center justify-center shadow-inner">
                    <div className="text-center text-[rgb(var(--text-muted))]">
                      <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      <p className="text-[13px] font-medium">Historical trend unavailable</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
          
        </div>

      </div>
    </div>
  )
}