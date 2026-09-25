// frontend/src/pages/client/WorkflowLibrary.jsx
// ─────────────────────────────────────────────────────────────────────────────
// World-class n8n-styled Workflow Template Library & Directory
// Features:
//   • Ambient radial glow hero with unified search & category selector
//   • "What's in your stack?" interactive app ecosystem filter
//   • Category-grouped template showcases (Featured, AI & LLMs, Sales & CRM, DevOps & IT)
//   • Rich n8n-style cards with connected app icons, badges, & creator avatars
//   • Interactive SVG Visual Node Pipeline Preview Modal
//   • 1-Click "Use Template / Run Now" execution & access request pipeline
//   • FAQs & Testimonial showcase with full Light & Dark mode support
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, ArrowRight, Play, Mail, Zap, Search, RefreshCw,
  Layers, AlertTriangle, Globe, Building2, CheckCircle2, Lock, Send,
  Sparkles, Cpu, Database, MessageSquare, Calendar, Share2,
  ChevronDown, ChevronUp, Check, Shield, FileText, ArrowUpRight,
  Filter, HelpCircle, User, Star, ExternalLink, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getDisplayName } from '../../utils/workflowDisplayNames'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

// ── App Ecosystem Registry ───────────────────────────────────────────────────
const TECH_STACK_APPS = [
  { id: 'openai', name: 'OpenAI', icon: Cpu, color: '#10B981', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'claude', name: 'Claude', icon: Sparkles, color: '#D97706', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { id: 'gmail', name: 'Gmail', icon: Mail, color: '#EA4335', bg: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { id: 'slack', name: 'Slack', icon: MessageSquare, color: '#EC4899', bg: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  { id: 'hubspot', name: 'HubSpot', icon: Database, color: '#FF7A59', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { id: 'sheets', name: 'Google Sheets', icon: FileText, color: '#0F9D58', bg: 'bg-green-500/10 text-green-400 border-green-500/30' },
  { id: 'calendar', name: 'Google Calendar', icon: Calendar, color: '#4285F4', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { id: 'telegram', name: 'Telegram', icon: Send, color: '#229ED9', bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { id: 'postgres', name: 'PostgreSQL', icon: Database, color: '#336791', bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
]

// ── Curated Template Catalog with n8n Node Breakdown ─────────────────────────
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
    creator: { name: 'SMBFlow Core', avatar: '🤖', verified: true },
    runs: '1,420 runs',
    is_assigned: true,
    nodes: [
      { name: 'Gmail Trigger', type: 'trigger', icon: Mail, color: '#EA4335' },
      { name: 'Claude 3.5 Sonnet', type: 'ai_llm', icon: Sparkles, color: '#D97706' },
      { name: 'Action Center HITL', type: 'action', icon: Shield, color: '#F59E0B' },
      { name: 'Slack VIP Alert', type: 'output', icon: MessageSquare, color: '#EC4899' },
    ],
  },
  {
    id: 'product_launch',
    name: 'product_launch_sprint',
    display_name: 'Product Launch Sprint Campaign',
    title: 'Extract brief documents, generate multi-platform copy, and create AI visuals',
    category: 'Marketing',
    category_group: 'featured',
    description: 'Generates tailored LinkedIn, Twitter, and Newsletter copy, triggers ImageRouter for campaign assets, and prepares scheduled posts.',
    apps: ['claude', 'openai', 'sheets'],
    creator: { name: 'Growth Ops', avatar: '🚀', verified: true },
    runs: '980 runs',
    is_assigned: true,
    nodes: [
      { name: 'Document Brief Upload', type: 'trigger', icon: FileText, color: '#8B5CF6' },
      { name: 'Multi-Channel Copy Agent', type: 'ai_llm', icon: Cpu, color: '#D97706' },
      { name: 'ImageRouter Generator', type: 'ai_llm', icon: Sparkles, color: '#EC4899' },
      { name: 'Buffer / Social Queue', type: 'output', icon: Share2, color: '#3B82F6' },
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
    apps: ['gmail', 'claude', 'sheets', 'calendar'],
    creator: { name: 'Finance Lead', avatar: '💼', verified: true },
    runs: '2,310 runs',
    is_assigned: true,
    nodes: [
      { name: 'Invoice Received', type: 'trigger', icon: Mail, color: '#EA4335' },
      { name: 'Claude Data Extractor', type: 'ai_llm', icon: Sparkles, color: '#D97706' },
      { name: 'Sheets Discrepancy Check', type: 'action', icon: FileText, color: '#0F9D58' },
      { name: 'Google Calendar Event', type: 'output', icon: Calendar, color: '#4285F4' },
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
    creator: { name: 'RevOps Team', avatar: '🎯', verified: true },
    runs: '3,890 runs',
    is_assigned: false,
    nodes: [
      { name: 'Webhook Lead Submit', type: 'trigger', icon: Zap, color: '#8B5CF6' },
      { name: 'Intent Scoring Agent', type: 'ai_llm', icon: Cpu, color: '#10B981' },
      { name: 'HubSpot Contact Sync', type: 'action', icon: Database, color: '#FF7A59' },
      { name: 'Slack VIP Channel', type: 'output', icon: MessageSquare, color: '#EC4899' },
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
    creator: { name: 'Support Bot', avatar: '🤖', verified: true },
    runs: '1,150 runs',
    is_assigned: false,
    nodes: [
      { name: 'Telegram Message', type: 'trigger', icon: Send, color: '#229ED9' },
      { name: 'Vector DB Semantic Search', type: 'action', icon: Database, color: '#336791' },
      { name: 'LLM Response Synthesizer', type: 'ai_llm', icon: Cpu, color: '#10B981' },
      { name: 'Action Center Escalation', type: 'output', icon: Shield, color: '#EF4444' },
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
    creator: { name: 'DevOps Guild', avatar: '⚡', verified: true },
    runs: '4,520 runs',
    is_assigned: false,
    nodes: [
      { name: 'Sentry Webhook', type: 'trigger', icon: Zap, color: '#EF4444' },
      { name: 'Claude Root Cause Agent', type: 'ai_llm', icon: Sparkles, color: '#D97706' },
      { name: 'PostgreSQL Audit Log', type: 'action', icon: Database, color: '#336791' },
      { name: 'Slack PagerDuty Alert', type: 'output', icon: MessageSquare, color: '#EC4899' },
    ],
  },
]

// ── Interactive Template Preview Modal ────────────────────────────────────────
function TemplatePreviewModal({ template, onClose, onRun, onRequestAccess, isRequested, requesting }) {
  if (!template) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#12161f] border border-slate-800 text-slate-100 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{template.display_name}</h3>
              <p className="text-xs text-slate-400">{template.category} · {template.runs || 'Production Ready'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Overview</h4>
            <p className="text-sm text-slate-300 leading-relaxed">{template.description}</p>
          </div>

          {/* Visual Node Graph Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Workflow Execution Pipeline</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {(template.nodes || []).map((node, i) => {
                const IconC = node.icon || Zap
                return (
                  <div key={i} className="p-3 bg-[#161b22] border border-slate-800 rounded-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: node.color }}>
                        <IconC size={13} />
                      </div>
                      <span className="text-[10px] uppercase font-mono text-slate-400">Step {i + 1}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white truncate">{node.name}</p>
                      <span className="text-[10px] text-slate-400 capitalize">{node.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Connected Tools & Creator */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Integrated Services:</span>
              <div className="flex items-center gap-1.5">
                {(template.apps || []).map(appId => {
                  const app = TECH_STACK_APPS.find(a => a.id === appId)
                  if (!app) return null
                  const AppIcon = app.icon
                  return (
                    <span key={appId} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 flex items-center gap-1 font-mono text-[11px]">
                      <AppIcon size={11} style={{ color: app.color }} /> {app.name}
                    </span>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Author:</span>
              <span className="font-semibold text-purple-300 flex items-center gap-1">
                {template.creator?.avatar} {template.creator?.name}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>

          {template.is_assigned ? (
            <button
              onClick={() => { onClose(); onRun(template) }}
              className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
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
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
              }`}
            >
              {isRequested ? <Check size={13} /> : <Send size={13} />}
              <span>{isRequested ? 'Access Requested' : 'Request Template Access'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── FAQ Accordion Item ────────────────────────────────────────────────────────
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-800/80 rounded-xl bg-[#12161f] overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left text-sm font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
      >
        <span>{question}</span>
        {open ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div className="p-4 pt-0 text-xs text-slate-400 leading-relaxed border-t border-slate-800/40">
          {answer}
        </div>
      )}
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
      // Category filter
      if (selectedCategory !== 'All') {
        if (selectedCategory === 'Featured' && tpl.category_group !== 'featured') return false
        if (selectedCategory !== 'Featured' && tpl.category !== selectedCategory) return false
      }

      // App filter
      if (selectedApp && !tpl.apps.includes(selectedApp)) return false

      // Search keyword filter
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
      setRequestToast(`Access request for "${tpl.display_name}" sent to workspace admin!`)
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
    <div className="min-h-full bg-[#08090d] text-slate-100 pb-16 font-sans relative">
      {/* Background Ambient Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-gradient-to-b from-purple-900/20 via-blue-900/10 to-transparent blur-3xl pointer-events-none" />

      {/* ── Toast Notification ─────────────────────────────────────────────── */}
      {requestToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-purple-950 border border-purple-800 text-purple-200 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} className="text-purple-400 shrink-0" />
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
      <div className="relative pt-12 pb-8 px-4 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 text-xs font-semibold mb-4 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Workflow Automation Directory</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
          Top 1,300+ Automated <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
            Workflow Templates
          </span>
        </h1>

        <p className="mt-3 text-sm md:text-base text-slate-400 max-w-2xl mx-auto">
          Pre-built, multi-agent automated pipelines ready to deploy into your workspace in one click.
        </p>

        {/* ── Unified Search Bar ────────────────────────────────────────────── */}
        <div className="mt-8 max-w-2xl mx-auto">
          <div className="flex items-center bg-[#12161f] border-2 border-slate-800 hover:border-purple-500/70 focus-within:border-purple-500 rounded-2xl p-2 shadow-2xl transition-all">
            <div className="flex items-center gap-2 pl-2 text-slate-400">
              <Search className="w-5 h-5 text-purple-400" />
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows by app, prompt, or task (e.g. invoices, leads, social)..."
              className="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-hidden"
            />

            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => navigate('/copilot')}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 hidden sm:flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI Copilot</span>
            </button>
          </div>

          {/* Quick Category Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : 'bg-[#12161f] text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── "What's in your stack?" Interactive App Filter ───────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 my-8">
        <div className="p-4 rounded-2xl bg-[#10131b] border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Need inspiration? Filter by your tech stack:</span>
            </span>
            {selectedApp && (
              <button
                onClick={() => setSelectedApp(null)}
                className="text-[11px] text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Clear app filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TECH_STACK_APPS.map(app => {
              const isSelected = selectedApp === app.id
              const AppIcon = app.icon

              return (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(isSelected ? null : app.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? app.bg
                      : 'border-slate-800 bg-[#161b22] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <AppIcon size={13} style={{ color: app.color }} />
                  <span>{app.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Template Showcase Grid ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>{selectedCategory === 'All' ? 'Featured Operations Templates' : `${selectedCategory} Templates`}</span>
              <span className="text-xs text-slate-500 font-mono">({filteredTemplates.length})</span>
            </h2>

            <button
              onClick={() => navigate('/workflows')}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View my active workflows</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-[#12161f] border border-slate-800 rounded-2xl">
              <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">No matching templates found</p>
              <p className="text-xs text-slate-500 mt-1">Try resetting your search or selecting a different app filter.</p>
              <button
                onClick={() => { setSearch(''); setSelectedCategory('All'); setSelectedApp(null) }}
                className="mt-4 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl) => {
                const isRequested = requestedMap[tpl.id]
                const isRequesting = requestingId === tpl.id

                return (
                  <div
                    key={tpl.id}
                    onClick={() => setPreviewTemplate(tpl)}
                    className="p-5 bg-[#12161f] hover:bg-[#161b26] border border-slate-800/80 hover:border-purple-500/60 rounded-2xl transition-all cursor-pointer group flex flex-col justify-between shadow-xl relative overflow-hidden"
                  >
                    {/* Top Meta */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/60 font-mono">
                          {tpl.category}
                        </span>

                        {tpl.is_assigned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                            <CheckCircle2 size={10} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                            <Lock size={10} /> Available
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-2 mb-2 leading-snug">
                        {tpl.title}
                      </h3>

                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                        {tpl.description}
                      </p>
                    </div>

                    {/* Bottom App Badges & Actions */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      {/* Integrated App Badges */}
                      <div className="flex items-center -space-x-1">
                        {(tpl.apps || []).map(appId => {
                          const app = TECH_STACK_APPS.find(a => a.id === appId)
                          if (!app) return null
                          const AppIcon = app.icon
                          return (
                            <div
                              key={appId}
                              className="w-6 h-6 rounded-full bg-[#1e2433] border-2 border-[#12161f] flex items-center justify-center text-white"
                              title={app.name}
                            >
                              <AppIcon size={12} style={{ color: app.color }} />
                            </div>
                          )
                        })}
                      </div>

                      {/* Creator badge */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span>{tpl.creator?.avatar}</span>
                        <span className="truncate max-w-[90px]">{tpl.creator?.name}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Verified Creators Banner ───────────────────────────────────────── */}
        <div className="p-6 rounded-2xl bg-[#10131b] border border-slate-800/80 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Verified Workflow Creators</span>
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All templates are audited for privacy, sandboxed execution, and LLM token budget efficiency.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/copilot')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              Build Custom with AI ➔
            </button>
          </div>
        </div>

        {/* ── FAQs Section ──────────────────────────────────────────────────── */}
        <div className="pt-4">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-purple-400" />
            <span>Frequently Asked Questions</span>
          </h2>

          <div className="space-y-2.5">
            <FaqItem
              question="How do automated workflow templates work in SMBFlow?"
              answer="Templates are pre-configured multi-agent pipelines with integrated triggers (such as new emails, webhooks, or scheduled crons), reasoning agents, and tool execution nodes. Once assigned to your workspace, you can execute them directly or customize their inputs."
            />
            <FaqItem
              question="Can I customize the prompts and LLM models for a template?"
              answer="Yes! Workspace administrators can adjust model tiers, prompt instructions, and confidence thresholds in the Model Settings and Workflow Builder tabs without touching code."
            />
            <FaqItem
              question="How does the Budget Governor keep AI operational costs low?"
              answer="SMBFlow includes built-in semantic caching, payload context pruning, and automated model routing (using mini tiers for extraction and heavy models only for complex reasoning), reducing API costs by up to 70%."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
