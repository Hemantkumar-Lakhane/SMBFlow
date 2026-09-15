// frontend/src/pages/client/WorkflowLibrary.jsx
// Workflow Library — browse templates + active automations

import { useState, useEffect, useCallback } from 'react'
import { getDisplayName } from '../../utils/workflowDisplayNames'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ArrowRight, Play, Mail, Zap, CheckCircle2, Layers } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import RunWorkflowModal from '../../components/workflow/RunWorkflowModal'

const CATEGORY_TABS = ['All','Sales','Customer Support','Finance','Operations','HR','Procurement','Custom']

const REUSABLE_TEMPLATES = [
  { id: 'product_launch_sprint', name: 'Product Launch Sprint', category: 'Sales', desc: 'Turn your product launch into a ready-to-publish 7-day multi-channel campaign with messaging, visuals, and schedule.', tools: ['Figma-Guided','Multi-Platform','Campaign Generator'] },
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

function UserWorkflowCard({ wf }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:border-blue-300 transition-colors flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-[11px] font-medium text-gray-400">Custom</span>
      </div>
      <h3 className="text-sm font-bold text-gray-900 mt-2 mb-1">{getDisplayName(wf.name, wf.display_name)}</h3>
      <p className="text-xs text-gray-500 leading-relaxed flex-1">{wf.description || ''}</p>
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => {
            // Trigger run via parent handler
            const event = new CustomEvent('runWorkflow', { detail: wf });
            window.dispatchEvent(event);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Play className="w-4 h-4" /> Run Now
        </button>
        <button
          onClick={() => {
            // navigate to builder for this workflow
            const url = `/workflows/builder?wf=${encodeURIComponent(wf.name)}`;
            window.location.href = url;
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 hover:border-blue-300 text-sm font-semibold text-gray-700 hover:text-blue-600 rounded-lg transition-colors"
        >
          Configure <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
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
  );
}

export default function WorkflowLibrary() {
  const navigate      = useNavigate()
  const { api }       = useAuth()
  const [category,    setCategory]    = useState('All')
  const [activeWfs,   setActiveWfs]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [selectedWf,  setSelectedWf]  = useState({ name: 'email_summarizer', displayName: 'Email Summarizer' })
  const [demoData, setDemoData] = useState(null)
  const [demoLoading, setDemoLoading] = useState(false)

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
    if (template.id === 'product_launch_sprint') {
      navigate('/workflows/product_launch')
      return
    }
    navigate('/workflows/builder')
  }

  const handleRunNow = (wf) => {
    setSelectedWf({
      name: wf.name || 'email_summarizer',
      displayName: getDisplayName(wf.name, wf.display_name),
    })
    setModalOpen(true)
  }

  const handlePrepareDemoData = async () => {
    setDemoLoading(true)
    try {
      const resp = await api.get('/workflows/prepare-demo-data')
      setDemoData(Array.isArray(resp?.demo_data) ? resp.demo_data : [])
    } catch {
      setDemoData([])
    } finally {
      setDemoLoading(false)
    }
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
        <button
          onClick={handlePrepareDemoData}
          disabled={demoLoading}
          className="ml-2 flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          {demoLoading ? 'Preparing...' : 'Prepare Demo Data'}
        </button>
      </div>

      {demoData && demoData.length > 0 && (
  <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
    <h2 className="text-sm font-bold text-gray-900 mb-2">Demo Data Summary</h2>
    <ul className="list-disc list-inside text-sm text-gray-700">
      {demoData.map(d => (
        <li key={d.workflow_name}>
          {d.workflow_name}: {d.message ? d.message : `${d.available_count} ${d.source === 'synthetic_inbox' ? 'emails' : 'records'} available`}
        </li>
      ))}
    </ul>
  </div>
)}
{/* Your Workflows */}
      {!loading && activeWfs.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Your Workflows</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeWfs.map(wf => (
              <UserWorkflowCard key={wf.name} wf={wf} />
            ))}
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
