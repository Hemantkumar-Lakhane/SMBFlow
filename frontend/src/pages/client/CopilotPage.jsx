// frontend/src/pages/client/CopilotPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Pixel-perfect n8n-styled AI Workflow Assistant
// Matches n8n cloud AI Assistant UI:
//   • Centered "What do you want to automate?" hero layout
//   • Clean, un-prefilled prompt box with realistic multi-line placeholder
//   • Hover-reactive category pills (Process invoices, Score my leads, Schedule social posts, Telegram agent)
//   • Dynamic live SVG Canvas Node Graph responding instantly on pill hover & selection
//   • Full Conversational Execution Mode with n8n Node Inspection Drawers
//   • Clean professional styling with no gratuitous emojis or jargon
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Send, Zap, Bot, ArrowRight, Play, CheckCircle2,
  Clock, ChevronDown, ChevronRight, Inbox, ShieldAlert,
  BarChart3, Rocket, RefreshCw, Cpu, Layers, HelpCircle,
  ArrowUpRight, Check, Copy, Plus, Mic, ArrowUp, FileText,
  Calendar, Database, MessageSquare, Mail, Share2, CornerDownRight,
  Sliders, ArrowLeft
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Pre-configured n8n Workflow Templates ─────────────────────────────────────
const TEMPLATES = [
  {
    id: 'invoices',
    label: 'Process invoices',
    icon: FileText,
    accentColor: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    prompt:
      'Every morning, scan Gmail for new invoices, use Claude to extract details and cross-check them against purchase orders in Google Sheets, flag any discrepancies for review, and add all payment due dates to Google Calendar automatically.',
    nodes: [
      { id: '1', title: 'INVOICE RECEIVED', subtitle: 'Trigger: 08:00 AM Daily', brand: 'Gmail', icon: Mail, color: '#EA4335', x: 40, y: 110 },
      { id: '2', title: 'Fetch attachment', subtitle: 'Gmail API', brand: 'Gmail', icon: Inbox, color: '#EA4335', x: 230, y: 110 },
      { id: '3', title: 'Extract invoice data', subtitle: 'Claude 3.5 Sonnet', brand: 'Claude', icon: Cpu, color: '#D97706', x: 420, y: 110 },
      { id: '4', title: 'Check discrepancy', subtitle: 'Switch Node', brand: 'Switch', icon: Sliders, color: '#10B981', x: 610, y: 110 },
      { id: '5', title: 'Flag Invoice', subtitle: 'Google Sheets', brand: 'Sheets', icon: Database, color: '#0F9D58', x: 800, y: 50 },
      { id: '6', title: 'Add to Calendar', subtitle: 'Google Calendar', brand: 'Calendar', icon: Calendar, color: '#4285F4', x: 800, y: 170 },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Discrepancy' },
      { from: '4', to: '6', label: 'Approved' },
    ],
  },
  {
    id: 'leads',
    label: 'Score my leads',
    icon: Sparkles,
    accentColor: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    prompt:
      'When a new lead submits our website contact form, enrich company data with Clearbit, score conversion intent with GPT-4o, automatically update HubSpot CRM, and alert our sales team in Slack if the score is above 80.',
    nodes: [
      { id: '1', title: 'Lead Form Submit', subtitle: 'Webhook Trigger', brand: 'Webhook', icon: Zap, color: '#8B5CF6', x: 40, y: 110 },
      { id: '2', title: 'Company Intelligence', subtitle: 'Enrich data', brand: 'Clearbit', icon: Database, color: '#3B82F6', x: 230, y: 110 },
      { id: '3', title: 'Intent Scoring', subtitle: 'GPT-4o Mini', brand: 'OpenAI', icon: Cpu, color: '#10B981', x: 420, y: 110 },
      { id: '4', title: 'Score Filter', subtitle: 'Score > 80?', brand: 'Filter', icon: Sliders, color: '#F59E0B', x: 610, y: 110 },
      { id: '5', title: 'Update CRM Contact', subtitle: 'HubSpot', brand: 'HubSpot', icon: Inbox, color: '#FF7A59', x: 800, y: 50 },
      { id: '6', title: 'Sales VIP Alert', subtitle: 'Slack Channel', brand: 'Slack', icon: MessageSquare, color: '#EC4899', x: 800, y: 170 },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5' },
      { from: '4', to: '6', label: 'VIP Lead' },
    ],
  },
  {
    id: 'social',
    label: 'Schedule social posts',
    icon: Calendar,
    accentColor: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
    prompt:
      'Extract new article drafts from our CMS, use Claude to generate tailored promotional posts for LinkedIn and Twitter/X, create custom high-res banner graphics with ImageRouter, and stage them for human review in Action Center.',
    nodes: [
      { id: '1', title: 'New Article Draft', subtitle: 'CMS Webhook', brand: 'CMS', icon: FileText, color: '#6366F1', x: 40, y: 110 },
      { id: '2', title: 'Multi-Channel Copy', subtitle: 'Claude 3.5 Sonnet', brand: 'Claude', icon: Cpu, color: '#D97706', x: 230, y: 110 },
      { id: '3', title: 'Visual Generator', subtitle: 'ImageRouter AI', brand: 'ImageRouter', icon: Sparkles, color: '#EC4899', x: 420, y: 110 },
      { id: '4', title: 'Action Center HITL', subtitle: 'Human Approval', brand: 'SMBFlow', icon: ShieldAlert, color: '#F59E0B', x: 610, y: 110 },
      { id: '5', title: 'LinkedIn Post', subtitle: 'Buffer / API', brand: 'LinkedIn', icon: Share2, color: '#0077B5', x: 800, y: 50 },
      { id: '6', title: 'Twitter/X Post', subtitle: 'X API v2', brand: 'Twitter', icon: Share2, color: '#1DA1F2', x: 800, y: 170 },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Approved' },
      { from: '4', to: '6', label: 'Approved' },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram support agent',
    icon: MessageSquare,
    accentColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    prompt:
      'Listen for incoming customer queries on Telegram, search our company knowledge base in PostgreSQL vector embeddings, generate accurate support answers with Gemini 1.5, and escalate any refund tickets directly to human operators.',
    nodes: [
      { id: '1', title: 'New Message', subtitle: 'Telegram Bot API', brand: 'Telegram', icon: MessageSquare, color: '#229ED9', x: 40, y: 110 },
      { id: '2', title: 'Vector Search', subtitle: 'PGVector KB', brand: 'PostgreSQL', icon: Database, color: '#336791', x: 230, y: 110 },
      { id: '3', title: 'Draft Solution', subtitle: 'Gemini 1.5 Pro', brand: 'Gemini', icon: Cpu, color: '#4285F4', x: 420, y: 110 },
      { id: '4', title: 'Intent Classifier', subtitle: 'Refund Check', brand: 'Classifier', icon: Sliders, color: '#10B981', x: 610, y: 110 },
      { id: '5', title: 'Instant Reply', subtitle: 'Send to Customer', brand: 'Telegram', icon: Send, color: '#229ED9', x: 800, y: 50 },
      { id: '6', title: 'Human Escalation', subtitle: 'Action Center', brand: 'SMBFlow', icon: ShieldAlert, color: '#EF4444', x: 800, y: 170 },
    ],
    edges: [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
      { from: '3', to: '4' },
      { from: '4', to: '5', label: 'Standard' },
      { from: '4', to: '6', label: 'Refund' },
    ],
  },
]

// ── Interactive n8n Canvas Node Graph Component ───────────────────────────────
function N8nCanvasPreview({ template }) {
  const nodeWidth = 145
  const nodeHeight = 54

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 bg-[#0e1117] rounded-2xl border border-slate-800/90 shadow-2xl overflow-hidden relative transition-all">
      {/* Background Dot Grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/60 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono text-slate-300 font-medium">
            Pipeline Preview: <span className="text-purple-300 font-semibold">{template.label}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300">Auto-routed</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300">Autonomous</span>
        </div>
      </div>

      {/* SVG Canvas Graph */}
      <div className="p-4 sm:p-6 overflow-x-auto min-h-[260px] flex items-center justify-center relative">
        <svg className="w-[960px] h-[230px] overflow-visible">
          {/* Edge Connectors */}
          {template.edges.map((edge, idx) => {
            const fromNode = template.nodes.find(n => n.id === edge.from)
            const toNode = template.nodes.find(n => n.id === edge.to)
            if (!fromNode || !toNode) return null

            const startX = fromNode.x + nodeWidth
            const startY = fromNode.y + nodeHeight / 2
            const endX = toNode.x
            const endY = toNode.y + nodeHeight / 2
            const midX = (startX + endX) / 2

            const pathData = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`

            return (
              <g key={idx}>
                {/* Glow Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="3"
                  strokeOpacity="0.2"
                />
                {/* Main Connector Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
                {/* Animated Flow Pulse */}
                <circle r="3" fill="#a78bfa">
                  <animateMotion
                    path={pathData}
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Edge Label */}
                {edge.label && (
                  <text
                    x={midX}
                    y={(startY + endY) / 2 - 6}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {template.nodes.map((node) => {
            const IconComponent = node.icon || Zap

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer group"
              >
                {/* Node Box */}
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="10"
                  fill="#161b22"
                  stroke="#30363d"
                  strokeWidth="1.5"
                  className="transition-all group-hover:stroke-purple-500 group-hover:fill-slate-900"
                />

                {/* Left Colored Accent Bar */}
                <rect
                  x="0"
                  y="0"
                  width="4"
                  height={nodeHeight}
                  rx="2"
                  fill={node.color}
                />

                {/* Icon Container */}
                <g transform="translate(10, 14)">
                  <rect
                    width="26"
                    height="26"
                    rx="6"
                    fill={node.color}
                    fillOpacity="0.2"
                  />
                  <foreignObject width="26" height="26">
                    <div className="w-full h-full flex items-center justify-center" style={{ color: node.color }}>
                      <IconComponent size={14} />
                    </div>
                  </foreignObject>
                </g>

                {/* Text Content */}
                <text
                  x="42"
                  y="24"
                  fill="#f1f5f9"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {node.title.length > 14 ? node.title.slice(0, 13) + '…' : node.title}
                </text>
                <text
                  x="42"
                  y="39"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {node.subtitle.length > 16 ? node.subtitle.slice(0, 15) + '…' : node.subtitle}
                </text>

                {/* Green Status Check Badge */}
                <circle cx={nodeWidth - 10} cy="12" r="4" fill="#10b981" />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Node Execution Drawer (Conversation View) ─────────────────────────────────
function NodeExecutionPipeline({ nodes }) {
  const [expandedNodeId, setExpandedNodeId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  if (!nodes || nodes.length === 0) return null

  function handleCopy(id, data) {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="my-3 p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-md">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800 text-xs font-semibold text-slate-300">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="tracking-wide uppercase text-[11px] text-slate-400 font-mono">Execution Pipeline</span>
        </div>
        <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
          {nodes.length} Nodes Executed · Success
        </span>
      </div>

      <div className="space-y-2">
        {nodes.map((node, idx) => {
          const isExpanded = expandedNodeId === node.id
          const hasData = node.input_data || node.output_data

          return (
            <div key={node.id || idx} className="rounded-lg border border-slate-800 bg-slate-950/70 overflow-hidden transition-all">
              <div
                onClick={() => hasData && setExpandedNodeId(isExpanded ? null : node.id)}
                className={`flex items-center justify-between p-2.5 ${hasData ? 'cursor-pointer hover:bg-slate-800/40' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{node.name}</p>
                    <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">{node.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {node.duration_ms}ms
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                    <CheckCircle2 className="w-2.5 h-2.5" /> OK
                  </span>
                  {hasData && (
                    <button type="button" className="text-slate-400 hover:text-slate-200">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && hasData && (
                <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] font-mono text-slate-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {node.input_data && (
                      <div className="bg-slate-900/90 rounded p-2 border border-slate-800/80">
                        <div className="flex justify-between items-center mb-1 text-[10px] text-slate-400 font-bold uppercase">
                          <span>Input Payload</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(`in_${node.id}`, node.input_data) }}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            {copiedId === `in_${node.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto max-h-32 text-[10px] text-slate-300">
                          {JSON.stringify(node.input_data, null, 2)}
                        </pre>
                      </div>
                    )}

                    {node.output_data && (
                      <div className="bg-slate-900/90 rounded p-2 border border-slate-800/80">
                        <div className="flex justify-between items-center mb-1 text-[10px] text-slate-400 font-bold uppercase">
                          <span>Output Result</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(`out_${node.id}`, node.output_data) }}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            {copiedId === `out_${node.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto max-h-32 text-[10px] text-emerald-300">
                          {JSON.stringify(node.output_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Copilot / Assistant Page Component ───────────────────────────────────
export default function CopilotPage() {
  const navigate = useNavigate()
  const { user, api } = useAuth()

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0])
  const [hoveredTemplate, setHoveredTemplate] = useState(null)
  const [promptText, setPromptText] = useState('') // Clean un-prefilled text
  const [hasStartedConversation, setHasStartedConversation] = useState(false)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState(null)

  const activeDisplayTemplate = hoveredTemplate || selectedTemplate
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    api.get('/copilot/insights')
      .then(res => setInsights(res))
      .catch(() => {})
  }, [api])

  function handleSelectTemplate(tpl) {
    setSelectedTemplate(tpl)
    setPromptText(tpl.prompt)
  }

  async function handleSend(customText) {
    const query = (customText || promptText).trim()
    if (!query || loading) return

    setHasStartedConversation(true)

    const userMsg = {
      id: String(Date.now()),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const currentHistory = messages.length === 0 ? [] : messages
    setMessages([...currentHistory, userMsg])
    setPromptText('')
    setLoading(true)

    try {
      const payload = {
        messages: [...currentHistory, userMsg].map(m => ({ role: m.role, content: m.content })),
      }

      const res = await api.post('/copilot/chat', payload)

      const assistantMsg = {
        id: res.message_id || String(Date.now() + 1),
        role: 'assistant',
        content: res.reply || 'Workflow task synthesized successfully.',
        execution_nodes: res.execution_nodes || [],
        action_cta: res.action_cta || null,
        suggested_followups: res.suggested_followups || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `I encountered an issue connecting to the workflow execution engine: ${err?.message || 'Network error'}. You can still navigate directly to your workflows from the sidebar.`,
        execution_nodes: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#0d0f14] text-slate-100 overflow-hidden font-sans">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-[#12161f] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {hasStartedConversation && (
            <button
              onClick={() => {
                setHasStartedConversation(false)
                setMessages([])
                setPromptText('')
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="New Automation Canvas"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>AI Assistant</span>
            </span>
            <span className="text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-mono">
              Preview
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Active Runs: {insights?.active_runs ?? 0}</span>
          </div>

          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg font-semibold transition-all shadow-xs cursor-pointer"
          >
            <span>Workflows</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Main Canvas / Conversation Area ─────────────────────────────────── */}
      {!hasStartedConversation ? (
        /* ── HERO VIEW: EXACT N8N DESIGN ───────────────────────────────────── */
        <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 flex flex-col items-center justify-start">
          {/* Centered Heading */}
          <div className="flex items-center gap-2 text-xl md:text-2xl font-bold text-white mb-6">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2>What do you want to automate?</h2>
          </div>

          {/* Clean Prompt Card with Purple Focus Glow and Realistic Placeholder */}
          <div className="w-full max-w-4xl bg-[#161b22] border-2 border-purple-500/60 hover:border-purple-500 rounded-2xl p-4 shadow-2xl transition-all relative">
            <textarea
              rows={4}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Every morning, scan Gmail for new invoices, use Claude to extract details and cross-check them against purchase orders in Google Sheets, flag any discrepancies for review, and add all payment due dates to Google Calendar automatically."
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm md:text-base leading-relaxed resize-none focus:outline-hidden"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />

            {/* Bottom Tools inside Prompt Box */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-2">
              <button
                type="button"
                className="w-7 h-7 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Add context"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                  title="Voice input"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSend(promptText || TEMPLATES[0].prompt)}
                  className="w-8 h-8 rounded-lg bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-orange-600/30"
                  title="Run Automation"
                >
                  <ArrowUp className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Category Pill Buttons with Real-time Hover Pipeline Switch */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-4xl">
            {TEMPLATES.map((tpl) => {
              const IconComp = tpl.icon
              const isSelected = activeDisplayTemplate.id === tpl.id

              return (
                <button
                  key={tpl.id}
                  onMouseEnter={() => setHoveredTemplate(tpl)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? tpl.accentColor
                      : 'border-slate-800 bg-[#161b22] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{tpl.label}</span>
                </button>
              )
            })}

            <button
              onClick={() => navigate('/workflow-library')}
              className="text-xs text-slate-400 hover:text-purple-400 font-medium ml-1 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>See all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Interactive Live n8n Canvas Node Graph Preview */}
          <N8nCanvasPreview template={activeDisplayTemplate} />
        </div>
      ) : (
        /* ── CONVERSATION & EXECUTION VIEW ─────────────────────────────────── */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'

              return (
                <div key={msg.id} className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] md:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-xs shadow-md'
                          : 'bg-[#161b22] border border-slate-800 text-slate-100 rounded-tl-xs shadow-md'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-normal">
                        {msg.content.split('\n').map((line, lIdx) => {
                          if (line.startsWith('### ')) {
                            return <h3 key={lIdx} className="text-base font-bold text-white my-1">{line.replace('### ', '')}</h3>
                          }
                          return <p key={lIdx} className={line === '' ? 'h-2' : ''}>{line}</p>
                        })}
                      </div>

                      {/* n8n Visual Execution Pipeline Nodes */}
                      {!isUser && msg.execution_nodes && msg.execution_nodes.length > 0 && (
                        <NodeExecutionPipeline nodes={msg.execution_nodes} />
                      )}

                      {/* Interactive Action CTA */}
                      {!isUser && msg.action_cta && (
                        <div className="mt-3 pt-3 border-t border-slate-800">
                          <button
                            onClick={() => navigate(msg.action_cta.to)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{msg.action_cta.label}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={`text-[10px] text-slate-500 mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                      {msg.timestamp}
                    </div>

                    {/* Suggested Followups */}
                    {!isUser && msg.suggested_followups && msg.suggested_followups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {msg.suggested_followups.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => handleSend(sug)}
                            className="text-xs px-3 py-1.5 bg-[#161b22] hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 text-slate-300 hover:text-purple-300 rounded-lg transition-colors cursor-pointer text-left"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold border border-slate-700">
                      {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              )
            })}

            {loading && (
              <div className="flex gap-3.5 justify-start">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="p-4 rounded-2xl bg-[#161b22] border border-slate-800 text-slate-300 rounded-tl-xs shadow-md flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-xs font-medium">Orchestrating workflow nodes & executing pipeline...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Conversation Input Box */}
          <div className="p-4 bg-[#12161f] border-t border-slate-800/80 shrink-0">
            <div className="max-w-4xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-2 bg-[#161b22] border border-slate-800 focus-within:border-purple-500 rounded-2xl p-2 transition-all shadow-inner"
              >
                <input
                  type="text"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Ask AI Assistant to build a workflow, extract data, triage inbox..."
                  disabled={loading}
                  className="flex-1 bg-transparent px-3.5 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={!promptText.trim() || loading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
