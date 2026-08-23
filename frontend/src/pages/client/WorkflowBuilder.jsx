// frontend/src/pages/client/WorkflowBuilder.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Search, FlipHorizontal, GripVertical,
} from 'lucide-react'
import { useAuth }        from '../../contexts/AuthContext'
import { useTheme }       from '../../contexts/ThemeContext'
import { useBuilderStore } from "../../utils/appStore";
import {
  Card, Button, Input, Textarea, Select, Alert, Spinner,
  EmptyState, Modal, Badge, cn,
} from '../../components/ui'
import { AGENT_ICONS, AGENT_LABELS, AGENT_DESCRIPTIONS } from '../../utils/helpers'

// ── Agent type config ──────────────────────────────────────────────────────────
const AGENT_TYPES = [
  { type: 'research_agent',     color: '#6C63FF', light: '#EDE9FF' },
  { type: 'reasoning_agent',    color: '#00D4FF', light: '#E0FAFF' },
  { type: 'drafting_agent',     color: '#10E580', light: '#E0FFF2' },
  { type: 'verification_agent', color: '#FFB800', light: '#FFF9E0' },
  { type: 'execution_agent',    color: '#FF4757', light: '#FFE8EC' },
  { type: 'memory_agent',       color: '#A78BFA', light: '#F0EEFF' },
  { type: 'consensus_agent',    color: '#F472B6', light: '#FFF0F8' },
  { type: 'discovery_agent',    color: '#34D399', light: '#E8FFF8' },
]

const EDGE_CONDITIONS = [
  { value: 'null',               label: 'Always run' },
  { value: 'not output.escalate','label': 'If not escalated' },
  { value: 'output.escalate',    label: 'If escalated' },
  { value: 'output.passed',      label: 'If verification passed' },
  { value: 'not output.passed',  label: 'If verification failed' },
  { value: 'output.success',     label: 'If previous succeeded' },
]

const INDUSTRIES = ['saas','retail','healthcare','finance','logistics','cpg','real_estate']
const TRIGGER_TYPES = ['manual','scheduled','webhook']

// ── Custom Agent Node ──────────────────────────────────────────────────────────
function AgentNode({ data, selected, id }) {
  const { isDark } = useTheme()
  const ac = AGENT_TYPES.find(a => a.type === data.agentType)
  const color = ac?.color || '#6C63FF'
  const lightColor = ac?.light || '#EDE9FF'

  return (
    <div
      className={cn(
        'group relative surface-card rounded-2xl shadow-md transition-all duration-200 min-w-[180px] overflow-visible',
        selected && 'ring-2 ring-offset-2',
      )}
      style={{
        borderColor: selected ? color : undefined,
        boxShadow: selected ? `0 0 0 2px ${color}, 0 4px 20px ${color}33` : undefined,
      }}
    >
      {/* Top color bar */}
      <div className="h-1.5 rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !-left-1.5 !border-2 !border-[rgb(var(--bg-card))] transition-all hover:!w-4 hover:!h-4"
        style={{ background: color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !-right-1.5 !border-2 !border-[rgb(var(--bg-card))] transition-all hover:!w-4 hover:!h-4"
        style={{ background: color }}
      />

      {/* Content */}
      <div className="p-3 pb-3.5">
        <div className="flex items-start gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ background: isDark ? `${color}22` : lightColor }}
          >
            {(() => { const Icon = AGENT_ICONS[data.agentType]; return <Icon className="w-5 h-5" />; })()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[rgb(var(--text-primary))] leading-tight truncate">
              {data.name || AGENT_LABELS[data.agentType] || data.agentType}
            </p>
            <p className="text-[10px] text-[rgb(var(--text-muted))] font-mono mt-0.5 truncate">{data.id}</p>
          </div>
        </div>

        {data.tools?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.tools.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 text-[9px] rounded-full font-medium"
                style={{ background: `${color}18`, color }}>
                {t.replace('_', ' ')}
              </span>
            ))}
            {data.tools.length > 3 && (
              <span className="text-[9px] text-[rgb(var(--text-muted))]">+{data.tools.length - 3}</span>
            )}
          </div>
        )}

        {data.promptFile && (
          <p className="text-[9px] text-[rgb(var(--text-muted))] mt-1.5 font-mono truncate">📄 {data.promptFile}</p>
        )}
      </div>
    </div>
  )
}

// ── Custom Edge Label ─────────────────────────────────────────────────────────
function ConditionEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }) {
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2
  const d = `M${sourceX},${sourceY} C${sourceX + 60},${sourceY} ${targetX - 60},${targetY} ${targetX},${targetY}`

  return (
    <>
      <path id={id} d={d} fill="none" markerEnd={markerEnd} style={style} className="react-flow__edge-path" />
      {data?.condition && data.condition !== 'null' && (
        <foreignObject x={midX - 50} y={midY - 12} width="100" height="24">
          <div className="flex items-center justify-center">
            <span className="px-2 py-0.5 bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--border))] rounded-full text-[10px] font-medium text-[rgb(var(--text-secondary))] whitespace-nowrap max-w-[96px] truncate">
              {data.condition}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  )
}

const nodeTypes  = { agentNode: AgentNode }
const edgeTypes  = { conditionEdge: ConditionEdge }

// Helper: DAG → React Flow nodes/edges
function dagToFlow(dag) {
  if (!dag?.nodes?.length) return { nodes: [], edges: [] }
  const cols = Math.ceil(Math.sqrt(dag.nodes.length))
  const nodes = dag.nodes.map((n, i) => ({
    id:   n.id,
    type: 'agentNode',
    position: { x: (i % cols) * 260, y: Math.floor(i / cols) * 200 },
    data: {
      id: n.id, name: n.name, agentType: n.agent,
      tools: n.tools || [], promptFile: n.prompt_file || '',
      description: n.description || '', timeout: n.timeout_seconds || 90,
    },
  }))
  const edges = (dag.edges || []).map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from, target: e.to,
    type: 'conditionEdge',
    animated: false,
    data: { condition: e.condition || 'null' },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#6C63FF' },
    style: { stroke: '#6C63FF', strokeWidth: 2 },
  }))
  return { nodes, edges }
}

// Flow → DAG
function flowToDag(nodes, edges, meta) {
  return {
    _meta: meta,
    nodes: nodes.map(n => ({
      id:              n.id,
      agent:           n.data.agentType,
      name:            n.data.name || AGENT_LABELS[n.data.agentType] || n.id,
      description:     n.data.description || '',
      prompt_file:     n.data.promptFile || '',
      tools:           n.data.tools || [],
      timeout_seconds: n.data.timeout || 90,
    })),
    edges: edges.map(e => ({
      from: e.source, to: e.target,
      condition: e.data?.condition === 'null' ? null : (e.data?.condition || null),
    })),
    escalation_config: { sla_hours: meta.sla_hours || 4, resume_after_decision: true },
  }
}

// ── Node Edit Panel ────────────────────────────────────────────────────────────
function NodeEditPanel({ node, onSave, onDelete, onClose, allTools, promptFiles }) {
  const [data, setData] = useState({ ...node.data })
  const set = (k, v) => setData(p => ({ ...p, [k]: v }))

  const toggleTool = (t) => {
    const cur = data.tools || []
    set('tools', cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])
  }

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      className="absolute right-0 top-0 bottom-0 w-80 glass-strong border-l border-[rgb(var(--border))] z-20 overflow-y-auto"
    >
      <div className="sticky top-0 glass-strong border-b border-[rgb(var(--border))] px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[rgb(var(--text-primary))]">Configure Node</h3>
        <div className="flex gap-1">
          <Button size="xs" variant="danger" icon={<Trash2 className="w-3 h-3" />} onClick={() => { onDelete(node.id); onClose() }} />
          <Button size="xs" variant="ghost" onClick={onClose} icon={<X className="w-3 h-3" />} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Select
          label="Agent Type"
          value={data.agentType || ''}
          onChange={e => set('agentType', e.target.value)}
          options={AGENT_TYPES.map(a => ({ value: a.type, label: `${AGENT_ICONS[a.type] || '🤖'} ${AGENT_LABELS[a.type] || a.type}` }))}
        />
        <Input label="Node ID (snake_case)" value={data.id || ''} onChange={e => set('id', e.target.value.replace(/\s/g,'_').toLowerCase())} />
        <Input label="Display Name" value={data.name || ''} onChange={e => set('name', e.target.value)} />
        <Textarea label="Description" value={data.description || ''} onChange={e => set('description', e.target.value)} rows={2} />

        <div>
          <label className="block text-xs font-medium text-[rgb(var(--text-secondary))] mb-1.5">Prompt File</label>
          {promptFiles.length > 0 ? (
            <select value={data.promptFile || ''} onChange={e => set('promptFile', e.target.value)} className="input-base">
              <option value="">— system default —</option>
              {promptFiles.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
          ) : (
            <Input value={data.promptFile || ''} onChange={e => set('promptFile', e.target.value)} placeholder="saas/research_churn.txt" />
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-[rgb(var(--text-secondary))] mb-2">Tools</p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {allTools.map(t => {
              const on = (data.tools || []).includes(t.name)
              return (
                <button
                  key={t.name}
                  onClick={() => toggleTool(t.name)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] border transition-all font-medium',
                    on
                      ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                      : 'bg-[rgb(var(--bg-hover))] border-[rgb(var(--border))] text-[rgb(var(--text-muted))] hover:border-primary-500/30 hover:text-[rgb(var(--text-primary))]',
                  )}
                  title={t.description}
                >{t.name}</button>
              )
            })}
          </div>
        </div>

        <Input
          label="Timeout (seconds)"
          type="number"
          value={data.timeout || 90}
          onChange={e => set('timeout', parseInt(e.target.value))}
        />

        <Button
          variant="gradient"
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

// ── Agent Palette Sidebar ──────────────────────────────────────────────────────
function AgentPalette({ onDragStart }) {
  const [search, setSearch] = useState('')
  const filtered = AGENT_TYPES.filter(a =>
    !search || AGENT_LABELS[a.type]?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="w-56 flex-shrink-0 glass-strong border-r border-[rgb(var(--border))] flex flex-col">
      <div className="px-3 py-3 border-b border-[rgb(var(--border))]">
        <p className="text-xs font-bold text-[rgb(var(--text-primary))] mb-2">Agent Types</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgb(var(--text-muted))]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="input-base !py-1.5 !pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(({ type, color, light }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-card))] hover:border-primary-500/40 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm group"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ background: `${color}18` }}>
              {(() => { const Icon = AGENT_ICONS[type]; return <Icon className="w-5 h-5" />; })()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[rgb(var(--text-primary))] truncate">{AGENT_LABELS[type] || type}</p>
              <p className="text-[10px] text-[rgb(var(--text-muted))] truncate">{AGENT_DESCRIPTIONS[type]?.slice(0,30)}…</p>
            </div>
            <GripVertical className="w-3.5 h-3.5 text-[rgb(var(--text-muted))] opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0" />
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-[rgb(var(--border))] text-[10px] text-[rgb(var(--text-muted))] text-center">
        Drag agents onto canvas
      </div>
    </div>
  )
}

// ── Flow Canvas ───────────────────────────────────────────────────────────────
function FlowCanvas({ workflowName, dag, allTools, promptFiles, onSave, isSaving }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [editingNode, setEditingNode]    = useState(null)
  const [editingEdge, setEditingEdge]    = useState(null)
  const [view, setView]                  = useState('canvas') // canvas | json
  const [rawJson, setRawJson]            = useState('')
  const [jsonErr, setJsonErr]            = useState('')
  const { isDark }                       = useTheme()
  const { setDirty }                     = useBuilderStore()
  const rfWrapper                        = useRef(null)
  const [rfInstance, setRfInstance]      = useState(null)

  // Meta state
  const [meta, setMeta] = useState({
    workflow_id: workflowName,
    name: workflowName?.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
    industry: 'saas',
    version: '1.0.0',
    description: '',
    trigger_types: ['manual'],
    sla_hours: 4,
  })

  useEffect(() => {
    if (!dag) return
    const { nodes: n, edges: e } = dagToFlow(dag)
    setNodes(n); setEdges(e)
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
    const nodeId = `${type.replace('_agent','')}_${Date.now().toString(36)}`
    setNodes(ns => [...ns, {
      id: nodeId, type: 'agentNode', position: pos,
      data: { id: nodeId, agentType: type, name: AGENT_LABELS[type] || type, tools: [], promptFile: '', description: '' },
    }])
    setDirty(true)
  }, [rfInstance, setNodes, setDirty])

  const onDragStart = (e, agentType) => e.dataTransfer.setData('agentType', agentType)

  const handleSave = () => {
    const currentDag = flowToDag(nodes, edges, meta)
    onSave(currentDag)
    setDirty(false)
  }

  const handleNodeSave = (nodeId, newData) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: newData } : n))
    setDirty(true)
  }

  const handleNodeDelete = (nodeId) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId))
    setDirty(true)
  }

  const autoLayout = () => {
    const ordered = [...nodes]
    ordered.forEach((n, i) => {
      n.position = { x: i * 260, y: 100 }
    })
    setNodes([...ordered])
  }

  return (
    <div className="flex h-full relative">
      {/* Agent palette */}
      <AgentPalette onDragStart={onDragStart} />

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgb(var(--border))] bg-[rgb(var(--bg-surface))]/80 backdrop-blur-sm gap-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-[rgb(var(--bg-base))] rounded-xl p-1 gap-0.5">
              {[['canvas', LayoutGrid], ['json', Code2]].map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => {
                    if (v === 'json') setRawJson(JSON.stringify(flowToDag(nodes, edges, meta), null, 2))
                    setView(v)
                  }}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', view === v ? 'bg-[rgb(var(--bg-card))] text-[rgb(var(--text-primary))] shadow-sm' : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]')}
                >
                  <Icon className="w-3.5 h-3.5" />{v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
            <Button size="xs" variant="ghost" onClick={autoLayout} icon={<FlipHorizontal className="w-3 h-3" />}>Auto-layout</Button>
            <Button size="xs" variant="ghost" onClick={() => setNodes([])} icon={<RotateCcw className="w-3 h-3" />}>Clear</Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[rgb(var(--text-muted))]">{nodes.length} nodes · {edges.length} edges</span>
            <Button size="sm" variant="gradient" loading={isSaving} onClick={handleSave} icon={<Save className="w-3.5 h-3.5" />}>
              Save Workflow
            </Button>
          </div>
        </div>

        {/* Flow / JSON */}
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
              onEdgeClick={(_, edge) => setEditingEdge(edge)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode="Delete"
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.2}
                color={isDark ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.2)'}
              />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) => {
                  const ac = AGENT_TYPES.find(a => a.type === n.data?.agentType)
                  return ac?.color || '#6C63FF'
                }}
                maskColor={isDark ? 'rgba(8,11,20,0.7)' : 'rgba(241,245,254,0.7)'}
              />
              <Panel position="bottom-center">
                <div className="text-[10px] text-[rgb(var(--text-muted))] bg-[rgb(var(--bg-elevated))]/90 px-3 py-1.5 rounded-full border border-[rgb(var(--border))]">
                  Drag agents from sidebar · Click to edit · Delete key to remove
                </div>
              </Panel>
            </ReactFlow>
          ) : (
            <div className="h-full p-4">
              {jsonErr && <div className="text-xs text-danger mb-2">{jsonErr}</div>}
              <textarea
                value={rawJson}
                onChange={e => {
                  setRawJson(e.target.value)
                  try {
                    const d = JSON.parse(e.target.value)
                    const { nodes: n, edges: eg } = dagToFlow(d)
                    setNodes(n); setEdges(eg)
                    setJsonErr('')
                    setDirty(true)
                  } catch { setJsonErr('Invalid JSON') }
                }}
                spellCheck={false}
                className="w-full h-full input-base font-mono text-xs !rounded-xl resize-none !py-4 text-success"
              />
            </div>
          )}

          {/* Node edit panel */}
          <AnimatePresence>
            {editingNode && (
              <NodeEditPanel
                node={editingNode}
                onSave={handleNodeSave}
                onDelete={handleNodeDelete}
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

// ── Main WorkflowBuilder ───────────────────────────────────────────────────────
export default function WorkflowBuilder() {
  const navigate          = useNavigate()
  const { api }           = useAuth()
  const [workflows, setWorkflows] = useState([])
  const [selected, setSelected]   = useState(null)
  const [dag, setDag]             = useState(null)
  const [allTools, setAllTools]   = useState([])
  const [promptFiles, setPromptFiles] = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Create form
  const [newName, setNewName]     = useState('')
  const [newIndustry, setNewIndustry] = useState('saas')

  const load = useCallback(async () => {
    try {
      const [wfs, tools, ptree] = await Promise.all([
        api.get('/config/workflows'),
        api.get('/tools/available').catch(() => ({ local_dev: [], utility: [], custom_rest: [] })),
        api.get('/config/prompt-tree').catch(() => ({ files: [] })),
      ])
      setWorkflows(Array.isArray(wfs) ? wfs : [])
      setAllTools([...(tools.local_dev||[]), ...(tools.utility||[]), ...(tools.custom_rest||[])])
      setPromptFiles(ptree.files || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const selectWorkflow = async (name) => {
    try {
      const d = await api.get(`/config/dag/${name}`)
      setSelected(name); setDag(d)
    } catch (e) { setError(e.message) }
  }

  const handleSave = async (dagData) => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await api.put(`/config/dag/${selected}`, { name: selected, dag: dagData })
      setSuccess('Workflow saved!')
      await load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const createWorkflow = async () => {
    const safe = newName.trim().replace(/\s+/g,'_').toLowerCase()
    if (!safe) return
    const newDag = {
      _meta: { workflow_id: safe, name: newName, industry: newIndustry, version: '1.0.0', description: '', trigger_types: ['manual'] },
      nodes: [], edges: [], escalation_config: { sla_hours: 4, resume_after_decision: true },
    }
    try {
      await api.post('/config/dag', { name: safe, dag: newDag })
      await load(); await selectWorkflow(safe)
      setShowCreate(false); setNewName('')
    } catch (e) { setError(e.message) }
  }

  const deleteWorkflow = async (name, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${name}"?`)) return
    try {
      await api.delete(`/config/dag/${name}`)
      if (selected === name) { setSelected(null); setDag(null) }
      await load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  // Hide complex builder UI on mobile — field agents use Inbox/Dashboard only
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    return (
      <div className="flex items-center justify-center h-64 text-center p-8">
        <div>
          <div className="text-4xl mb-3">🖥️</div>
          <p className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-1">Desktop required</p>
          <p className="text-xs text-[rgb(var(--text-muted))]">The Workflow Builder requires a larger screen. Use the Dashboard and Email Queue on mobile.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-var(--nav-height)-80px)] flex flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--text-primary))]">Workflow Builder</h1>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">Visual DAG editor — drag, connect, configure agents</p>
        </div>
        {error   && <Alert type="error"   onClose={() => setError('')}   className="max-w-xs">{error}</Alert>}
        {success && <Alert type="success" onClose={() => setSuccess('')} className="max-w-xs">{success}</Alert>}
      </div>

      {/* Main area */}
      <div className="flex-1 flex surface-card rounded-2xl overflow-hidden min-h-0">
        {/* Workflow sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-[rgb(var(--border))] flex flex-col">
          <div className="flex items-center justify-between px-3 py-3 border-b border-[rgb(var(--border))]">
            <p className="text-xs font-bold text-[rgb(var(--text-primary))]">Workflows</p>
            <Button size="xs" variant="primary" onClick={() => setShowCreate(true)} icon={<Plus className="w-3 h-3" />} />
          </div>
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5">
            {workflows.length === 0 && (
              <EmptyState icon={GitBranch} title="No workflows" description="Create your first" />
            )}
            {workflows.map(w => (
              <div
                key={w.name}
                onClick={() => selectWorkflow(w.name)}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all mb-0.5',
                  selected === w.name
                    ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                    : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--bg-hover))] hover:text-[rgb(var(--text-primary))]',
                )}
              >
                <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{w.display_name || w.name}</p>
                  <p className="text-[10px] text-[rgb(var(--text-muted))] font-mono truncate">{w.name}</p>
                </div>
                <button
                  onClick={e => deleteWorkflow(w.name, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-danger"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 min-h-0">
          {selected && dag ? (
            <ReactFlowProvider>
              <FlowCanvas
                workflowName={selected}
                dag={dag}
                allTools={allTools}
                promptFiles={promptFiles}
                onSave={handleSave}
                isSaving={saving}
              />
            </ReactFlowProvider>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-primary/10 border border-primary-500/20 flex items-center justify-center mx-auto mb-4 animate-float">
                  <GitBranch className="w-8 h-8 text-primary-400" />
                </div>
                <p className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-1">Select a workflow</p>
                <p className="text-xs text-[rgb(var(--text-muted))] mb-4">Choose from the sidebar or create a new one</p>
                <Button variant="gradient" onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>
                  Create Workflow
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Workflow" width="max-w-sm">
        <div className="space-y-4">
          <Input
            label="Workflow Name (snake_case)"
            value={newName}
            onChange={e => setNewName(e.target.value.replace(/\s+/g,'_').toLowerCase())}
            placeholder="saas_churn_prevention"
            hint="Becomes the file name and workflow ID"
          />
          <Select
            label="Industry"
            value={newIndustry}
            onChange={e => setNewIndustry(e.target.value)}
            options={INDUSTRIES.map(i => ({ value: i, label: i.toUpperCase() }))}
          />
          <div className="flex gap-2">
            <Button variant="gradient" className="flex-1" onClick={createWorkflow} disabled={!newName.trim()}>
              Create Workflow
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}