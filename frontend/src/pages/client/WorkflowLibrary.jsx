// frontend/src/pages/client/WorkflowLibrary.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Clean, Modern Enterprise Workflow Template Directory
// Features:
//   • Full persistent Light & Dark mode support
//   • Official tool logos loaded directly from /assets/tools/
//   • Filter by tech stack and business category
//   • Clean, professional cards without rainbow gradients or vibe-coded sparkles
//   • Interactive Node Inspection & 1-Click execution modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, ArrowRight, Play, Search,
  Layers, CheckCircle2, Lock, Send,
  Cpu, Database, Calendar, Share2,
  ChevronDown, ChevronUp, Check, Shield, FileText, ArrowUpRight,
  Filter, HelpCircle, X, Terminal, Server
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

// ── Tool Logo with Image Asset Support & Clean Vector Fallback ────────────────
function ToolLogo({ name, className = 'w-4 h-4' }) {
  const [imgSrc, setImgSrc] = useState(() => {
    if (!name) return null
    if (name === 'sheets' || name === 'sheet') return '/assets/tools/sheet.png'
    return `/assets/tools/${name}.png`
  })
  const [useFallback, setUseFallback] = useState(false)

  const svgFallbacks = {
    gmail: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6Z" fill="#EA4335" fillOpacity="0.15" />
        <path d="M20 4H4C2.9 4 2 4.9 2 6L12 13L22 6C22 4.9 21.1 4 20 4Z" fill="#EA4335" />
        <path d="M2 18V6L12 13L22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18Z" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    sheets: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58" fillOpacity="0.2" stroke="#0F9D58" strokeWidth="1.5" />
        <path d="M7 8H17M7 12H17M7 16H17M12 8V16" stroke="#0F9D58" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    sheet: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0F9D58" fillOpacity="0.2" stroke="#0F9D58" strokeWidth="1.5" />
        <path d="M7 8H17M7 12H17M7 16H17M12 8V16" stroke="#0F9D58" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3" fill="#4285F4" fillOpacity="0.2" stroke="#4285F4" strokeWidth="1.5" />
        <path d="M16 2V6M8 2V6M3 9H21" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="14" r="1.5" fill="#4285F4" />
      </svg>
    ),
    claude: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 3L11.5 8L15 11.5L9.5 13L8 21L11.5 15.5L16 17L14.5 11L19.5 9.5L13.5 3Z" fill="#D97706" />
      </svg>
    ),
    openai: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" fill="#10B981" fillOpacity="0.15" />
        <path d="M12 6v12M6 12h12M7.75 7.75l8.5 8.5M7.75 16.25l8.5-8.5" />
      </svg>
    ),
    slack: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="#EC4899" fillOpacity="0.15" stroke="#EC4899" strokeWidth="1.5" />
        <path d="M8 12H16M12 8V16" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    telegram: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M21.5 3.5L2 11.5L8.5 14.5L18 6.5L11 16.5L17.5 20.5L21.5 3.5Z" fill="#229ED9" fillOpacity="0.2" stroke="#229ED9" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    hubspot: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="5" fill="#FF7A59" fillOpacity="0.2" stroke="#FF7A59" strokeWidth="1.5" />
        <path d="M12 3V7M12 17V21M3 12H7M17 12H21" stroke="#FF7A59" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    postgres: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#336791" strokeWidth="1.5">
        <ellipse cx="12" cy="5" rx="9" ry="3" fill="#336791" fillOpacity="0.2" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    webhook: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <circle cx="18" cy="6" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <circle cx="18" cy="18" r="3" fill="#3B82F6" fillOpacity="0.2" />
        <path d="M9 12H12M12 12L15 6M12 12L15 18" />
      </svg>
    ),
  }

  function handleError() {
    if (imgSrc === '/assets/tools/sheets.png') {
      setImgSrc('/assets/tools/sheet.png')
    } else if (imgSrc === '/assets/tools/sheet.png') {
      setImgSrc('/assets/tools/sheets.png')
    } else {
      setUseFallback(true)
    }
  }

  if (!useFallback && imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={name}
        className={`${className} object-contain`}
        onError={handleError}
      />
    )
  }

  return svgFallbacks[name] || <Terminal className={className} />
}

// ── App Ecosystem Registry ───────────────────────────────────────────────────
const TECH_STACK_APPS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'claude', name: 'Claude' },
  { id: 'gmail', name: 'Gmail' },
  { id: 'slack', name: 'Slack' },
  { id: 'hubspot', name: 'HubSpot' },
  { id: 'sheet', name: 'Google Sheets' },
  { id: 'calendar', name: 'Google Calendar' },
  { id: 'telegram', name: 'Telegram' },
  { id: 'postgres', name: 'PostgreSQL' },
]

// ── Curated Template Catalog ──────────────────────────────────────────────────
const CURATED_TEMPLATES = [
  {
    id: 'email_summarizer',
    name: 'email_summarizer',
    display_name: 'AI Inbox Triage & Email Summarizer',
    title: 'Scan incoming emails, extract action items with Claude, and draft auto-replies',
    category: 'AI & LLMs',
    category_group: 'featured',
    description: 'Autonomous inbox pipeline that fetches unread emails, summarizes threads, scores urgency, and stages replies in Action Center.',
    apps: ['gmail', 'claude', 'slack'],
    creator: { name: 'Core Automation', initials: 'CA' },
    runs: '1,420 runs',
    is_assigned: true,
    nodes: [
      { name: 'Gmail Trigger', type: 'trigger', tool: 'gmail' },
      { name: 'Claude 3.5 Sonnet', type: 'ai_llm', tool: 'claude' },
      { name: 'Action Center Review', type: 'action', tool: 'webhook' },
      { name: 'Slack Notification', type: 'output', tool: 'slack' },
    ],
  },
  {
    id: 'product_launch',
    name: 'product_launch_sprint',
    display_name: 'Product Launch Sprint Campaign',
    title: 'Extract brief documents, generate multi-platform copy, and create campaign visuals',
    category: 'Marketing',
    category_group: 'featured',
    description: 'Generates tailored LinkedIn, Twitter, and Newsletter copy, triggers ImageRouter for campaign assets, and prepares scheduled posts.',
    apps: ['claude', 'openai', 'sheet'],
    creator: { name: 'Growth Ops', initials: 'GO' },
    runs: '980 runs',
    is_assigned: true,
    nodes: [
      { name: 'Document Brief Upload', type: 'trigger', tool: 'webhook' },
      { name: 'Multi-Channel Copy Agent', type: 'ai_llm', tool: 'claude' },
      { name: 'ImageRouter Generator', type: 'ai_llm', tool: 'openai' },
      { name: 'Social Queue Dispatch', type: 'output', tool: 'sheet' },
    ],
  },
  {
    id: 'invoice_processor',
    name: 'invoice_extractor',
    display_name: 'Invoice OCR & Purchase Order Cross-Check',
    title: 'Extract invoice PDFs from Gmail, verify line items in Sheets, and sync Calendar',
    category: 'Finance',
    category_group: 'featured',
    description: 'Automated invoice workflow with LLM data extraction, discrepancy checks against purchase orders, and calendar due date reminders.',
    apps: ['gmail', 'claude', 'sheet', 'calendar'],
    creator: { name: 'Finance Ops', initials: 'FO' },
    runs: '2,310 runs',
    is_assigned: true,
    nodes: [
      { name: 'Invoice Received', type: 'trigger', tool: 'gmail' },
      { name: 'Claude Data Extractor', type: 'ai_llm', tool: 'claude' },
      { name: 'Sheets Discrepancy Check', type: 'action', tool: 'sheet' },
      { name: 'Google Calendar Event', type: 'output', tool: 'calendar' },
    ],
  },
  {
    id: 'lead_enrichment',
    name: 'lead_enrichment_crm',
    display_name: 'Inbound Lead Enrichment & HubSpot Sync',
    title: 'Score new web form leads with GPT-4o, enrich company size, and notify Sales on Slack',
    category: 'Sales & CRM',
    category_group: 'sales',
    description: 'Enriches inbound leads with firmographic data, predicts conversion probability, updates CRM, and notifies account executives.',
    apps: ['openai', 'hubspot', 'slack'],
    creator: { name: 'Revenue Ops', initials: 'RO' },
    runs: '3,890 runs',
    is_assigned: false,
    nodes: [
      { name: 'Webhook Lead Submit', type: 'trigger', tool: 'webhook' },
      { name: 'Intent Scoring Agent', type: 'ai_llm', tool: 'openai' },
      { name: 'HubSpot Contact Sync', type: 'action', tool: 'hubspot' },
      { name: 'Slack VIP Channel', type: 'output', tool: 'slack' },
    ],
  },
  {
    id: 'telegram_support',
    name: 'telegram_customer_agent',
    display_name: 'Autonomous Telegram Customer Assistant',
    title: 'Answer customer questions using vector KB, generate replies, and escalate refunds',
    category: 'Customer Support',
    category_group: 'ai_agents',
    description: 'Real-time Telegram bot connected to PostgreSQL pgvector embeddings with intelligent human-in-the-loop escalation.',
    apps: ['telegram', 'postgres', 'openai'],
    creator: { name: 'Support Ops', initials: 'SO' },
    runs: '1,150 runs',
    is_assigned: false,
    nodes: [
      { name: 'Telegram Message', type: 'trigger', tool: 'telegram' },
      { name: 'Vector DB Search', type: 'action', tool: 'postgres' },
      { name: 'Response Synthesizer', type: 'ai_llm', tool: 'openai' },
      { name: 'Action Center Escalation', type: 'output', tool: 'webhook' },
    ],
  },
  {
    id: 'devops_alert_triage',
    name: 'devops_alert_triage',
    display_name: 'CloudWatch & Sentry Incident Auto-Triage',
    title: 'Cluster server error logs, summarize root cause with LLM, and create Jira issue',
    category: 'DevOps & IT',
    category_group: 'devops',
    description: 'Detects high-frequency exceptions, aggregates stack traces, queries documentation, and opens structured tickets for engineers.',
    apps: ['slack', 'claude', 'postgres'],
    creator: { name: 'DevOps Guild', initials: 'DG' },
    runs: '4,520 runs',
    is_assigned: false,
    nodes: [
      { name: 'Sentry Webhook', type: 'trigger', tool: 'webhook' },
      { name: 'Root Cause Agent', type: 'ai_llm', tool: 'claude' },
      { name: 'Audit Log Storage', type: 'action', tool: 'postgres' },
      { name: 'Slack Alert', type: 'output', tool: 'slack' },
    ],
  },
]

// ── Interactive Template Preview Modal ────────────────────────────────────────
function TemplatePreviewModal({ template, onClose, onRun, onRequestAccess, isRequested, requesting }) {
  if (!template) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#233048]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-[#182234] border border-blue-200 dark:border-[#233048] flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{template.display_name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{template.category} · {template.runs}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#182234] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Overview</h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{template.description}</p>
          </div>

          {/* Visual Node Graph Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Workflow Nodes Pipeline</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {(template.nodes || []).map((node, i) => {
                return (
                  <div key={i} className="p-3 bg-slate-50 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] rounded-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 rounded-md bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] flex items-center justify-center shadow-2xs">
                        <ToolLogo name={node.tool} className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Step {i + 1}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{node.name}</p>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{node.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Connected Tools & Creator */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-[#233048] text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Connected Services:</span>
              <div className="flex items-center gap-1.5">
                {(template.apps || []).map(appId => (
                  <div key={appId} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                    <ToolLogo name={appId} className="w-3.5 h-3.5" />
                    <span className="capitalize">{appId}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span>Author:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-200">{template.creator?.name}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-[#0b0f17] border-t border-slate-200 dark:border-[#233048] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>

          {template.is_assigned ? (
            <button
              onClick={() => { onClose(); onRun(template) }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Play size={13} className="fill-white" />
              <span>Use This Template</span>
            </button>
          ) : (
            <button
              onClick={() => onRequestAccess(template)}
              disabled={isRequested || requesting}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isRequested
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
              }`}
            >
              {isRequested ? <Check size={13} /> : <Send size={13} />}
              <span>{isRequested ? 'Access Requested' : 'Request Access'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main WorkflowLibrary Component ────────────────────────────────────────────
export default function WorkflowLibrary() {
  const navigate = useNavigate()
  const { api, isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedApp, setSelectedApp] = useState(null)
  const [previewTemplate, setPreviewTemplate] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRunWf, setSelectedRunWf] = useState(null)
  const [requestedMap, setRequestedMap] = useState({})
  const [requestingId, setRequestingId] = useState(null)
  const [requestToast, setRequestToast] = useState('')

  const categories = ['All', 'Featured', 'AI & LLMs', 'Sales & CRM', 'Marketing', 'DevOps & IT', 'Finance', 'Customer Support']

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return CURATED_TEMPLATES.filter(tpl => {
      if (selectedCategory !== 'All') {
        if (selectedCategory === 'Featured' && tpl.category_group !== 'featured') return false
        if (selectedCategory !== 'Featured' && tpl.category !== selectedCategory) return false
      }

      if (selectedApp && !tpl.apps.includes(selectedApp)) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle = tpl.title.toLowerCase().includes(q)
        const matchName = tpl.display_name.toLowerCase().includes(q)
        const matchDesc = tpl.description.toLowerCase().includes(q)
        if (!matchTitle && !matchName && !matchDesc) return false
      }

      return true
    })
  }, [selectedCategory, selectedApp, search])

  function handleRun(tpl) {
    if (tpl.name === 'email_summarizer') {
      navigate('/workflows/email_summarizer')
      return
    }
    if (tpl.name === 'product_launch_sprint' || tpl.name === 'product_launch') {
      navigate('/workflows/product_launch')
      return
    }
    setSelectedRunWf({
      name: tpl.name,
      displayName: tpl.display_name,
    })
    setModalOpen(true)
  }

  async function handleRequestAccess(tpl) {
    setRequestingId(tpl.id)
    try {
      await api.post('/catalog/request-access', {
        workflow_id: tpl.id,
        workflow_name: tpl.display_name,
      })
      setRequestedMap(prev => ({ ...prev, [tpl.id]: true }))
      setRequestToast(`Access request for "${tpl.display_name}" sent!`)
      setTimeout(() => setRequestToast(''), 4000)
    } catch {
      setRequestedMap(prev => ({ ...prev, [tpl.id]: true }))
      setRequestToast(`Access request for "${tpl.display_name}" submitted!`)
      setTimeout(() => setRequestToast(''), 4000)
    } finally {
      setRequestingId(null)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 pb-16 font-sans relative transition-colors">
      {/* Toast Notification */}
      {requestToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-fade-in border border-slate-700">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{requestToast}</span>
        </div>
      )}

      {/* Modal / Runner */}
      {selectedRunWf && (
        <RunWorkflowModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          workflowName={selectedRunWf.name}
          displayName={selectedRunWf.displayName}
          onSuccess={() => {}}
        />
      )}

      {/* Template Detailed Preview Drawer */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onRun={handleRun}
        onRequestAccess={handleRequestAccess}
        isRequested={previewTemplate && requestedMap[previewTemplate.id]}
        requesting={previewTemplate && requestingId === previewTemplate.id}
      />

      {/* ── Hero Section ───────────────────────────────────────────────────── */}
      <div className="relative pt-10 pb-6 px-4 text-center max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
          Workflow Templates Directory
        </h1>

        <p className="mt-2 text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Pre-built, autonomous operations pipelines ready to execute in your workspace.
        </p>

        {/* Unified Search Bar */}
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="flex items-center bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] focus-within:border-blue-500 rounded-2xl p-2 shadow-xs transition-all">
            <div className="flex items-center gap-2 pl-2 text-slate-400">
              <Search className="w-4 h-4 text-blue-500" />
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows by app, prompt, or task (e.g. invoices, leads, social)..."
              className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden"
            />

            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => navigate('/copilot')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer shrink-0 hidden sm:flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>AI Assistant</span>
            </button>
          </div>

          {/* Clean Category Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white dark:bg-[#121826] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#233048]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── App Stack Filter with Real Tool Logos ────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 my-6">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <span>Filter by connected tools:</span>
            </span>
            {selectedApp && (
              <button
                onClick={() => setSelectedApp(null)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Clear tool filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TECH_STACK_APPS.map(app => {
              const isSelected = selectedApp === app.id

              return (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(isSelected ? null : app.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-[#182234] text-blue-700 dark:text-blue-300 font-semibold'
                      : 'border-slate-200 dark:border-[#233048] bg-slate-50 dark:bg-[#182234] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#202c42]'
                  }`}
                >
                  <ToolLogo name={app.id} className="w-4 h-4" />
                  <span>{app.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Template Showcase Grid ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{selectedCategory === 'All' ? 'Featured Operations Templates' : `${selectedCategory} Templates`}</span>
              <span className="text-xs text-slate-500 font-mono">({filteredTemplates.length})</span>
            </h2>

            <button
              onClick={() => navigate('/workflows')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View my workflows</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-2xl">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No matching templates found</p>
              <p className="text-xs text-slate-500 mt-1">Try resetting your search or selecting a different tool filter.</p>
              <button
                onClick={() => { setSearch(''); setSelectedCategory('All'); setSelectedApp(null) }}
                className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl) => {
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setPreviewTemplate(tpl)}
                    className="p-5 bg-white dark:bg-[#121826] hover:bg-slate-50 dark:hover:bg-[#182234] border border-slate-200 dark:border-[#233048] hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl transition-all cursor-pointer group flex flex-col justify-between shadow-2xs relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#233048] font-mono">
                          {tpl.category}
                        </span>

                        {tpl.is_assigned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                            <CheckCircle2 size={10} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Ready
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 mb-2 leading-snug">
                        {tpl.title}
                      </h3>

                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                        {tpl.description}
                      </p>
                    </div>

                    {/* Bottom Connected Tool Logos */}
                    <div className="pt-3 border-t border-slate-100 dark:border-[#233048] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {(tpl.apps || []).map(appId => (
                          <div
                            key={appId}
                            className="w-6 h-6 rounded-md bg-slate-100 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] flex items-center justify-center p-1"
                            title={appId}
                          >
                            <ToolLogo name={appId} className="w-3.5 h-3.5" />
                          </div>
                        ))}
                      </div>

                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        {tpl.creator?.name}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
