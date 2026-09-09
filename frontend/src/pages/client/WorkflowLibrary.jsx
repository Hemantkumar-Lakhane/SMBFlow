// frontend/src/pages/client/WorkflowLibrary.jsx
// Workflow Library — browse templates + active automations

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ArrowRight, Play, Mail, Zap, CheckCircle2, Layers } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

const CATEGORY_TABS = ['All','Sales','Customer Support','Finance','Operations','HR','Procurement','Custom']

const REUSABLE_TEMPLATES = [
  { id: 'customer_support_triage', name: 'Customer Support Triage', category: 'Customer Support', desc: 'Automatically classify, prioritize, and route incoming support tickets. Escalates high-severity cases for human review.', tools: ['LLM Agent','Rule Engine','Support Tool'] },
  { id: 'invoice_exception_review', name: 'Invoice Exception Review', category: 'Finance', desc: 'Detect anomalies in invoices against purchase orders. Flags discrepancies and routes to finance team for approval.', tools: ['Rule Engine','ML Model','ERP Tool'] },
  { id: 'customer_followup', name: 'Customer Follow-up', category: 'Sales', desc: 'Automate personalized follow-up sequences after customer interactions. Tracks engagement and surfaces opportunities.', tools: ['LLM Agent','CRM Tool','Email Tool'] },
  { id: 'supplier_exception', name: 'Supplier Exception', category: 'Procurement', desc: 'Monitor supplier performance metrics and escalate exceptions. Tracks SLA breaches and recommends corrective action.', tools: ['Rule Engine','API Tool'] },
  { id: 'employee_onboarding', name: 'Employee Onboarding', category: 'HR', desc: 'Orchestrate the new employee onboarding checklist across systems. Tracks completion and escalates blockers.', tools: ['Rule Engine','API Tool','Email Tool'] },
  { id: 'operations_monitor', name: 'Operations Monitor', category: 'Operations', desc: 'Continuously monitor operational KPIs and trigger workflows when thresholds are breached.', tools: ['Rule Engine','ML Model','Notification Tool'] },
]

function ToolChip({ label }) {
  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded border border-gray-200">
      {label}
    </span>
  )
}

function TemplateCard({ template, onUse }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-[11px] font-medium text-gray-400">{template.category}</span>
      </div>
      <h3 className="text-sm font-bold text-gray-900 mt-2 mb-1">{template.name}</h3>
      <p className="text-xs text-gray-500 leading-relaxed flex-1">{template.desc}</p>
      <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
        {template.tools.map(t => <ToolChip key={t} label={t} />)}
      </div>
      <button
        onClick={() => onUse(template)}
        className="flex items-center justify-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg py-2 transition-colors"
      >
        Use template <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function WorkflowLibrary() {
  const navigate      = useNavigate()
  const { api }       = useAuth()
  const [category,    setCategory]    = useState('All')
  const [activeWfs,   setActiveWfs]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [selectedWf,  setSelectedWf]  = useState({ name: 'email_summarizer', displayName: 'Email Summarizer' })

  const load = useCallback(async () => {
    try {
      const wfs = await api.get('/config/workflows')
      setActiveWfs(Array.isArray(wfs) ? wfs : [])
    } catch {
      setActiveWfs([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtered = category === 'All' ? REUSABLE_TEMPLATES : REUSABLE_TEMPLATES.filter(t => t.category === category)

  const handleUse = (template) => {
    navigate('/workflows/builder')
  }

  const handleRunNow = (wf) => {
    setSelectedWf({
      name: wf.name || 'email_summarizer',
      displayName: wf.display_name || wf.name || 'Email Summarizer',
    })
    setModalOpen(true)
  }

  const emailSummarizerWf = activeWfs.find(w => w.name === 'email_summarizer' || w.name?.includes('email'))

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Run Workflow Modal */}
      <RunWorkflowModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workflowName={selectedWf.name}
        displayName={selectedWf.displayName}
        onSuccess={() => load()}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Start from proven templates or run active AI workflow pipelines</p>
        </div>
        <button
          onClick={() => navigate('/workflows/builder')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          + Create Custom
        </button>
      </div>

      {/* Active Autonomous Pipeline Banner */}
      {!loading && emailSummarizerWf && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Active Production Workflow</p>
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-bold text-gray-900">{emailSummarizerWf.display_name || 'Email Summarizer'}</h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
                    Trigger: New Email
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Source: Synthetic Inbox
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                    Automation: Enabled
                  </span>
                </div>
                <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">
                  {emailSummarizerWf.description || 'Continuously monitors inbox for incoming synthetic messages, analyzes priorities, evaluates actionable escalations, and persists summaries.'}
                </p>
                <div className="flex gap-1.5 mt-2.5">
                  {['Research Agent', 'Summarizer Agent', 'Drafting Agent', 'Memory Agent', 'EPI Signing'].map(t => (
                    <ToolChip key={t} label={t} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <button
                onClick={() => handleRunNow(emailSummarizerWf)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Play className="w-4 h-4 fill-white" /> Run Now
              </button>
              <button
                onClick={() => navigate('/workflows/builder')}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 hover:border-blue-300 text-sm font-semibold text-gray-700 hover:text-blue-600 rounded-lg transition-colors whitespace-nowrap"
              >
                Configure <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORY_TABS.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors border ${
              category === cat
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Reusable Templates</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(t => <TemplateCard key={t.id} template={t} onUse={handleUse} />)}
      </div>
    </div>
  )
}
