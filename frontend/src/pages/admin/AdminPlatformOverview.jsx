// Admin: Platform Overview — matches Figma
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Building2, GitBranch, Zap, MessageSquare, CheckCircle2, DollarSign, Activity } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { timeAgo, fmtCost } from '../../utils/helpers'

function KpiCard({ label, value, icon: Icon }) {
  const hasValue = value !== null && value !== undefined
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-gray-300" />}
      </div>
      <p className={`text-sm font-medium ${hasValue ? 'text-gray-900' : 'text-gray-400 italic'}`}>
        {hasValue ? value : 'Not connected'}
      </p>
    </div>
  )
}

export default function AdminPlatformOverview() {
  const navigate = useNavigate()
  const { api } = useAuth()
  const { events } = useWebSocket()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [god, stats] = await Promise.all([
        api.get('/admin/god-view').catch(() => null),
        api.get('/admin/live-stats').catch(() => null),
      ])
      setData({ god, stats })
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const tenants     = data?.god?.tenants || []
  const allRuns     = data?.god?.all_workflows || []
  const pendingEscs = data?.god?.pending_escalations || []
  const recentEvents = data?.god?.recent_events || []
  const fleetCost   = data?.stats?.fleet_cost_usd || 0
  const activeWf    = data?.stats?.active_workflows || 0

  const liveEvents = [...events].reverse().slice(0, 30)

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor organizations, workflow activity, AI services, and platform health.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* KPI row — 6 cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Active Organizations"  value={tenants.length > 0 ? tenants.length : null}  icon={Building2} />
        <KpiCard label="Active Workflows"      value={activeWf > 0 ? activeWf : null}              icon={GitBranch} />
        <KpiCard label="Workflow Runs Today"   value={null}                                         icon={Zap} />
        <KpiCard label="Pending Reviews"       value={pendingEscs.length > 0 ? pendingEscs.length : null} icon={MessageSquare} />
        <KpiCard label="Platform Health"       value={null}                                         icon={CheckCircle2} />
        <KpiCard label="Est. Cost This Month"  value={fleetCost > 0 ? fmtCost(fleetCost) : null}   icon={DollarSign} />
      </div>

      {/* Operational Activity + Runs Requiring Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Operational Activity */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Operational Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">Live event stream — {liveEvents.length > 0 ? 'connected' : 'not connected'}</p>
          </div>
          <div className="p-4 font-mono text-xs h-48 overflow-y-auto bg-gray-50">
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Activity className="w-7 h-7 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No live events</p>
                <p className="text-xs text-center">Connect the WebSocket API to stream real-time platform events.</p>
              </div>
            ) : liveEvents.map((e, i) => (
              <div key={i} className="flex gap-2 text-gray-500 py-0.5">
                <span className="text-gray-400 flex-shrink-0">{e._receivedAt?.slice(11,19)}</span>
                <span className="text-gray-500">[{e.type}]</span>
                {e.data?.run_id && <span className="text-gray-400 truncate">{e.data.run_id.slice(0,8)}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Runs Requiring Attention */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Runs Requiring Attention</h2>
            <button onClick={() => navigate('/admin/reviews')} className="text-xs text-blue-600 hover:underline font-medium">View all</button>
          </div>
          {pendingEscs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 px-5">
              <MessageSquare className="w-9 h-9 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No runs awaiting review</p>
              <p className="text-xs text-gray-400 text-center">Workflow runs flagged for human review will appear here once the platform API is connected.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">{['RUN','WORKFLOW','ORGANIZATION','REASON','PRIORITY','CREATED'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody>{pendingEscs.slice(0,5).map(e=>(
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{e.instance_id?.slice(0,8)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">{e.node_id}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{e.tenant_id?.slice(0,8)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[100px] truncate">{e.reason}</td>
                    <td className="px-4 py-2.5 text-xs text-amber-600 font-medium">High</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(e.created_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Platform Health Summary */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Platform Health Summary</h2>
          <button onClick={() => navigate('/admin/health')} className="text-xs text-blue-600 hover:underline font-medium">View all</button>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100 px-5 py-4">
          {['Backend API','Database','AI Services','Workflow Engine'].map(s => (
            <div key={s} className="px-4 first:pl-0 last:pr-0">
              <p className="text-xs font-semibold text-gray-700 mb-1">{s}</p>
              <p className="text-xs text-gray-400 italic">Status unavailable</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Workflow Runs + Usage Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Recent Workflow Runs</h2>
            <button onClick={() => navigate('/admin/runs')} className="text-xs text-blue-600 hover:underline font-medium">View all</button>
          </div>
          {allRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <GitBranch className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No recent runs</p>
              <p className="text-xs text-gray-400">Connect the platform API to view run history.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">{['RUN','WORKFLOW','ORGANIZATION','STATUS','STARTED'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{allRuns.slice(0,5).map(r=>(
                <tr key={r.run_id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.run_id?.slice(0,8)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 truncate max-w-[90px]">{r.workflow_name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{r.tenant_id?.slice(0,8)||'—'}</td>
                  <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status==='completed'?'bg-green-50 text-green-700':r.status==='running'?'bg-blue-50 text-blue-700':'bg-gray-100 text-gray-500'}`}>{r.status}</span></td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(r.started_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Usage Snapshot</h2>
            <button onClick={() => navigate('/admin/usage')} className="text-xs text-blue-600 hover:underline font-medium">View all</button>
          </div>
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <DollarSign className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No usage data</p>
              <p className="text-xs text-gray-400">Connect the platform API to view per-organization usage and cost.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">{['ORGANIZATION','RUNS','TOKENS','COST'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{tenants.slice(0,5).map(t=>(
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-900">{t.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">—</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">—</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">—</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Audit Activity */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Recent Audit Activity</h2>
          <button onClick={() => navigate('/admin/audit')} className="text-xs text-blue-600 hover:underline font-medium">View all</button>
        </div>
        {recentEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Activity className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No audit events</p>
            <p className="text-xs text-gray-400">Platform audit events will appear here once the backend API is connected.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100">{['EVENT','ACTOR','ORGANIZATION','IP ADDRESS','TIMESTAMP'].map(h=><th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>{recentEvents.slice(0,5).map((e,i)=>(
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-2.5 text-xs font-medium text-gray-700">{e.event_type}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">—</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{e.tenant_id?.slice(0,8)||'—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">—</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(e.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
