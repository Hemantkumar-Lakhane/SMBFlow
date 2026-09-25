// frontend/src/pages/client/CopilotPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Clean, Modern Enterprise AI Assistant & Workflow Orchestrator
// Features:
//   • Centered "What do you want to automate?" hero layout
//   • Clean, un-prefilled prompt box with realistic multi-line placeholder
//   • Real-time Voice / Microphone Input (Web Speech API + Backend Whisper fallback)
//   • Hover-reactive category pills (Process invoices, Score my leads, Schedule social posts, Telegram agent)
//   • Dynamic live SVG Canvas Node Graph with authentic tool brand logos & flow pulses
//   • Smooth full-page vertical scrolling (overflow-y-auto)
//   • Conversational Execution Mode with Node Inspection Drawers
//   • Sleek Enterprise Dark/Light Theme (no saffron/orange, no purple, pure obsidian/slate)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Zap, Bot, ArrowRight, Play, CheckCircle2,
  Clock, ChevronDown, ChevronRight, Inbox, ShieldAlert,
  BarChart3, Rocket, RefreshCw, Cpu, Layers, HelpCircle,
  ArrowUpRight, Check, Copy, Plus, Mic, MicOff, ArrowUp, FileText,
  Calendar, Database, MessageSquare, Mail, Share2, CornerDownRight,
  Sliders, ArrowLeft, Terminal, Server, Square
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Official Tool Vector Brand Icons ──────────────────────────────────────────
function GmailIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6Z" fill="#EA4335" fillOpacity="0.15" />
      <path d="M20 4H4C2.9 4 2 4.9 2 6L12 13L22 6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
      <path d="M2 18V6L12 13L22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18Z" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GoogleSheetsIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58" fillOpacity="0.2" stroke="#0F9D58" strokeWidth="1.5" />
      <path d="M7 8H17M7 12H17M7 16H17M12 8V16" stroke="#0F9D58" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GoogleCalendarIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#4285F4" fillOpacity="0.2" stroke="#4285F4" strokeWidth="1.5" />
      <path d="M16 2V6M8 2V6M3 9H21" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="14" r="1.5" fill="#4285F4" />
    </svg>
  )
}

function ClaudeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 3L11.5 8L15 11.5L9.5 13L8 21L11.5 15.5L16 17L14.5 11L19.5 9.5L13.5 3Z" fill="#D97706" />
    </svg>
  )
}

function OpenAIIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" fill="#10B981" fillOpacity="0.15" />
      <path d="M12 6v12M6 12h12M7.75 7.75l8.5 8.5M7.75 16.25l8.5-8.5" />
    </svg>
  )
}

function SlackIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#EC4899" fillOpacity="0.15" stroke="#EC4899" strokeWidth="1.5" />
      <path d="M8 12H16M12 8V16" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TelegramIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M21.5 3.5L2 11.5L8.5 14.5L18 6.5L11 16.5L17.5 20.5L21.5 3.5Z" fill="#229ED9" fillOpacity="0.2" stroke="#229ED9" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function HubSpotIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5" fill="#FF7A59" fillOpacity="0.2" stroke="#FF7A59" strokeWidth="1.5" />
      <path d="M12 3V7M12 17V21M3 12H7M17 12H21" stroke="#FF7A59" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function WebhookIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="3" fill="#3B82F6" fillOpacity="0.2" />
      <circle cx="18" cy="6" r="3" fill="#3B82F6" fillOpacity="0.2" />
      <circle cx="18" cy="18" r="3" fill="#3B82F6" fillOpacity="0.2" />
      <path d="M9 12H12M12 12L15 6M12 12L15 18" />
    </svg>
  )
}

// ── Workflow Templates ────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'invoices',
    label: 'Process invoices',
    icon: FileText,
    accentColor: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    prompt:
      'Every morning, scan Gmail for new invoices, use Claude to extract details and cross-check them against purchase orders in Google Sheets, flag any discrepancies for review, and add all payment due dates to Google Calendar automatically.',
    nodes: [
      { id: '1', title: 'INVOICE RECEIVED', subtitle: 'Trigger: 08:00 AM Daily', brand: 'Gmail', iconComponent: GmailIcon, color: '#EA4335', x: 40, y: 110 },
      { id: '2', title: 'Fetch attachment', subtitle: 'Gmail API', brand: 'Gmail', iconComponent: GmailIcon, color: '#EA4335', x: 230, y: 110 },
      { id: '3', title: 'Extract invoice data', subtitle: 'Claude 3.5 Sonnet', brand: 'Claude', iconComponent: ClaudeIcon, color: '#D97706', x: 420, y: 110 },
      { id: '4', title: 'Check discrepancy', subtitle: 'Switch Node', brand: 'Switch', iconComponent: Sliders, color: '#10B981', x: 610, y: 110 },
      { id: '5', title: 'Flag Invoice', subtitle: 'Google Sheets', brand: 'Sheets', iconComponent: GoogleSheetsIcon, color: '#0F9D58', x: 800, y: 50 },
      { id: '6', title: 'Add to Calendar', subtitle: 'Google Calendar', brand: 'Calendar', iconComponent: GoogleCalendarIcon, color: '#4285F4', x: 800, y: 170 },
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
    icon: Zap,
    accentColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    prompt:
      'When a new lead submits our website contact form, enrich company data with Clearbit, score conversion intent with GPT-4o, automatically update HubSpot CRM, and alert our sales team in Slack if the score is above 80.',
    nodes: [
      { id: '1', title: 'Lead Form Submit', subtitle: 'Webhook Trigger', brand: 'Webhook', iconComponent: WebhookIcon, color: '#3B82F6', x: 40, y: 110 },
      { id: '2', title: 'Company Intelligence', subtitle: 'Enrich data', brand: 'Clearbit', iconComponent: Database, color: '#3B82F6', x: 230, y: 110 },
      { id: '3', title: 'Intent Scoring', subtitle: 'GPT-4o Mini', brand: 'OpenAI', iconComponent: OpenAIIcon, color: '#10B981', x: 420, y: 110 },
      { id: '4', title: 'Score Filter', subtitle: 'Score > 80?', brand: 'Filter', iconComponent: Sliders, color: '#F59E0B', x: 610, y: 110 },
      { id: '5', title: 'Update CRM Contact', subtitle: 'HubSpot', brand: 'HubSpot', iconComponent: HubSpotIcon, color: '#FF7A59', x: 800, y: 50 },
      { id: '6', title: 'Sales VIP Alert', subtitle: 'Slack Channel', brand: 'Slack', iconComponent: SlackIcon, color: '#EC4899', x: 800, y: 170 },
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
    accentColor: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
    prompt:
      'Extract new article drafts from our CMS, use Claude to generate tailored promotional posts for LinkedIn and Twitter/X, create custom banner graphics with ImageRouter, and stage them for human review in Action Center.',
    nodes: [
      { id: '1', title: 'New Article Draft', subtitle: 'CMS Webhook', brand: 'CMS', iconComponent: FileText, color: '#6366F1', x: 40, y: 110 },
      { id: '2', title: 'Multi-Channel Copy', subtitle: 'Claude 3.5 Sonnet', brand: 'Claude', iconComponent: ClaudeIcon, color: '#D97706', x: 230, y: 110 },
      { id: '3', title: 'Visual Generator', subtitle: 'ImageRouter AI', brand: 'ImageRouter', iconComponent: Zap, color: '#3B82F6', x: 420, y: 110 },
      { id: '4', title: 'Action Center HITL', subtitle: 'Human Approval', brand: 'SMBFlow', iconComponent: ShieldAlert, color: '#F59E0B', x: 610, y: 110 },
      { id: '5', title: 'LinkedIn Post', subtitle: 'Buffer / API', brand: 'LinkedIn', iconComponent: Share2, color: '#0077B5', x: 800, y: 50 },
      { id: '6', title: 'Twitter/X Post', subtitle: 'X API v2', brand: 'Twitter', iconComponent: Share2, color: '#64748B', x: 800, y: 170 },
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
    accentColor: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    prompt:
      'Listen for incoming customer queries on Telegram, search our company knowledge base in PostgreSQL vector embeddings, generate accurate support answers with Gemini, and escalate any refund tickets directly to human operators.',
    nodes: [
      { id: '1', title: 'New Message', subtitle: 'Telegram Bot API', brand: 'Telegram', iconComponent: TelegramIcon, color: '#229ED9', x: 40, y: 110 },
      { id: '2', title: 'Vector Search', subtitle: 'PGVector KB', brand: 'PostgreSQL', iconComponent: Database, color: '#336791', x: 230, y: 110 },
      { id: '3', title: 'Draft Solution', subtitle: 'Gemini 1.5 Pro', brand: 'Gemini', iconComponent: Cpu, color: '#4285F4', x: 420, y: 110 },
      { id: '4', title: 'Intent Classifier', subtitle: 'Refund Check', brand: 'Classifier', iconComponent: Sliders, color: '#10B981', x: 610, y: 110 },
      { id: '5', title: 'Instant Reply', subtitle: 'Send to Customer', brand: 'Telegram', iconComponent: TelegramIcon, color: '#229ED9', x: 800, y: 50 },
      { id: '6', title: 'Human Escalation', subtitle: 'Action Center', brand: 'SMBFlow', iconComponent: ShieldAlert, color: '#EF4444', x: 800, y: 170 },
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

// ── Interactive Canvas Node Graph Component ───────────────────────────────────
function CanvasPreview({ template }) {
  const nodeWidth = 150
  const nodeHeight = 56

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 bg-[#121826] rounded-2xl border border-[#233048] shadow-xl overflow-hidden relative transition-all">
      {/* Background Dot Grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#233048] bg-[#0b0f17]/80 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono text-slate-300 font-medium">
            Pipeline Preview: <span className="text-blue-400 font-semibold">{template.label}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
          <span className="px-1.5 py-0.5 rounded bg-[#182234] border border-[#233048] text-slate-300">Auto-routed</span>
          <span className="px-1.5 py-0.5 rounded bg-[#182234] border border-[#233048] text-slate-300">Autonomous</span>
        </div>
      </div>

      {/* SVG Canvas Graph */}
      <div className="p-4 sm:p-6 overflow-x-auto min-h-[250px] flex items-center justify-center relative">
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
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeOpacity="0.25"
                />
                {/* Main Connector Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
                {/* Animated Flow Pulse */}
                <circle r="3" fill="#38bdf8">
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
            const IconComponent = node.iconComponent || Zap

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
                  fill="#151d2e"
                  stroke="#26354f"
                  strokeWidth="1.5"
                  className="transition-all group-hover:stroke-blue-500 group-hover:fill-[#1b263b]"
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
                    fillOpacity="0.15"
                  />
                  <foreignObject width="26" height="26">
                    <div className="w-full h-full flex items-center justify-center">
                      <IconComponent className="w-4 h-4" />
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
    <div className="my-3 p-3.5 bg-[#0b0f17] text-slate-100 rounded-xl border border-[#233048] shadow-md">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#233048] text-xs font-semibold text-slate-300">
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
            <div key={node.id || idx} className="rounded-lg border border-[#233048] bg-[#121826] overflow-hidden transition-all">
              <div
                onClick={() => hasData && setExpandedNodeId(isExpanded ? null : node.id)}
                className={`flex items-center justify-between p-2.5 ${hasData ? 'cursor-pointer hover:bg-[#182234]' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
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
                <div className="p-3 bg-[#0b0f17] border-t border-[#233048] text-[11px] font-mono text-slate-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {node.input_data && (
                      <div className="bg-[#121826] rounded p-2 border border-[#233048]">
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
                      <div className="bg-[#121826] rounded p-2 border border-[#233048]">
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

  // ── Voice / Speech Recognition State ────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

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

  // Initialize Web Speech API if supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognizer = new SpeechRecognition()
      recognizer.continuous = false
      recognizer.interimResults = true
      recognizer.lang = 'en-US'

      recognizer.onstart = () => {
        setIsListening(true)
        setVoiceNotice('Listening... speak now')
      }

      recognizer.onresult = (event) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript
        }
        if (currentTranscript) {
          setPromptText((prev) => {
            const trimmed = prev.trim()
            return trimmed ? `${trimmed} ${currentTranscript}` : currentTranscript
          })
        }
      }

      recognizer.onerror = (event) => {
        console.warn('Speech recognition event error:', event.error)
        setIsListening(false)
        setVoiceNotice('')
      }

      recognizer.onend = () => {
        setIsListening(false)
        setVoiceNotice('')
      }

      recognitionRef.current = recognizer
    }
  }, [])

  // ── Toggle Voice Recording ──────────────────────────────────────────────────
  async function toggleVoiceInput() {
    if (isListening) {
      // Stop native recognizer
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      // Stop media recorder fallback if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      setIsListening(false)
      setVoiceNotice('')
      return
    }

    // 1. Try Browser Web Speech API first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
        return
      } catch (err) {
        console.warn('Native speech recognition start failed, using audio recorder', err)
      }
    }

    // 2. MediaRecorder + Backend Whisper Fallback
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Microphone access is not supported in this browser.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsListening(false)
        setIsTranscribing(true)
        setVoiceNotice('Transcribing audio...')

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', audioBlob, 'prompt_audio.webm')

        try {
          const res = await api.post('/copilot/transcribe', formData)
          if (res?.text) {
            setPromptText((prev) => (prev ? `${prev} ${res.text}` : res.text))
          }
        } catch (err) {
          console.error('Transcription error:', err)
        } finally {
          setIsTranscribing(false)
          setVoiceNotice('')
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsListening(true)
      setVoiceNotice('Recording audio... click mic again to finish')
    } catch (err) {
      console.error('Microphone permission denied:', err)
      setVoiceNotice('Microphone permission required')
      setTimeout(() => setVoiceNotice(''), 3000)
    }
  }

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
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#0b0f17] text-slate-100 font-sans flex flex-col transition-colors">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-[#233048] bg-[#121826] flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {hasStartedConversation && (
            <button
              onClick={() => {
                setHasStartedConversation(false)
                setMessages([])
                setPromptText('')
              }}
              className="p-1.5 rounded-lg bg-[#182234] hover:bg-[#233048] text-slate-300 transition-colors cursor-pointer"
              title="New Automation Canvas"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-blue-500" />
              <span>AI Assistant</span>
            </span>
            <span className="text-[10px] uppercase font-bold bg-[#182234] text-slate-300 border border-[#233048] px-2 py-0.5 rounded-full font-mono">
              Preview
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#182234] border border-[#233048] text-slate-300 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Active Runs: {insights?.active_runs ?? 0}</span>
          </div>

          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-xs cursor-pointer"
          >
            <span>Workflows</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Main Canvas / Conversation Area ─────────────────────────────────── */}
      {!hasStartedConversation ? (
        /* ── HERO VIEW: CLEAN ENTERPRISE DESIGN ────────────────────────────── */
        <div className="flex-1 px-4 py-8 md:py-12 flex flex-col items-center justify-start max-w-4xl mx-auto w-full pb-16">
          {/* Centered Heading */}
          <div className="flex items-center gap-2.5 text-xl md:text-2xl font-bold text-white mb-6">
            <Terminal className="w-5 h-5 text-blue-500" />
            <h2>What do you want to automate?</h2>
          </div>

          {/* Clean Prompt Card */}
          <div className="w-full bg-[#121826] border border-[#233048] focus-within:border-blue-500/80 rounded-2xl p-4 shadow-xl transition-all relative">
            {voiceNotice && (
              <div className="mb-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-950/60 border border-blue-800/60 text-blue-300 text-xs font-mono animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>{voiceNotice}</span>
                </div>
                {isListening && (
                  <button
                    onClick={toggleVoiceInput}
                    className="text-[10px] text-blue-200 underline hover:text-white"
                  >
                    Finish
                  </button>
                )}
              </div>
            )}

            <textarea
              rows={4}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Tell me what to build or ask a question – add context with +"
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm md:text-base leading-relaxed resize-none focus:outline-hidden"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />

            {/* Bottom Tools inside Prompt Box */}
            <div className="flex items-center justify-between pt-2 border-t border-[#233048] mt-2">
              <button
                type="button"
                className="w-7 h-7 rounded-lg border border-[#233048] bg-[#182234] hover:bg-[#233048] text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Add context"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                {/* Microphone Button with Active Listening Indicator */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-400'
                      : isTranscribing
                      ? 'bg-blue-600 text-white animate-spin'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#182234]'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input (Speak to AI)'}
                >
                  {isListening ? <Square className="w-3.5 h-3.5 fill-white" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSend(promptText || TEMPLATES[0].prompt)}
                  className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-blue-600/30"
                  title="Run Automation"
                >
                  <ArrowUp className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Category Pill Buttons with Real-time Hover Pipeline Switch */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-4xl w-full">
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
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
                      : 'border-[#233048] bg-[#121826] text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{tpl.label}</span>
                </button>
              )
            })}

            <button
              onClick={() => navigate('/workflow-library')}
              className="text-xs text-slate-400 hover:text-blue-400 font-medium ml-1 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>See all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Interactive Live Canvas Node Graph Preview */}
          <CanvasPreview template={activeDisplayTemplate} />
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
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] md:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#182234] border border-[#2e3e5c] text-white rounded-tr-xs shadow-md'
                          : 'bg-[#121826] border border-[#233048] text-slate-100 rounded-tl-xs shadow-md'
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

                      {/* Visual Execution Pipeline Nodes */}
                      {!isUser && msg.execution_nodes && msg.execution_nodes.length > 0 && (
                        <NodeExecutionPipeline nodes={msg.execution_nodes} />
                      )}

                      {/* Interactive Action CTA */}
                      {!isUser && msg.action_cta && (
                        <div className="mt-3 pt-3 border-t border-[#233048]">
                          <button
                            onClick={() => navigate(msg.action_cta.to)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
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
                            className="text-xs px-3 py-1.5 bg-[#121826] hover:bg-[#182234] border border-[#233048] hover:border-blue-500/50 text-slate-300 hover:text-blue-300 rounded-lg transition-colors cursor-pointer text-left"
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
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="p-4 rounded-2xl bg-[#121826] border border-[#233048] text-slate-300 rounded-tl-xs shadow-md flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-xs font-medium">Orchestrating workflow nodes & executing pipeline...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Conversation Input Box */}
          <div className="p-4 bg-[#121826] border-t border-[#233048] shrink-0">
            <div className="max-w-4xl mx-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-2 bg-[#0b0f17] border border-[#233048] focus-within:border-blue-500 rounded-2xl p-2 transition-all shadow-inner"
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
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`p-2 rounded-xl transition-colors ${
                    isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Voice input"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={!promptText.trim() || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
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
