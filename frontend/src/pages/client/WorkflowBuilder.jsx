// frontend/src/pages/client/WorkflowBuilder.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ReactFlow, Controls, Background, MiniMap, addEdge, MarkerType,
  useNodesState, useEdgesState, Handle, Position,
  Panel, ReactFlowProvider, BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save, Trash2, Plus, GitBranch, Zap, Settings2, X,
  ChevronRight, Play, AlignLeft, LayoutGrid, Code2,
  Map, Eye, RotateCcw, Download, Upload, Layers,
  Search, FlipHorizontal, GripVertical, CheckCircle2,
  AlertTriangle, ShieldCheck, Database, Mail, Globe,
  Terminal, Sparkles, Building2, CreditCard, ArrowRight,
  HelpCircle, Sliders, Send
} from 'lucide-react'
import { useAuth }        from '../../contexts/AuthContext'
import { useTheme }       from '../../contexts/ThemeContext'
import { useBuilderStore } from '../../utils/appStore'
import {
  Card, Button, Input, Textarea, Select, Alert, Spinner,
  EmptyState, Modal, Badge, cn,
} from '../../components/ui'
import { AGENT_ICONS, AGENT_LABELS, AGENT_DESCRIPTIONS } from '../../utils/helpers'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

// ── PALETTE DEFINITIONS ────────────────────────────────────────────────────────
const PALETTE_CATEGORIES = [
  { id: 'all',      label: 'All Items' },
  { id: 'triggers', label: '⚡ Triggers' },
  { id: 'agents',   label: '🤖 Agents' },
  { id: 'logic',    label: '🔀 Logic & HITL' },
  { id: 'tools',    label: '🛠️ Actions & Tools' },
]

const PALETTE_ITEMS = [
  // Triggers
  {
    type: 'trigger_manual',
    category: 'triggers',
    name: 'Manual UI Trigger',
    description: 'Triggered manually by user from Workflow Library',
    color: '#10B981',
    light: '#E6F9F0',
    icon: Play,
  },
  {
    type: 'trigger_email',
    category: 'triggers',
    name: 'Inbound Email Ingest',
    description: 'Triggers automatically on incoming customer email',
    color: '#06B6D4',
    light: '#E0F7FA',
    icon: Mail,
  },
  {
    type: 'trigger_scheduled',
    category: 'triggers',
    name: 'Scheduled Cron',
    description: 'Periodic background interval execution',
    color: '#6366F1',
    light: '#EEF2FF',
    icon: Zap,
  },
  {
    type: 'trigger_webhook',
    category: 'triggers',
    name: 'REST Webhook Ingest',
    description: 'HTTP POST webhook payload ingestion',
    color: '#8B5CF6',
    light: '#F3E8FF',
    icon: Globe,
  },

  // Multi-Agent Nodes
  {
    type: 'research_agent',
    category: 'agents',
    name: 'Research Agent',
    description: 'Context gathering, database query & document fetch',
    color: '#6C63FF',
    light: '#EDE9FF',
    icon: Search,
  },
  {
    type: 'reasoning_agent',
    category: 'agents',
    name: 'Reasoning Agent',
    description: 'Multi-step logic, analysis, and classification',
    color: '#00D4FF',
    light: '#E0FAFF',
    icon: Sparkles,
  },
  {
    type: 'drafting_agent',
    category: 'agents',
    name: 'Drafting Agent',
    description: 'Generates structured content, copy, and posts',
    color: '#10E580',
    light: '#E0FFF2',
    icon: AlignLeft,
  },
  {
    type: 'verification_agent',
    category: 'agents',
    name: 'Verification Agent',
    description: 'Deterministic safety, policy & quality verification',
    color: '#FFB800',
    light: '#FFF9E0',
    icon: ShieldCheck,
  },
  {
    type: 'execution_agent',
    category: 'agents',
    name: 'Execution Agent',
    description: 'Dispatches tool actions and external integrations',
    color: '#FF4757',
    light: '#FFE8EC',
    icon: Terminal,
  },

  // Logic & HITL
  {
    type: 'logic_condition',
    category: 'logic',
    name: 'Condition / Filter',
    description: 'Evaluates boolean logic and branches path',
    color: '#F59E0B',
    light: '#FEF3C7',
    icon: GitBranch,
  },
  {
    type: 'logic_approval_gate',
    category: 'logic',
    name: 'HITL Approval Gate',
    description: 'Pauses execution for human SME review & approval',
    color: '#4F46E5',
    light: '#EEF2FF',
    icon: CheckCircle2,
  },

  // Tools & Connectors
  {
    type: 'tool_email_dispatch',
    category: 'tools',
    name: 'Email Dispatcher',
    description: 'Sends customer email notification',
    color: '#EF4444',
    light: '#FEE2E2',
    icon: Mail,
  },
  {
    type: 'tool_db_mutation',
    category: 'tools',
    name: 'Database Mutation',
    description: 'Inserts or updates CRM / ERP records',
    color: '#3B82F6',
    light: '#DBEAFE',
    icon: Database,
  },
  {
    type: 'tool_http_webhook',
    category: 'tools',
    name: 'Outbound Webhook',
    description: 'Sends JSON payload to external REST API',
    color: '#14B8A6',
    light: '#CCFBF1',
    icon: Globe,
  },
]

const EDGE_CONDITIONS = [
  { value: 'null',                label: 'Always run (Default)' },
  { value: 'not output.escalate', label: 'If not escalated' },
  { value: 'output.escalate',     label: 'If escalated / HITL' },
  { value: 'output.passed',       label: 'If verification passed' },
  { value: 'not output.passed',   label: 'If verification failed' },
  { value: 'output.success',      label: 'If previous succeeded' },
]

const INDUSTRIES = ['saas', 'retail', 'healthcare', 'finance', 'logistics', 'cpg', 'real_estate', 'general']
const CATEGORIES = ['operations', 'marketing', 'sales', 'support', 'finance', 'compliance', 'productivity']

// ── CUSTOM NODE COMPONENT ──────────────────────────────────────────────────────
function CustomWorkflowNode({ data, selected }) {
  const { isDark } = useTheme()
  const pItem = PALETTE_ITEMS.find(p => p.type === data.agentType) || PALETTE_ITEMS[4]
  const color = pItem.color || '#6C63FF'
  const lightColor = pItem.light || '#EDE9FF'
  const IconComponent = pItem.icon || Sparkles

  const isTrigger = data.agentType?.startsWith('trigger_')
  const isHITL    = data.agentType === 'logic_approval_gate'
  const isTool    = data.agentType?.startsWith('tool_')

  return (
    <div
      className={cn(
        'group relative bg-white rounded-2xl shadow-md transition-all duration-200 min-w-[200px] border border-slate-200 overflow-visible',
        selected && 'ring-2 ring-offset-2',
      )}
      style={{
        borderColor: selected ? color : undefined,
        boxShadow: selected ? `0 0 0 2px ${color}, 0 6px 24px ${color}33` : undefined,
      }}
    >
      {/* Top color accent */}
      <div className="h-1.5 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />

      {/* Target Handle (left) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3.5 !h-3.5 !-left-2 !border-2 !border-white transition-all hover:!w-4 hover:!h-4 shadow-xs"
          style={{ background: color }}
        />
      )}

      {/* Source Handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3.5 !h-3.5 !-right-2 !border-2 !border-white transition-all hover:!w-4 hover:!h-4 shadow-xs"
        style={{ background: color }}
      />

      {/* Content */}
      <div className="p-3.5 pb-4">
        <div className="flex items-start gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
            style={{ background: isDark ? `${color}22` : lightColor, color }}
          >
            <IconComponent size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded" style={{ background: `${color}15`, color }}>
                {isTrigger ? 'TRIGGER' : isHITL ? 'HITL GATE' : isTool ? 'TOOL' : 'AGENT'}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-900 leading-tight truncate mt-1">
              {data.name || pItem.name}
            </p>
            <p className="text-[10px] text-slate-400 font-mono truncate">{data.id}</p>
          </div>
        </div>

        {data.description && (
          <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-tight">
            {data.description}
          </p>
        )}

        {data.tools?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-slate-100">
            {data.tools.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 text-[9px] rounded-md font-medium"
                style={{ background: `${color}18`, color }}>
                {t.replace('_', ' ')}
              </span>
            ))}
            {data.tools.length > 3 && (
              <span className="text-[9px] text-slate-400 font-semibold">+{data.tools.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── CUSTOM CONDITION EDGE ──────────────────────────────────────────────────────
function ConditionEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }) {
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2
  const d = `M${sourceX},${sourceY} C${sourceX + 60},${sourceY} ${targetX - 60},${targetY} ${targetX},${targetY}`

  return (
    <>
      <path id={id} d={d} fill="none" markerEnd={markerEnd} style={style} className="react-flow__edge-path" />
      {data?.condition && data.condition !== 'null' && (
        <foreignObject x={midX - 60} y={midY - 12} width="120" height="24">
          <div className="flex items-center justify-center">
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[10px] font-semibold text-slate-700 shadow-xs max-w-[110px] truncate">
              {data.condition}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  )
}

const nodeTypes = { agentNode: CustomWorkflowNode }
const edgeTypes = { conditionEdge: ConditionEdge }

// DAG Helper conversion
function dagToFlow(dag) {
  if (!dag?.nodes?.length) return { nodes: [], edges: [] }
  const cols = Math.max(3, Math.ceil(Math.sqrt(dag.nodes.length)))
  const nodes = dag.nodes.map((n, i) => ({
    id: n.id,
    type: 'agentNode',
    position: { x: (i % cols) * 260 + 50, y: Math.floor(i / cols) * 180 + 50 },
    data: {
      id: n.id,
      name: n.name,
      agentType: n.agent || n.type || 'reasoning_agent',
      tools: n.tools || [],
      promptFile: n.prompt_file || '',
      description: n.description || '',
      timeout: n.timeout_seconds || 90,
    },
  }))
  const edges = (dag.edges || []).map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    type: 'conditionEdge',
    animated: true,
    data: { condition: e.condition || 'null' },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#6C63FF' },
    style: { stroke: '#6C63FF', strokeWidth: 2 },
  }))
  return { nodes, edges }
}

function flowToDag(nodes, edges, meta) {
  return {
    _meta: meta,
    nodes: nodes.map(n => ({
      id: n.id,
      agent: n.data.agentType,
      name: n.data.name || n.id,
      description: n.data.description || '',
      prompt_file: n.data.promptFile || '',
      tools: n.data.tools || [],
      timeout_seconds: n.data.timeout || 90,
    })),
    edges: edges.map(e => ({
      from: e.source,
      to: e.target,
      condition: e.data?.condition === 'null' ? null : (e.data?.condition || null),
    })),
    escalation_config: { sla_hours: meta.sla_hours || 4, resume_after_decision: true },
  }
}

// ── DRAG & DROP PALETTE ────────────────────────────────────────────────────────
function PaletteSidebar({ onDragStart, onAddItem }) {
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch]       = useState('')

  const filtered = useMemo(() => {
    return PALETTE_ITEMS.filter(item => {
      const matchCat = activeTab === 'all' || item.category === activeTab
      const matchQuery = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchQuery
    })
  }, [activeTab, search])

  return (
    <div className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full z-10 select-none">
      <div className="p-3.5 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-900 mb-2">Workflow Components</p>
        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search triggers, agents, tools…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1">
          {PALETTE_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={cn(
                'text-[10px] font-semibold px-2 py-1 rounded-md transition-all',
                activeTab === c.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Item List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {filtered.map(item => {
          const IconComp = item.icon
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onClick={() => onAddItem(item.type)}
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs cursor-grab active:cursor-grabbing transition-all group"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
                style={{ background: item.light, color: item.color }}
              >
                <IconComp size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                  {item.name}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{item.description}</p>
              </div>
              <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0" />
            </div>
          )
        })}
      </div>

      <div className="p-3 border-t border-slate-100 text-[11px] text-slate-400 text-center bg-slate-50/60">
        Drag onto canvas or click to add
      </div>
    </div>
  )
}

// ── NODE CONFIGURATION INSPECTOR ───────────────────────────────────────────────
function NodeInspector({ node, onSave, onDelete, onClose, allTools, promptFiles }) {
  const [data, setData] = useState({ ...node.data })
  const set = (k, v) => setData(p => ({ ...p, [k]: v }))

  const toggleTool = (t) => {
    const cur = data.tools || []
    set('tools', cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])
  }

  return (
    <motion.div
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 320 }}
      className="absolute right-0 top-0 bottom-0 w-84 bg-white border-l border-slate-200 z-30 shadow-xl overflow-y-auto flex flex-col"
    >
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Configure Node</h3>
          <p className="text-[10px] text-slate-400 font-mono">{node.id}</p>
        </div>
        <div className="flex gap-1">
          <Button size="xs" variant="danger" icon={<Trash2 className="w-3 h-3" />} onClick={() => { onDelete(node.id); onClose() }} />
          <Button size="xs" variant="secondary" onClick={onClose} icon={<X className="w-3 h-3" />} />
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <Select
          label="Component Type"
          value={data.agentType || ''}
          onChange={e => set('agentType', e.target.value)}
          options={PALETTE_ITEMS.map(p => ({ value: p.type, label: p.name }))}
        />
        <Input label="Node ID (snake_case)" value={data.id || ''} onChange={e => set('id', e.target.value.replace(/\s/g, '_').toLowerCase())} />
        <Input label="Display Label" value={data.name || ''} onChange={e => set('name', e.target.value)} />
        <Textarea label="Node Purpose & Description" value={data.description || ''} onChange={e => set('description', e.target.value)} rows={2} />

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Prompt Template File</label>
          {promptFiles.length > 0 ? (
            <select value={data.promptFile || ''} onChange={e => set('promptFile', e.target.value)} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <option value="">— system default prompt —</option>
              {promptFiles.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          ) : (
            <Input value={data.promptFile || ''} onChange={e => set('promptFile', e.target.value)} placeholder="prompts/custom_agent.txt" />
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Connected Tools & Capabilities</p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {allTools.length > 0 ? (
              allTools.map(t => {
                const on = (data.tools || []).includes(t.name || t)
                const name = t.name || t
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleTool(name)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] border transition-all font-medium',
                      on
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {name}
                  </button>
                )
              })
            ) : (
              <p className="text-[11px] text-slate-400 italic">No tools loaded</p>
            )}
          </div>
        </div>

        <Input
          label="Execution Timeout (seconds)"
          type="number"
          value={data.timeout || 90}
          onChange={e => set('timeout', parseInt(e.target.value) || 90)}
        />
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => { onSave(node.id, data); onClose() }}
          icon={<Save className="w-4 h-4" />}
        >
          Save Node
        </Button>
      </div>
    </motion.div>
  )
}

// ── TEST RUN DRAWER ────────────────────────────────────────────────────────────
function TestRunDrawer({ open, onClose, workflowKey, api }) {
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) { setResult(null); setError('') }
  }, [open])

  const executeTest = async () => {
    setRunning(true); setError(''); setResult(null)
    try {
      const resp = await api.post(`/admin/workflows/${workflowKey}/test-run`, {
        input_payload: { sample_customer: 'Acme Corp', sample_revenue: 120000 },
        mock_mode: true
      })
      setResult(resp)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Test run failed')
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sandbox Test Runner: {workflowKey}</h3>
              <p className="text-[11px] text-slate-400">Dry-run DAG simulation with mock execution trace</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 leading-relaxed">
            Execute a safe dry-run through all nodes to test graph connectivity, execution paths, and compute estimated AI token consumption.
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Executed Nodes</span>
                  <span className="text-sm font-bold text-slate-900">{result.total_nodes_executed}</span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Est. Tokens</span>
                  <span className="text-sm font-bold text-slate-900">{result.total_simulated_tokens}</span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Simulated Cost</span>
                  <span className="text-sm font-bold text-emerald-600">${result.total_simulated_cost_usd}</span>
                </div>
              </div>

              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mt-3">Node Execution Trace</p>
              <div className="space-y-2">
                {result.steps?.map((s, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {s.step_index}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{s.label}</span>
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {s.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{s.output_preview}</p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        {s.tokens_consumed} tokens · ${s.cost_usd}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button variant="primary" size="sm" loading={running} onClick={executeTest} icon={<Play size={12} className="fill-white" />}>
            Run Simulation
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── ASSIGN WORKFLOW TO ORGS & PLANS MODAL ──────────────────────────────────────
function AssignWorkflowModal({ open, onClose, workflowKey, workflowName, api, onDone }) {
  const [orgs, setOrgs]       = useState([])
  const [plans, setPlans]     = useState([])
  const [selectedOrgs, setSelOrgs]   = useState([])
  const [selectedPlans, setSelPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true); setError('')
    Promise.all([
      api.get('/admin/organizations').catch(() => []),
      api.get('/admin/plans').catch(() => []),
      api.get('/admin/workflows/catalog').catch(() => []),
    ]).then(([oList, pList, cList]) => {
      setOrgs(Array.isArray(oList) ? oList : [])
      setPlans(Array.isArray(pList) ? pList : [])
      // Match current workflow ID from catalog
      const cat = (cList || []).find(c => c.key === workflowKey)
      if (cat) {
        // fetch current org assignments & plan entitlements
        api.get(`/admin/workflows/assignments`).then(as => {
          const matched = (as || []).filter(a => a.workflow_id === cat.id).map(a => a.organization_id)
          setSelOrgs(matched)
        }).catch(() => {})
      }
    }).finally(() => setLoading(false))
  }, [open, workflowKey, api])

  const toggleOrg = (id) => {
    setSelOrgs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const togglePlan = (slug) => {
    setSelPlans(prev => prev.includes(slug) ? prev.filter(x => x !== slug) : [...prev, slug])
  }

  const handleSaveAssignments = async () => {
    setSaving(true); setError('')
    try {
      // 1. Get workflow ID
      const cat = await api.get(`/admin/workflows/catalog`)
      const targetWf = (cat || []).find(c => c.key === workflowKey)
      if (!targetWf) throw new Error("Workflow not registered in catalog yet. Please click 'Publish & Save' first.")

      // 2. Assign to orgs
      for (const orgId of selectedOrgs) {
        await api.post(`/admin/organizations/${orgId}/workflows/${targetWf.id}/assign`, {
          notes: 'Assigned via Workflow Builder'
        }).catch(() => {})
      }

      // 3. Assign to plans
      for (const p of plans) {
        if (selectedPlans.includes(p.slug)) {
          const curEnt = await api.get(`/admin/plans`).then(ps => ps.find(x => x.id === p.id)?.entitlements || []).catch(() => [])
          const newEnt = Array.from(new Set([...curEnt, targetWf.id]))
          await api.put(`/admin/plans/${p.id}/entitlements`, { workflow_ids: newEnt }).catch(() => {})
        }
      }

      onDone(`Workflow '${workflowName}' successfully assigned to ${selectedOrgs.length} organization(s) and entitled on ${selectedPlans.length} plan(s).`)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Assignment failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assign Workflow: {workflowName}</h3>
              <p className="text-[11px] text-slate-400">Configure organization access and subscription plan entitlements</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Plan Entitlements */}
          <div>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CreditCard size={13} className="text-blue-600" /> Entitle on Billing Plans
            </p>
            <div className="grid grid-cols-2 gap-2">
              {plans.map(p => (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all',
                    selectedPlans.includes(p.slug)
                      ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlans.includes(p.slug)}
                    onChange={() => togglePlan(p.slug)}
                    className="rounded text-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight">{p.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{p.slug}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Org Direct Assignment */}
          <div>
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 size={13} className="text-blue-600" /> Assign Directly to Organizations
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {orgs.map(o => (
                <label
                  key={o.id}
                  className={cn(
                    'flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all',
                    selectedOrgs.includes(o.id)
                      ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedOrgs.includes(o.id)}
                    onChange={() => toggleOrg(o.id)}
                    className="rounded text-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight">{o.name}</p>
                    <p className="text-[10px] text-slate-400">{o.industry || 'general'} · {o.tier || 'free'}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSaveAssignments} icon={<CheckCircle2 size={12} />}>
            Save Assignments
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── AI WORKFLOW COPILOT MODAL ──────────────────────────────────────────────────
function AICopilotModal({ open, onClose, api, onWorkflowGenerated }) {
  const [prompt, setPrompt]         = useState('')
  const [industry, setIndustry]     = useState('general')
  const [generating, setGenerating] = useState(false)
  const [stepIndex, setStepIndex]   = useState(0)
  const [error, setError]           = useState('')

  const STEPS = [
    '🧠 Analyzing prompt semantics & business rules...',
    '🤖 Selecting multi-agent roles (Research, Reasoning, Drafting, Verification)...',
    '🔀 Constructing branching logic & HITL approval gates...',
    '🎨 Calculating 2D layout & compiling DAG...',
  ]

  useEffect(() => {
    let timer
    if (generating) {
      setStepIndex(0)
      timer = setInterval(() => {
        setStepIndex(prev => (prev < STEPS.length - 1 ? prev + 1 : prev))
      }, 600)
    }
    return () => clearInterval(timer)
  }, [generating])

  const PROMPT_SUGGESTIONS = [
    { label: '🛡️ Fraud & Invoice Triage', text: 'Build an automated invoice fraud detector that parses vendor PDFs, queries past purchase orders, flags suspicious amounts > $5,000 for SME Manager approval, and notifies accounting.' },
    { label: '🏥 Patient Clinic Triage', text: 'Create a patient clinic booking & reminder workflow that ingests calendar appointments, verifies patient SMS consent, crafts WhatsApp reminders, routes rescheduling to receptionist HITL gate, and updates clinic DB.' },
    { label: '📉 SaaS Churn Prevention', text: 'Build a B2B SaaS customer churn prevention workflow that detects high drop-off risk, queries CRM data, reasons on retention strategies, requests manager approval for discounts > 20%, and sends a customized email offer.' },
    { label: '⚡ Support SLA Escalator', text: 'Design an AI customer support ticket escalation workflow that ingests Zendesk webhooks, classifies ticket sentiment and urgency, drafts resolution responses, and escalates VIP complaints to engineering leads.' },
  ]

  const handleGenerate = async (e) => {
    e?.preventDefault()
    if (!prompt.trim()) { setError('Please enter a description of the workflow'); return }
    setGenerating(true); setError('')
    try {
      const resp = await api.post('/admin/workflows/ai-generate', {
        prompt: prompt.trim(),
        industry: industry,
      })
      onWorkflowGenerated(resp)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'AI synthesis failed')
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl flex flex-col overflow-hidden animate-scale-in">
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-xs">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">SMBFlow AI Workflow Copilot</h3>
              <p className="text-[11px] text-white/80">Generate complete multi-agent DAG automations from natural language</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl font-bold">×</button>
        </div>

        <form onSubmit={handleGenerate} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Describe the workflow you want to create
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={generating}
              rows={3}
              placeholder="e.g. Build an automated medical appointment reminder and triage workflow that ingests calendar bookings, verifies patient details, reasons on priority, alerts nurse SME if urgent, and sends SMS notifications."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none font-medium leading-relaxed"
            />
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Prompt Inspirations
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(item.text)}
                  className="text-left p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-all text-[11px] text-slate-700 font-medium truncate"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Select
              label="Target Industry"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              options={INDUSTRIES.map(i => ({ value: i, label: i.charAt(0).toUpperCase() + i.slice(1) }))}
            />
            <div className="flex flex-col justify-end">
              <p className="text-[11px] text-slate-400 pb-1">
                AI will automatically pick the best triggers, agents, HITL gates &amp; tools.
              </p>
            </div>
          </div>

          {generating && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <Spinner size="sm" />
                <span>Generating Multi-Agent Workflow...</span>
              </div>
              <p className="text-xs text-indigo-700 font-medium pl-6">
                {STEPS[stepIndex]}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={generating}
              icon={<Sparkles size={13} />}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold"
            >
              Synthesize &amp; Load to Canvas
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── MAIN CANVAS COMPONENT ──────────────────────────────────────────────────────
function FlowCanvas({ workflowName, dag, allTools, promptFiles, onSave, isSaving, onRun, onTestRun, onOpenAssign, onOpenAICopilot }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [editingNode, setEditingNode]    = useState(null)
  const [view, setView]                  = useState('canvas')
  const [rawJson, setRawJson]            = useState('')
  const [jsonErr, setJsonErr]            = useState('')
  const { setDirty }                     = useBuilderStore()
  const rfWrapper                        = useRef(null)
  const [rfInstance, setRfInstance]      = useState(null)

  const [meta, setMeta] = useState({
    workflow_id: workflowName,
    name: workflowName?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    industry: 'saas',
    version: '1.0.0',
    description: '',
    trigger_types: ['manual'],
    sla_hours: 4,
  })

  useEffect(() => {
    if (!dag) return
    const { nodes: n, edges: e } = dagToFlow(dag)
    setNodes(n)
    setEdges(e)
    if (dag._meta) setMeta(m => ({ ...m, ...dag._meta }))
    setRawJson(JSON.stringify(flowToDag(n, e, meta), null, 2))
  }, [dag, workflowName])

  const onConnect = useCallback((params) => {
    const edge = {
      ...params,
      type: 'conditionEdge',
      data: { condition: 'null' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#6C63FF' },
      style: { stroke: '#6C63FF', strokeWidth: 2 },
    }
    setEdges(eds => addEdge(edge, eds))
    setDirty(true)
  }, [setEdges, setDirty])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('agentType')
    if (!type || !rfWrapper.current || !rfInstance) return
    const bounds = rfWrapper.current.getBoundingClientRect()
    const pos = rfInstance.screenToFlowPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    const pItem = PALETTE_ITEMS.find(p => p.type === type)
    const nodeId = `${type.replace('trigger_', '').replace('tool_', '').replace('logic_', '').replace('_agent', '')}_${Date.now().toString(36)}`
    setNodes(ns => [...ns, {
      id: nodeId,
      type: 'agentNode',
      position: pos,
      data: {
        id: nodeId,
        agentType: type,
        name: pItem?.name || type,
        tools: [],
        promptFile: '',
        description: pItem?.description || '',
      },
    }])
    setDirty(true)
  }, [rfInstance, setNodes, setDirty])

  const onDragStart = (e, agentType) => e.dataTransfer.setData('agentType', agentType)

  const onAddItem = (type) => {
    const pItem = PALETTE_ITEMS.find(p => p.type === type)
    const nodeId = `${type.replace('trigger_', '').replace('tool_', '').replace('logic_', '').replace('_agent', '')}_${Date.now().toString(36)}`
    const pos = { x: 100 + (nodes.length * 40), y: 100 + (nodes.length * 30) }
    setNodes(ns => [...ns, {
      id: nodeId,
      type: 'agentNode',
      position: pos,
      data: {
        id: nodeId,
        agentType: type,
        name: pItem?.name || type,
        tools: [],
        promptFile: '',
        description: pItem?.description || '',
      },
    }])
    setDirty(true)
  }

  const handleSave = () => {
    const currentDag = flowToDag(nodes, edges, meta)
    onSave(currentDag)
    setDirty(false)
  }

  const autoLayout = () => {
    const ordered = [...nodes]
    ordered.forEach((n, i) => {
      n.position = { x: i * 260 + 40, y: 120 }
    })
    setNodes([...ordered])
  }

  return (
    <div className="flex h-full relative">
      <PaletteSidebar onDragStart={onDragStart} onAddItem={onAddItem} />

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Canvas Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white/90 backdrop-blur-sm gap-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {[['canvas', LayoutGrid, 'Visual Canvas'], ['json', Code2, 'DAG JSON']].map(([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    if (v === 'json') setRawJson(JSON.stringify(flowToDag(nodes, edges, meta), null, 2))
                    setView(v)
                  }}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
                    view === v ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
            <Button size="xs" variant="secondary" onClick={autoLayout} icon={<FlipHorizontal className="w-3 h-3" />}>
              Auto-Align
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setNodes([])} icon={<RotateCcw className="w-3 h-3" />}>
              Clear
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={onOpenAICopilot}
              icon={<Sparkles className="w-3 h-3 text-indigo-600" />}
              className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-semibold"
            >
              AI Copilot
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">
              {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge{edges.length !== 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="secondary" onClick={onOpenAssign} icon={<Building2 className="w-3.5 h-3.5 text-blue-600" />}>
              Assign Orgs & Plans
            </Button>
            <Button size="sm" variant="secondary" onClick={onTestRun} icon={<Terminal className="w-3.5 h-3.5 text-emerald-600" />}>
              Test Run
            </Button>
            <Button size="sm" variant="primary" loading={isSaving} onClick={handleSave} icon={<Save className="w-3.5 h-3.5" />}>
              Publish & Save
            </Button>
          </div>
        </div>

        {/* Canvas / JSON Area */}
        <div className="flex-1 relative overflow-hidden" ref={rfWrapper}>
          {view === 'canvas' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={(changes) => { onNodesChange(changes); setDirty(true) }}
              onEdgesChange={(changes) => { onEdgesChange(changes); setDirty(true) }}
              onConnect={onConnect}
              onInit={setRfInstance}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onNodeClick={(_, node) => setEditingNode(node)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode="Delete"
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(100,116,139,0.2)" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) => {
                  const p = PALETTE_ITEMS.find(item => item.type === n.data?.agentType)
                  return p?.color || '#6C63FF'
                }}
              />
              <Panel position="bottom-center">
                <div className="text-[11px] text-slate-500 bg-white/95 px-3.5 py-1.5 rounded-full border border-slate-200 shadow-xs font-medium">
                  Drag components from sidebar · Click node to configure · Press Delete to remove
                </div>
              </Panel>
            </ReactFlow>
          ) : (
            <div className="h-full p-4 bg-slate-900">
              {jsonErr && <div className="text-xs text-red-400 mb-2 font-mono">{jsonErr}</div>}
              <textarea
                value={rawJson}
                onChange={e => {
                  setRawJson(e.target.value)
                  try {
                    const d = JSON.parse(e.target.value)
                    const { nodes: n, edges: eg } = dagToFlow(d)
                    setNodes(n)
                    setEdges(eg)
                    setJsonErr('')
                    setDirty(true)
                  } catch {
                    setJsonErr('Invalid JSON structure')
                  }
                }}
                spellCheck={false}
                className="w-full h-full bg-transparent text-emerald-400 font-mono text-xs focus:outline-none resize-none"
              />
            </div>
          )}

          {/* Node Edit Drawer */}
          <AnimatePresence>
            {editingNode && (
              <NodeInspector
                node={editingNode}
                onSave={(id, data) => {
                  setNodes(ns => ns.map(n => n.id === id ? { ...n, data } : n))
                  setDirty(true)
                }}
                onDelete={(id) => {
                  setNodes(ns => ns.filter(n => n.id !== id))
                  setEdges(es => es.filter(e => e.source !== id && e.target !== id))
                  setDirty(true)
                }}
                onClose={() => setEditingNode(null)}
                allTools={allTools}
                promptFiles={promptFiles}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── MAIN WORKFLOW BUILDER PAGE ─────────────────────────────────────────────────
export default function WorkflowBuilder() {
  const navigate          = useNavigate()
  const [searchParams]    = useSearchParams()
  const { api, user }     = useAuth()
  const [workflows, setWorkflows]     = useState([])
  const [selected, setSelected]       = useState(null)
  const [dag, setDag]                 = useState(null)
  const [allTools, setAllTools]       = useState([])
  const [promptFiles, setPromptFiles] = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [showCreate, setShowCreate]   = useState(false)
  const [aiCopilotOpen, setAiCopilotOpen] = useState(false)
  const [testDrawerOpen, setTestDrawerOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)

  // Form state for creating new custom workflow
  const [formName, setFormName]         = useState('')
  const [formKey, setFormKey]           = useState('')
  const [formIndustry, setFormIndustry] = useState(user?.industry || 'general')
  const [formCategory, setFormCategory] = useState('operations')
  const [formTrigger, setFormTrigger]   = useState('manual')
  const [formDesc, setFormDesc]         = useState('')

  const load = useCallback(async () => {
    try {
      const [wfs, tools, ptree] = await Promise.all([
        api.get('/config/workflows'),
        api.get('/admin/tools/library').catch(() => ({ triggers: [], agents: [], logic: [], tools: [] })),
        api.get('/config/prompt-tree').catch(() => ({ files: [] })),
      ])
      setWorkflows(Array.isArray(wfs) ? wfs : [])
      setAllTools(tools.tools || [])
      setPromptFiles(ptree.files || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const selectWorkflow = async (name) => {
    try {
      const d = await api.get(`/config/dag/${name}`)
      setSelected(name)
      setDag(d)
    } catch (e) {
      setError(e.message)
    }
  }

  const didPreselectRef = useRef(false)
  useEffect(() => {
    if (didPreselectRef.current || loading) return
    const wf = searchParams.get('wf')
    if (!wf) return
    if (workflows.some(w => w.name === wf)) {
      didPreselectRef.current = true
      selectWorkflow(wf)
    }
  }, [searchParams, loading, workflows])

  const handleSaveDAG = async (dagData) => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const resp = await api.post('/admin/workflows/custom', {
        name: dagData._meta?.name || selected,
        key: selected,
        description: dagData._meta?.description || '',
        category: dagData._meta?.category || 'operations',
        industry: dagData._meta?.industry || 'general',
        scope: 'GLOBAL',
        trigger_type: dagData._meta?.trigger?.type || 'manual',
        sla_hours: dagData._meta?.sla_hours || 4,
        dag: dagData,
      })
      setSuccess(resp?.message || 'Workflow published and saved to catalog!')
      await load()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleWorkflowGenerated = async (generatedWf) => {
    const initialDag = {
      _meta: {
        workflow_id: generatedWf.key,
        name: generatedWf.name,
        industry: generatedWf.industry,
        category: generatedWf.category,
        version: '1.0.0',
        description: generatedWf.description,
        trigger: { type: generatedWf.trigger_type, source: 'ai_copilot' },
        trigger_types: [generatedWf.trigger_type],
        sla_hours: generatedWf.sla_hours || 4,
        is_custom: true,
      },
      nodes: generatedWf.nodes.map(n => ({
        id: n.id,
        agent: n.data?.agentType || 'reasoning_agent',
        name: n.data?.name || n.id,
        description: n.data?.prompt_directive || '',
        timeout_seconds: n.data?.timeout_seconds || 60,
        tools: n.data?.tools || [],
      })),
      edges: generatedWf.edges.map(e => ({
        from: e.source,
        to: e.target,
        condition: e.condition || null,
      })),
      escalation_config: { sla_hours: generatedWf.sla_hours || 4, resume_after_decision: true },
    }

    try {
      setSaving(true)
      await api.post('/admin/workflows/custom', {
        name: generatedWf.name,
        key: generatedWf.key,
        description: generatedWf.description,
        category: generatedWf.category,
        industry: generatedWf.industry,
        scope: generatedWf.scope || 'GLOBAL',
        trigger_type: generatedWf.trigger_type,
        sla_hours: generatedWf.sla_hours || 4,
        dag: initialDag,
      })
      await load()
      setSelected(generatedWf.key)
      setDag(initialDag)
      setSuccess(`✨ AI Copilot synthesized '${generatedWf.name}' with ${generatedWf.nodes.length} nodes!`)
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Could not load generated workflow')
    } finally {
      setSaving(false)
    }
  }

  const createWorkflow = async (e) => {
    e.preventDefault()
    const cleanKey = (formKey || formName).trim().replace(/\s+/g, '_').toLowerCase()
    if (!cleanKey || !formName.trim()) {
      setError('Please provide workflow name and key')
      return
    }

    const initialDag = {
      _meta: {
        workflow_id: cleanKey,
        name: formName,
        industry: formIndustry,
        category: formCategory,
        version: '1.0.0',
        description: formDesc,
        trigger: { type: formTrigger, source: 'visual_builder' },
        trigger_types: [formTrigger],
      },
      nodes: [
        { id: 'trigger_1', agent: `trigger_${formTrigger}`, name: 'Trigger Event', description: 'Initial event source', timeout_seconds: 60 },
        { id: 'agent_1', agent: 'reasoning_agent', name: 'Analysis & Plan', description: 'Context reasoning and decision', timeout_seconds: 90 },
      ],
      edges: [
        { from: 'trigger_1', to: 'agent_1', condition: null }
      ],
      escalation_config: { sla_hours: 4, resume_after_decision: true },
    }

    try {
      setSaving(true)
      await api.post('/admin/workflows/custom', {
        name: formName,
        key: cleanKey,
        description: formDesc,
        category: formCategory,
        industry: formIndustry,
        scope: 'GLOBAL',
        trigger_type: formTrigger,
        dag: initialDag,
      })
      await load()
      await selectWorkflow(cleanKey)
      setShowCreate(false)
      setFormName('')
      setFormKey('')
      setFormDesc('')
      setSuccess(`Workflow '${formName}' created and loaded on canvas!`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Creation failed')
    } finally {
      setSaving(false)
    }
  }

  const deleteWorkflow = async (name, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete workflow "${name}"?`)) return
    try {
      await api.delete(`/config/dag/${name}`)
      if (selected === name) { setSelected(null); setDag(null) }
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  return (
    <div className="h-[calc(100vh-var(--nav-height)-70px)] flex flex-col p-4 bg-slate-100">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <GitBranch className="text-blue-600" size={22} />
            Visual Workflow Builder
          </h1>
          <p className="text-xs text-slate-500">
            Build custom multi-agent DAG automations with n8n-style triggers, agents, HITL gates, and direct organization assignment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {error   && <div className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">{error}</div>}
          {success && <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg font-medium">{success}</div>}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAiCopilotOpen(true)}
            icon={<Sparkles size={14} className="text-indigo-600" />}
            className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-900 hover:from-blue-100 hover:to-indigo-100 font-semibold"
          >
            Generate with AI Copilot
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)} icon={<Plus size={14} />}>
            New Workflow
          </Button>
        </div>
      </div>

      {/* Main Builder Container */}
      <div className="flex-1 flex bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-h-0">
        {/* Left Workflow List */}
        <div className="w-60 shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="px-3.5 py-3 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Catalog Workflows</p>
            <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded-full">{workflows.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {workflows.map(w => (
              <div
                key={w.name}
                onClick={() => selectWorkflow(w.name)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all border',
                  selected === w.name
                    ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs font-semibold'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <GitBranch size={14} className={selected === w.name ? 'text-blue-600' : 'text-slate-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate leading-tight">{w.display_name || w.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{w.name}</p>
                </div>
                <button
                  onClick={e => deleteWorkflow(w.name, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center / Right Canvas */}
        <div className="flex-1 min-w-0 min-h-0">
          {selected && dag ? (
            <ReactFlowProvider>
              <FlowCanvas
                workflowName={selected}
                dag={dag}
                allTools={allTools}
                promptFiles={promptFiles}
                onSave={handleSaveDAG}
                isSaving={saving}
                onTestRun={() => setTestDrawerOpen(true)}
                onOpenAssign={() => setAssignModalOpen(true)}
                onOpenAICopilot={() => setAiCopilotOpen(true)}
              />
            </ReactFlowProvider>
          ) : (
            <div className="h-full flex items-center justify-center p-8 bg-slate-50/50">
              <div className="text-center max-w-sm">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Create with AI Copilot or Select Workflow</h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Describe what business process you want to automate, or select an existing workflow from the catalog sidebar.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setAiCopilotOpen(true)}
                    icon={<Sparkles size={14} />}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold"
                  >
                    Generate with AI Copilot
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)} icon={<Plus size={14} />}>
                    Blank Canvas
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Copilot Modal */}
      <AICopilotModal
        open={aiCopilotOpen}
        onClose={() => setAiCopilotOpen(false)}
        api={api}
        onWorkflowGenerated={handleWorkflowGenerated}
      />

      {/* Test Run Drawer */}
      <TestRunDrawer
        open={testDrawerOpen}
        onClose={() => setTestDrawerOpen(false)}
        workflowKey={selected}
        api={api}
      />

      {/* Assign Orgs & Plans Modal */}
      <AssignWorkflowModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        workflowKey={selected}
        workflowName={dag?._meta?.name || selected}
        api={api}
        onDone={(msg) => {
          setSuccess(msg)
          setTimeout(() => setSuccess(''), 5000)
        }}
      />

      {/* Create Custom Workflow Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Custom Workflow" width="max-w-md">
        <form onSubmit={createWorkflow} className="space-y-3.5">
          <Input
            label="Workflow Display Name"
            value={formName}
            onChange={e => {
              setFormName(e.target.value)
              if (!formKey || formKey === formName.toLowerCase().replace(/\s+/g, '_')) {
                setFormKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))
              }
            }}
            placeholder="e.g. Lead Qualification & Scoring"
            required
          />
          <Input
            label="Workflow Identifier Key (snake_case)"
            value={formKey}
            onChange={e => setFormKey(e.target.value.replace(/\s+/g, '_').toLowerCase())}
            placeholder="lead_qualification_scoring"
            hint="Used in API and DAG filename"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Category"
              value={formCategory}
              onChange={e => setFormCategory(e.target.value)}
              options={CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            />
            <Select
              label="Primary Trigger"
              value={formTrigger}
              onChange={e => setFormTrigger(e.target.value)}
              options={[
                { value: 'manual',    label: 'Manual Run' },
                { value: 'email',     label: 'Inbound Email' },
                { value: 'scheduled', label: 'Scheduled Cron' },
                { value: 'webhook',   label: 'REST Webhook' },
              ]}
            />
          </div>
          <Select
            label="Target Industry"
            value={formIndustry}
            onChange={e => setFormIndustry(e.target.value)}
            options={INDUSTRIES.map(i => ({ value: i, label: i.charAt(0).toUpperCase() + i.slice(1) }))}
          />
          <Textarea
            label="Workflow Description"
            value={formDesc}
            onChange={e => setFormDesc(e.target.value)}
            placeholder="Describe what this multi-agent workflow accomplishes..."
            rows={2}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" loading={saving}>Create &amp; Open Canvas</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}