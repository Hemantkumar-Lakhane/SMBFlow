// frontend/src/pages/admin/FleetCost.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth }      from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { Card, StatCard, Badge, Button, Spinner, Alert, EmptyState, LiveDot } from '../../components/ui'
import { fmtCost, fmtTokens, timeAgo, PROVIDER_COLORS, PROVIDER_LABELS } from '../../utils/helpers'

const POLL_MS = 8000

// ── Provider badge ────────────────────────────────────────────────────────────
function ProviderBadge({ model }) {
  const provider = model?.split('/')?.[0] || 'unknown'
  const cls = PROVIDER_COLORS[provider] || 'text-gray-400'
  const label = PROVIDER_LABELS[provider] || provider
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 ${cls}`}>
      {label}
    </span>
  )
}

// ── Tenant cost row ────────────────────────────────────────────────────────────
function TenantRow({ tid, data, tenants }) {
  const tenant = tenants.find(t => t.id === tid) || {}
  const pct = data.cost > 0 ? data.cost : 0
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-medium truncate">{data.tenant_name || tenant.name || tid?.slice(0, 8)}</div>
        <div className="text-xs text-gray-500">{tenant.industry || '—'} · {data.runs} runs · {data.completed} completed</div>
      </div>
      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-right">
          <div className="text-xs text-gray-500">Tokens In</div>
          <div className="text-sm text-green-400 font-mono">{fmtTokens(data.tokens)}</div>
        </div>
        <div className="text-right min-w-[70px]">
          <div className="text-xs text-gray-500">Cost</div>
          <div className="text-sm text-yellow-400 font-mono font-bold">{fmtCost(data.cost)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main FleetCost ─────────────────────────────────────────────────────────────
export default function FleetCost() {
  const { api }        = useAuth()
  const { events, status } = useWebSocket()

  const [fleet,    setFleet]    = useState(null)
  const [god,      setGod]      = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    try {
      const [fleetData, godData] = await Promise.all([
        api.get('/analytics/admin/fleet'),
        api.get('/admin/god-view'),
      ])
      setFleet(fleetData)
      setGod(godData)
      setError('')
      setLastRefresh(new Date())
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

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  const tenants = god?.tenants || []
  const byTenant = fleet?.by_tenant || {}
  const totalCost = fleet?.total_cost_usd || 0
  const totalRuns = fleet?.total_runs || 0

  // Derive model usage from all workflow runs
  const allRuns = god?.all_workflows || []
  const avgCostPerRun = totalRuns > 0 ? totalCost / totalRuns : 0

  // Sort tenants by cost desc
  const sortedTenants = Object.entries(byTenant).sort(([, a], [, b]) => b.cost - a.cost)

  // Live WS events for real-time cost feed
  const costEvents = [...events]
    .filter(e => ['agent_completed', 'workflow_completed'].includes(e.type) && e.data?.cost_usd > 0)
    .slice(-20)
    .reverse()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">💰 Fleet Cost Dashboard</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            System-wide LLM spend across all tenants · Updated{' '}
            {lastRefresh ? timeAgo(lastRefresh.toISOString()) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs ${status === 'connected' ? 'text-green-400' : 'text-gray-500'}`}>
            <LiveDot color={status === 'connected' ? 'green' : 'gray'} pulse={status === 'connected'} />
            {status}
          </div>
          <Button size="sm" variant="ghost" onClick={load}>↻ Refresh</Button>
        </div>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="💸" label="Total Fleet Cost"   value={fmtCost(totalCost)}        color="text-yellow-400" />
        <StatCard icon="⚡" label="Total Runs"         value={totalRuns.toLocaleString()} color="text-blue-400"   />
        <StatCard icon="🏢" label="Active Tenants"     value={tenants.length}             color="text-green-400" />
        <StatCard icon="📊" label="Avg Cost / Run"     value={fmtCost(avgCostPerRun)}     color="text-purple-400" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost by Tenant */}
        <Card title="Cost by Tenant" action={
          <span className="text-xs text-gray-500">{sortedTenants.length} tenants</span>
        }>
          {sortedTenants.length === 0 ? (
            <EmptyState icon="📭" title="No cost data yet" description="Trigger a workflow to see spend" />
          ) : (
            <div>
              {sortedTenants.map(([tid, data]) => (
                <TenantRow key={tid} tid={tid} data={data} tenants={tenants} />
              ))}
            </div>
          )}
        </Card>

        {/* Live Cost Feed */}
        <Card title="🔴 Live Cost Events">
          <div className="h-64 overflow-y-auto font-mono text-xs space-y-0.5">
            {costEvents.length === 0 && (
              <div className="text-gray-600 py-4 text-center">Waiting for LLM calls…</div>
            )}
            {costEvents.map((ev, i) => {
              const tenant = tenants.find(t => t.id === ev.data?.tenant_id)
              return (
                <div key={i} className="flex items-center gap-2 py-0.5 border-b border-gray-800/20 text-gray-400">
                  <span className="text-gray-700 flex-shrink-0">{ev._receivedAt?.slice(11, 19)}</span>
                  {ev.data?.cost_usd > 0 && (
                    <span className="text-yellow-400 font-bold flex-shrink-0">{fmtCost(ev.data.cost_usd)}</span>
                  )}
                  {ev.data?.model_used && (
                    <span className="text-purple-300 flex-shrink-0 truncate max-w-[100px]">
                      {ev.data.model_used.split('/').pop()}
                    </span>
                  )}
                  <span className="truncate text-gray-500">
                    {tenant?.name || ev.data?.tenant_id?.slice(0, 8) || '—'}
                    {ev.data?.agent_type && ` · ${ev.data.agent_type.replace('_agent', '')}`}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Recent Workflow Costs Table */}
      <Card
        title="Recent Workflow Runs — Cost Breakdown"
        action={<span className="text-xs text-gray-500">{allRuns.length} total</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                {['Run ID', 'Workflow', 'Tenant', 'Status', 'Tokens In', 'Tokens Out', 'Cost', 'Started'].map(h => (
                  <th key={h} className={`pb-2 font-medium ${['Tokens In', 'Tokens Out', 'Cost'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRuns.slice(0, 25).map(w => {
                const tenant = tenants.find(t => t.id === w.tenant_id)
                return (
                  <tr key={w.run_id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="py-2 font-mono text-xs text-gray-500">{w.run_id?.slice(0, 8)}</td>
                    <td className="py-2 text-white text-xs max-w-[120px] truncate">{w.workflow_name}</td>
                    <td className="py-2 text-gray-400 text-xs">{tenant?.name || w.tenant_id?.slice(0, 8)}</td>
                    <td className="py-2"><Badge status={w.status} /></td>
                    <td className="py-2 text-right text-green-400 font-mono text-xs">{fmtTokens(w.total_tokens_in)}</td>
                    <td className="py-2 text-right text-blue-400  font-mono text-xs">{fmtTokens(w.total_tokens_out)}</td>
                    <td className="py-2 text-right text-yellow-400 font-mono text-xs font-bold">{fmtCost(w.total_cost_usd)}</td>
                    <td className="py-2 text-right text-gray-500 text-xs">{timeAgo(w.started_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {allRuns.length === 0 && (
            <EmptyState icon="💤" title="No workflow runs yet" description="Cost data will appear here after workflows run" />
          )}
        </div>
      </Card>
    </div>
  )
}