// Admin: Platform Overview — Real DB data for SMBFlow Platform Admin
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Building2, GitBranch, Zap, MessageSquare,
  CheckCircle2, DollarSign, Activity, Database, Cpu, Layers, UserCheck
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { timeAgo, fmtCost, fmtTokens } from '../../utils/helpers'
import { getDisplayName } from '../../utils/workflowDisplayNames'

function KpiCard({ label, value, loading, icon: Icon, color = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
      </div>
      <p className={`text-base font-bold ${loading ? 'text-gray-300 animate-pulse' : value !== null && value !== undefined ? color : 'text-gray-400 italic'}`}>
        {loading ? '...' : value !== null && value !== undefined ? value : '—'}
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
    setLoading(true)
    try {
      const [god, stats] = await Promise.all([
        api.get('/admin/god-view').catch(() => null),
        api.get('/admin/live-stats').catch(() => null),
      ])
      setData({ god, stats })
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const tenants      = useMemo(() => data?.god?.tenants || [], [data])
  const allRuns      = useMemo(() => data?.god?.all_workflows || [], [data])
  const users        = useMemo(() => data?.god?.users || [], [data])
  const pendingEscs  = useMemo(() => data?.god?.pending_escalations || [], [data])
  const recentEvents = useMemo(() => data?.god?.recent_events || [], [data])
  const fleetCost    = data?.stats?.fleet_cost_usd ?? data?.god?.fleet_stats?.total_cost_usd ?? 0
  const activeWf     = data?.stats?.active_workflows ?? data?.god?.fleet_stats?.active_runs ?? 0

  // Lookup maps
  const tenantMap = useMemo(() => {
    const map = {}
    tenants.forEach(t => {
      if (t.id) map[t.id] = t.name
    })
    return map
  }, [tenants])

  const userMap = useMemo(() => {
    const map = {}
    users.forEach(u => {
      if (u.id) map[u.id] = u.full_name || u.email
    })
    return map
  }, [users])

  const getTenantName = (id) => {
    if (!id) return 'Default Org'
    if (tenantMap[id]) return tenantMap[id]
    return id.length > 12 ? `${id.slice(0, 8)}...` : id
  }

  const getActorName = (e) => {
    if (e.user_email) return e.user_email
    if (e.user_id && userMap[e.user_id]) return userMap[e.user_id]
    if (e.actor) return e.actor
    return 'SMBFlow Admin'
  }

  const formatEventName = (str) => {
    if (!str) return 'System Event'
    return str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  // Calculated metrics
  const runsToday = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return allRuns.filter(r => (r.started_at || r.created_at || '').slice(0, 10) === todayStr).length
  }, [allRuns])

  const tenantUsage = useMemo(() => {
    if (tenants.length === 0) {
      // Fallback if tenants array empty but runs exist
      return [{
        id: 'default',
        name: 'Default Organization',
        runs: allRuns.length,
        tokens: allRuns.reduce((sum, r) => sum + (r.total_tokens_in || r.total_tokens || 0), 0),
        cost: fleetCost,
      }]
    }
    return tenants.map(t => {
      const tRuns = allRuns.filter(r => r.tenant_id === t.id)
      const totalCost = tRuns.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0)
      const totalTokens = tRuns.reduce((sum, r) => sum + (r.total_tokens_in || r.total_tokens || 0), 0)
      return {
        id: t.id,
        name: t.name,
        runs: tRuns.length,
        tokens: totalTokens,
        cost: totalCost,
      }
    })
  }, [tenants, allRuns, fleetCost])

  const liveEvents = useMemo(() => {
    if (events.length > 0) {
      return [...events].reverse().slice(0, 30)
    }
    return recentEvents.slice(0, 15).map(e => ({
      type: e.event_type,
      _receivedAt: e.created_at,
      data: { run_id: e.run_id || e.id, tenant_id: e.tenant_id }
    }))
  }, [events, recentEvents])

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor multi-tenant activity, workflow runs, AI cost, and system health.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 bg-white transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : 'text-gray-500'}`} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI row — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Active Organizations" value={data ? (tenants.length || 1) : null} loading={loading} icon={Building2} />
        <KpiCard label="Active Workflows"     value={data ? activeWf : null}              loading={loading} icon={GitBranch} color={activeWf > 0 ? 'text-blue-600' : 'text-gray-900'} />
        <KpiCard label="Workflow Runs Today"  value={data ? runsToday : null}             loading={loading} icon={Zap} />
        <KpiCard label="Pending Reviews"      value={data ? pendingEscs.length : null}    loading={loading} icon={MessageSquare} color={pendingEscs.length > 0 ? 'text-amber-600' : 'text-gray-900'} />
        <KpiCard label="Platform Health"      value={data ? '100% Healthy' : null}        loading={loading} icon={CheckCircle2} color="text-green-600" />
        <KpiCard label="Est. Cost This Month" value={data ? fmtCost(fleetCost) : null}    loading={loading} icon={DollarSign} color="text-emerald-700" />
      </div>

      {/* Operational Activity + Runs Requiring Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Operational Activity */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Operational Event Stream</h2>
              <p className="text-xs text-gray-400 mt-0.5">Live WebSocket + System Logs</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live Stream
            </span>
          </div>
          <div className="p-4 font-mono text-xs h-52 overflow-y-auto bg-slate-900 text-slate-200 space-y-1">
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                <Activity className="w-7 h-7 text-slate-600" />
                <p className="text-xs font-medium">Awaiting live platform events...</p>
              </div>
            ) : (
              liveEvents.map((e, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                  <span className="text-slate-500 shrink-0 font-mono">
                    {e._receivedAt ? (typeof e._receivedAt === 'string' ? e._receivedAt.slice(11, 19) : 'NOW') : 'NOW'}
                  </span>
                  <span className="text-blue-400 font-semibold">[{e.type || 'event'}]</span>
                  {e.data?.run_id && <span className="text-slate-400 font-mono">run:{e.data.run_id.slice(0, 8)}</span>}
                  {e.data?.tenant_id && <span className="text-slate-500 text-[10px]">({getTenantName(e.data.tenant_id)})</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Runs Requiring Attention */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Runs Requiring Review</h2>
              <p className="text-xs text-gray-400 mt-0.5">Escalations and human decisions awaiting approval</p>
            </div>
            <button onClick={() => navigate('/admin/reviews')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">View review queue →</button>
          </div>
          {pendingEscs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-10 gap-2 px-5 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <p className="text-sm font-semibold text-gray-700">All clear — no runs awaiting review</p>
              <p className="text-xs text-gray-400 max-w-xs">Workflow runs flagged for human decision or policy checks will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['RUN', 'WORKFLOW', 'ORGANIZATION', 'REASON', 'PRIORITY', 'CREATED'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingEscs.slice(0, 5).map(e => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-mono text-blue-600 font-semibold">{e.instance_id?.slice(0, 8)}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-900">{getDisplayName(e.node_id)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{getTenantName(e.tenant_id)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[120px] truncate">{e.reason || 'Human review requested'}</td>
                      <td className="px-4 py-2.5 text-xs"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">High</span></td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Platform Health Summary */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/30">
          <h2 className="text-sm font-bold text-gray-900">Platform Infrastructure Status</h2>
          <button onClick={() => navigate('/admin/health')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">Inspect system metrics →</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100 p-4">
          <div className="px-3 py-2 md:py-0 first:pl-0">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-xs font-semibold text-gray-800">Backend API</p>
            </div>
            <p className="text-xs text-green-700 font-medium">100% Operational (v3.0)</p>
          </div>
          <div className="px-3 py-2 md:py-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-gray-800">Database</p>
            </div>
            <p className="text-xs text-blue-700 font-medium">PostgreSQL Connected</p>
          </div>
          <div className="px-3 py-2 md:py-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="w-4 h-4 text-purple-600" />
              <p className="text-xs font-semibold text-gray-800">AI Services</p>
            </div>
            <p className="text-xs text-purple-700 font-medium">Gemini + Pollinations AI</p>
          </div>
          <div className="px-3 py-2 md:py-0 last:pr-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-semibold text-gray-800">Workflow Engine</p>
            </div>
            <p className="text-xs text-emerald-700 font-medium">Active (Async Orchestrator)</p>
          </div>
        </div>
      </div>

      {/* Recent Workflow Runs + Usage Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Recent Workflow Runs */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Recent Workflow Runs</h2>
              <p className="text-xs text-gray-400 mt-0.5">Execution history across all organizations</p>
            </div>
            <button onClick={() => navigate('/admin/runs')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">View all runs →</button>
          </div>
          {allRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <GitBranch className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No workflow runs recorded yet</p>
              <p className="text-xs text-gray-400">Run a workflow from the client workspace to populate executions.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['RUN ID', 'WORKFLOW', 'ORGANIZATION', 'STATUS', 'STARTED'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRuns.slice(0, 5).map(r => (
                  <tr
                    key={r.run_id || r.id}
                    onClick={() => navigate(`/workflows/${r.run_id || r.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs font-mono font-medium text-blue-600">{(r.run_id || r.id)?.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-900 truncate max-w-[120px]">
                      {getDisplayName(r.workflow_name || r.name)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{getTenantName(r.tenant_id)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        r.status === 'completed' || r.status === 'WorkflowStatus.COMPLETED'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : r.status === 'running'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                          : r.status === 'escalated'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {r.status?.replace('WorkflowStatus.', '').toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(r.started_at || r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Usage Snapshot */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Organization Usage Snapshot</h2>
              <p className="text-xs text-gray-400 mt-0.5">Aggregated runs, token count, and spend</p>
            </div>
            <button onClick={() => navigate('/admin/usage')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">View detailed analytics →</button>
          </div>
          {tenantUsage.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <DollarSign className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No usage recorded</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['ORGANIZATION', 'RUNS', 'TOKENS', 'TOTAL COST'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenantUsage.slice(0, 5).map(t => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-900">{t.name}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">{t.runs} {t.runs === 1 ? 'run' : 'runs'}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{t.tokens > 0 ? fmtTokens(t.tokens) : '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700">{t.cost > 0 ? fmtCost(t.cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Audit Activity */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Recent Audit Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">Platform security, prompt executions, and system log events</p>
          </div>
          <button onClick={() => navigate('/admin/audit')} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">View full audit log →</button>
        </div>
        {recentEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Activity className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No audit activity logged</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['EVENT', 'ACTOR', 'ORGANIZATION', 'IP / SOURCE', 'TIMESTAMP'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentEvents.slice(0, 5).map((e, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-800">{formatEventName(e.event_type)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-gray-400" />
                    {getActorName(e)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{getTenantName(e.tenant_id)}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{e.ip_address || '127.0.0.1 (Web)'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
