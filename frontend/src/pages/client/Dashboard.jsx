// frontend/src/pages/client/Dashboard.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, AlertTriangle, Play,
  RefreshCw, ArrowUpRight, Activity, Zap
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import {
  Card, Button, Alert, cn,
} from '../../components/ui'
import { fmtCost, timeAgo, truncate } from '../../utils/helpers'

const POLL_MS = 5000

// ── Custom Icons ──────────────────────────────────────────────────────────────
const DotIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 8 8" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="4" r="3" />
  </svg>
)

const InProgressIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
)

// ── Shared Dashboard Components ───────────────────────────────────────────────

function DashboardStatCard({ title, value, subtitle, badge, chart }) {
  return (
    <Card className="flex flex-col justify-between p-5 h-full relative overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-[13px] font-medium text-gray-500">{title}</h3>
          {badge && <div>{badge}</div>}
        </div>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        <div className="flex justify-between items-end mt-auto pt-4">
          <p className="text-[13px] text-gray-400 truncate font-medium">{subtitle}</p>
        </div>
      </div>
      {chart && (
        <div className="absolute bottom-4 right-4 w-24 h-10 pointer-events-none">
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
    info: 'bg-[#EBF5FF] text-[#2563EB]',
    default: 'bg-gray-100 text-gray-600'
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
    iconObj = <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-white"><CheckCircle2 className="w-5 h-5 text-[#00A96B]" /></div>
    statusBadge = <StatBadge text="Completed" variant="success" />
  } else if (isRunning) {
    iconObj = <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-white"><InProgressIcon className="w-5 h-5 text-[#2563EB]" /></div>
    statusBadge = <StatBadge text="In Progress" variant="info" />
  } else if (isEscalated || isPending) {
    iconObj = <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-white"><AlertTriangle className="w-5 h-5 text-[#F57C00]" /></div>
    statusBadge = <StatBadge text="Awaiting Approval" variant="warning" />
  } else if (isFailed) {
    iconObj = <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-white"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
    statusBadge = <StatBadge text="Failed" variant="default" />
  } else {
    iconObj = <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10 outline outline-4 outline-white"><Play className="w-4 h-4 text-gray-400" /></div>
    statusBadge = <StatBadge text={run.status} variant="default" />
  }

  return (
    <div className="relative pl-10 pb-7 group">
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-gray-200 group-last:hidden" />
      
      {/* Icon */}
      <div className="absolute left-0 top-0.5">
        {iconObj}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-bold text-gray-900">{run.name}</h4>
          {statusBadge}
        </div>
        <p className="text-[14px] text-gray-500 leading-relaxed pr-4">
          {run.description}
        </p>
        <span className="text-[12px] text-gray-400 font-medium mt-0.5">
          {timeAgo(run.timestamp)}
        </span>
      </div>
    </div>
  )
}

function ProgressBar({ percentage, color = 'bg-[#00A96B]' }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-[13px] font-bold text-gray-900 w-10 text-right">{percentage}%</span>
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
    <div className="flex items-center justify-center h-64 bg-[#F9FAFB] rounded-xl border border-gray-100">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00A96B] to-[#047857] flex items-center justify-center mx-auto mb-3 animate-float shadow-md">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm text-gray-500 font-medium tracking-wide animate-pulse">Loading dashboard telemetry…</p>
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 bg-[#F9FAFB] min-h-[calc(100vh-80px)] p-6 -mx-6 -mt-6">
      
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col gap-1.5 mb-6">
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-[15px] text-gray-500 font-medium">
          Here is a summary of your workspace operational telemetry.
        </p>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 h-[140px]">
        <DashboardStatCard
          title="Active Runs"
          value={data?.active_runs?.current || 0}
          subtitle={`+${data?.active_runs?.initiated_today || 0} initiated today`}
          badge={<StatBadge text="20%" variant="success" icon={ArrowUpRight} />}
        />
        <DashboardStatCard
          title="Pending Approvals"
          value={data?.pending_approvals?.total || 0}
          subtitle="Requires immediate manager attention"
          badge={data?.pending_approvals?.total > 0 ? <StatBadge text="2 Urgent" variant="warning" icon={DotIcon} /> : <StatBadge text="Clear" variant="success" />}
        />
        <DashboardStatCard
          title="Tasks Completed"
          value={data?.tasks_completed?.total || 0}
          subtitle="Standard actions processed"
          badge={null}
          chart={
            sparklineData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )
          }
        />
        <DashboardStatCard
          title="Net Savings"
          value={data?.net_savings?.value != null ? fmtCost(data.net_savings.value) : "—"}
          subtitle={data?.net_savings?.status === 'not_measured' ? 'Not yet measured' : 'MTD workflow cost savings'}
          badge={<StatBadge text="Optimized" variant="success" icon={ArrowUpRight} />}
        />
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
        
        {/* Left Column (Activity) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
          <Card className="flex-1 p-7 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[17px] font-bold text-gray-900 tracking-tight">Recent Activity</h2>
              <button onClick={load} className="text-gray-400 hover:text-gray-900 transition-colors">
                <RefreshCw className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </button>
            </div>
            
            <div className="pt-2">
              {(!data?.recent_activity || data.recent_activity.length === 0) ? (
                <div className="text-sm text-gray-400 py-4 font-medium">No recent activity found.</div>
              ) : (
                data.recent_activity.map(run => <TimelineItem key={run.id} run={run} />)
              )}
            </div>
          </Card>
        </div>

        {/* Right Column (Performance & Cost) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
          
          <Card className="p-7 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-7">
              <h2 className="text-[15px] font-bold text-gray-900">Workflow Performance</h2>
              <span className="text-[13px] font-bold text-[#2563EB]">By success rate</span>
            </div>
            <div className="space-y-6 pt-1">
              {(!data?.workflow_performance || data.workflow_performance.length === 0) ? (
                <div className="text-sm text-gray-400 font-medium">Not enough data to calculate performance.</div>
              ) : (
                data.workflow_performance.map((perf, i) => {
                  let color = 'bg-[#00A96B]'
                  if (i === 2 || i === 3) color = 'bg-[#2563EB]'
                  if (i === 4) color = 'bg-[#F57C00]'
                  return (
                    <div key={perf.name} className="flex flex-col gap-3">
                      <span className="text-[13px] font-bold text-gray-900 truncate pr-4">{perf.name}</span>
                      <ProgressBar percentage={perf.success_rate} color={color} />
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card className="p-7 bg-white border border-gray-200 rounded-xl shadow-sm">
            <h2 className="text-[15px] font-bold text-gray-900 mb-6">Cost Overview</h2>
            
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[13px] font-medium text-gray-500 mb-1">MTD Spend</p>
                <p className="text-[28px] font-bold text-gray-900 tracking-tight">{fmtCost(data?.cost_overview?.mtd_spend || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-medium text-gray-500 mb-1.5">Avg cost per run</p>
                <p className="text-[20px] font-bold text-gray-900 tracking-tight">{fmtCost(data?.cost_overview?.avg_cost_per_run || 0)}</p>
              </div>
            </div>

            <div>
              <p className="text-[13px] font-medium text-gray-500 mb-3">Daily Spend Trend (last 10 days)</p>
              
              <div className="h-28 pt-4 -ml-4 border border-gray-200 rounded-lg overflow-hidden">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Tooltip 
                        cursor={{fill: 'rgba(243, 244, 246, 0.5)'}}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', fontWeight: '500' }}
                        formatter={(val) => [fmtCost(val), 'Cost']}
                        labelFormatter={() => ''}
                      />
                      <Line type="monotone" dataKey="cost" stroke="#2563EB" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full bg-gray-50 flex items-center justify-center shadow-inner">
                    <div className="text-center text-gray-400">
                      <Activity className="w-5 h-5 mx-auto mb-1 opacity-40" />
                      <p className="text-[12px] font-medium">Trend unavailable</p>
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