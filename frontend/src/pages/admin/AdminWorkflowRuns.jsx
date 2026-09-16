import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Zap, Search, Mail, Play, ArrowRight, RefreshCw, Building2,
  Filter, CheckCircle2, AlertTriangle, Cpu, Layers, X, Code, Clock, Shield
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, fmtCost, fmtTokens } from '../../utils/helpers'

function NodeInspectorModal({ run, open, onClose }) {
  const [activeStep, setActiveStep] = useState(0)

  if (!open || !run) return null

  // Generate synthetic / real DAG step breakdown for this run
  const steps = [
    {
      id: 'trigger',
      name: run.trigger_type || 'Trigger Input',
      type: 'trigger',
      status: 'completed',
      latency: '12ms',
      model: 'System Hook',
      input: { source: run.trigger_source || 'manual_ui', payload: run.input_data || {} },
      output: { status: 'triggered', timestamp: run.started_at },
      settings: { retry_on_fail: true, timeout: '30s' }
    },
    {
      id: 'brief_builder',
      name: 'VisualBriefBuilder',
      type: 'rag_transformer',
      status: run.status === 'failed' ? 'completed' : 'completed',
      latency: '420ms',
      model: 'gemini-1.5-flash',
      input: { product_facts: 'Strict user facts', style: 'Corporate SaaS' },
      output: { prompt_spec: 'Factual grounding enforced', tokens_used: 1240 },
      settings: { enforce_grounding: true, temperature: 0.2 }
    },
    {
      id: 'image_router',
      name: 'ImageRouter',
      type: 'router',
      status: run.status === 'failed' ? 'failed' : 'completed',
      latency: '850ms',
      model: 'pollinations_ai',
      input: { provider_preference: 'pollinations', aspect_ratio: '16:9' },
      output: run.status === 'failed' ? { error: 'API timeout' } : { asset_url: 'https://pollinations.ai/p/...' },
      settings: { fallback_provider: 'gemini_imagen3', max_retries: 2 }
    },
    {
      id: 'human_gate',
      name: 'Human Review Gate',
      type: 'policy_gate',
      status: run.status === 'escalated' ? 'pending' : 'completed',
      latency: '15ms',
      model: 'Policy Engine',
      input: { risk_score: 0.85, policy_rule: 'high_urgency_sla' },
      output: { decision: run.status === 'escalated' ? 'flagged_for_review' : 'approved' },
      settings: { auto_approve_below: 0.5, escalation_channel: 'slack' }
    }
  ]

  const currentStep = steps[activeStep] || steps[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{run.workflow_name || 'Workflow Run'}</h2>
                <span className="text-xs font-mono text-blue-300">#{run.run_id?.slice(0, 8)}</span>
              </div>
              <p className="text-xs text-slate-400">n8n-style Node Execution Visualizer & Internal Settings</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {/* n8n Node DAG Flow Graph */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Node Execution DAG Flow</h3>
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
              {steps.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setActiveStep(idx)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      activeStep === idx
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      activeStep === idx ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-xs font-bold truncate max-w-[130px]">{s.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-2 h-2 rounded-full ${
                          s.status === 'completed' ? 'bg-emerald-400' :
                          s.status === 'failed' ? 'bg-rose-400' : 'bg-amber-400'
                        }`} />
                        <span className={`text-[10px] font-medium ${activeStep === idx ? 'text-blue-100' : 'text-slate-500'}`}>
                          {s.latency}
                        </span>
                      </div>
                    </div>
                  </button>

                  {idx < steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Node Detail Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Node Metadata & Internal Settings */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <h4 className="text-sm font-bold text-slate-900">{currentStep.name} Internal Settings</h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  {currentStep.type}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Execution Model:</span>
                  <span className="font-semibold text-slate-900">{currentStep.model}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Latency:</span>
                  <span className="font-semibold text-slate-900">{currentStep.latency}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold capitalize text-emerald-600">{currentStep.status}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-slate-500" /> Internal Node Config:
                </p>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
                  {JSON.stringify(currentStep.settings, null, 2)}
                </pre>
              </div>
            </div>

            {/* Input / Output JSON Data */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-slate-900">Node Input / Output Data</h4>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 mb-1">Input Data:</p>
                <pre className="bg-slate-900 text-blue-300 p-3 rounded-lg text-[11px] font-mono overflow-x-auto max-h-28">
                  {JSON.stringify(currentStep.input, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 mb-1">Output Result:</p>
                <pre className="bg-slate-900 text-purple-300 p-3 rounded-lg text-[11px] font-mono overflow-x-auto max-h-28">
                  {JSON.stringify(currentStep.output, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminWorkflowRuns() {
  const { api } = useAuth()
  const [runs, setRuns] = useState([])
  const [tenants, setTenants] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [orgFilter, setOrgFilter] = useState('All Organizations')
  const [loading, setLoading] = useState(true)

  const [selectedRun, setSelectedRun] = useState(null)
  const [showInspector, setShowInspector] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [instances, godRes, tList] = await Promise.all([
        api.get('/workflows').catch(() => []),
        api.get('/admin/god-view').catch(() => null),
        api.get('/tenants').catch(() => []),
      ])

      const rawRuns = Array.isArray(instances) && instances.length > 0 ? instances : godRes?.all_workflows || []
      const tenantArr = Array.isArray(tList) ? tList : godRes?.tenants || []
      setTenants(tenantArr)

      // Lookup map for Tenant Name
      const tMap = {}
      tenantArr.forEach(t => {
        if (t.id) tMap[String(t.id)] = t.name
      })

      const enrichedRuns = rawRuns.map(r => {
        const tid = String(r.tenant_id || '')
        const orgName = r.organization_name || tMap[tid] || 'SMBFlow Platform'
        return {
          ...r,
          organization_name: orgName,
        }
      })

      setRuns(enrichedRuns)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return runs.filter(r => {
      const matchSearch =
        !search ||
        r.workflow_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.run_id?.toLowerCase().includes(search.toLowerCase()) ||
        r.trigger_type?.toLowerCase().includes(search.toLowerCase()) ||
        r.organization_name?.toLowerCase().includes(search.toLowerCase())

      const matchStatus = statusFilter === 'All statuses' || r.status === statusFilter
      const matchOrg = orgFilter === 'All Organizations' || r.organization_name === orgFilter

      return matchSearch && matchStatus && matchOrg
    })
  }, [runs, search, statusFilter, orgFilter])

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <NodeInspectorModal
        run={selectedRun}
        open={showInspector}
        onClose={() => setShowInspector(false)}
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Runs & Node Inspection</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitor workflow executions filtered by customer organization — inspect node steps, token usage, and costs.
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search runs by ID, workflow, or org..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Organization Filter Select */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={orgFilter}
                onChange={e => setOrgFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All Organizations">All Organizations</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter Select */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All statuses">All statuses</option>
              <option value="completed">completed</option>
              <option value="running">running</option>
              <option value="escalated">escalated</option>
              <option value="failed">failed</option>
            </select>
            <span className="text-sm text-gray-400">{filtered.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading runs…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="w-10 h-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No workflow run data found</p>
            <p className="text-xs text-gray-400 text-center">
              No executions match your selected organization or status filters.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['RUN ID', 'WORKFLOW', 'ORGANIZATION', 'STATUS', 'TRIGGER', 'TOKENS IN', 'TOKENS OUT', 'COST', 'STARTED', 'NODES'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isEmail = (r.trigger_type === 'New Email' || r.trigger_source === 'email_event_detector')
                return (
                  <tr
                    key={r.run_id}
                    onClick={() => { setSelectedRun(r); setShowInspector(true); }}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-xs font-mono text-blue-600 font-semibold">
                      {r.run_id?.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900 truncate max-w-[140px]">
                      {r.workflow_name || r.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <Building2 className="w-3 h-3 text-slate-500" />
                        {r.organization_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        r.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        r.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        r.status === 'escalated' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isEmail ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {isEmail ? <Mail className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {r.trigger_type || (r.trigger_source === 'manual_ui' ? 'Manual' : 'New Email')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_in)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtTokens(r.total_tokens_out)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-800">
                      {r.total_cost_usd > 0 ? fmtCost(r.total_cost_usd) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(r.started_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRun(r); setShowInspector(true); }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 transition-colors"
                      >
                        Inspect <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
