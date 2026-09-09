import { useState, useEffect, useCallback } from 'react'
import { Users, Activity, DollarSign } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { fmtCost, fmtTokens, timeAgo } from '../../utils/helpers'

export default function AdminUsageCost() {
  const { api } = useAuth()
  const { events } = useWebSocket()
  const [fleet, setFleet] = useState(null)
  const [god,   setGod]   = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [f, g] = await Promise.all([
        api.get('/analytics/admin/fleet').catch(() => null),
        api.get('/admin/god-view').catch(() => null),
      ])
      setFleet(f); setGod(g)
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const tenants   = god?.tenants || []
  const allRuns   = god?.all_workflows || []
  const byTenant  = fleet?.by_tenant || {}
  const totalCost = fleet?.total_cost_usd || 0
  const totalRuns = fleet?.total_runs || 0

  const costEvents = [...events].filter(e => ['agent_completed','workflow_completed'].includes(e.type) && e.data?.cost_usd > 0).reverse().slice(0, 20)

  const KPI = ({ label, value, sub }) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value || <span className="text-gray-300 font-normal">—</span>}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fleet Cost &amp; Usage</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform-wide AI usage, token consumption, and cost breakdown</p>
      </div>

      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-500">All cost and usage metrics will populate once the platform API is connected and workflows begin executing. No values are fabricated — '$0.00' is not displayed for unimplemented metrics.</p>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <KPI label="Total Fleet Cost"   value={totalCost > 0 ? fmtCost(totalCost) : null} sub="All tenants combined" />
        <KPI label="Total Runs"         value={totalRuns > 0 ? totalRuns : null}           sub="Platform-wide executions" />
        <KPI label="Active Tenants"     value={tenants.length > 0 ? tenants.length : null} sub="Tenants with recent activity" />
        <KPI label="Avg Cost / Run"     value={totalRuns > 0 && totalCost > 0 ? fmtCost(totalCost/totalRuns) : null} sub="Mean cost per execution" />
        <KPI label="Total Tokens"       value={null} sub="LLM tokens consumed" />
      </div>

      {/* Cost by Tenant */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Cost by Tenant</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">{['TENANT','RUNS','COMPLETED RUNS','TOKENS','COST'].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {Object.keys(byTenant).length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">No tenant cost data</p>
                  <p className="text-xs text-gray-400">Cost breakdown by tenant will appear once the platform API is connected.</p>
                </div>
              </td></tr>
            ) : Object.entries(byTenant).map(([tid, d]) => {
              const t = tenants.find(x => x.id === tid)
              return (
                <tr key={tid} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{d.tenant_name || t?.name || tid.slice(0,8)}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{d.runs || 0}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{d.completed || 0}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{fmtTokens(d.tokens || 0)}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{fmtCost(d.cost || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Live Cost Events */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Live Cost Events</h2>
        </div>
        {costEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Activity className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No live cost events</p>
            <p className="text-xs text-gray-400">Real-time model usage events will stream here when WebSocket is connected.</p>
          </div>
        ) : (
          <div className="px-5 py-3 space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
            {costEvents.map((e,i) => (
              <div key={i} className="flex gap-3 text-gray-500">
                <span className="text-gray-400">{e._receivedAt?.slice(11,19)}</span>
                <span className="text-amber-600 font-bold">{fmtCost(e.data?.cost_usd)}</span>
                <span className="truncate">{e.data?.workflow || e.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Runs Cost Breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Recent Runs — Cost Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">{['RUN ID','WORKFLOW','TENANT','STATUS','TOKENS IN','TOKENS OUT','COST','STARTED'].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody>
            {allRuns.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-16 text-center">
                <div className="flex flex-col items-center gap-2">
                  <DollarSign className="w-8 h-8 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Cost tracking unavailable</p>
                  <p className="text-xs text-blue-500">Per-run cost data will appear once the platform API is connected.</p>
                </div>
              </td></tr>
            ) : allRuns.slice(0,20).map(r => (
              <tr key={r.run_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 text-xs font-mono text-gray-500">{r.run_id?.slice(0,8)}</td>
                <td className="px-5 py-3 text-xs text-gray-700 truncate max-w-[100px]">{r.workflow_name}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{r.tenant_id?.slice(0,8)||'—'}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status==='completed'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{r.status}</span></td>
                <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_in)}</td>
                <td className="px-5 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_out)}</td>
                <td className="px-5 py-3 text-xs font-semibold text-gray-700">{r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}</td>
                <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(r.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
