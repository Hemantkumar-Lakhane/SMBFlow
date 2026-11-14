import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Bug, RefreshCw, Search,
  Play, Filter, Layers, Plug, FileText, CheckCircle, XCircle, ArrowRight,
  ExternalLink, Eye, Sliders, PlayCircle, Loader2, UserCheck, ShieldAlert,
  ChevronRight, ArrowUpRight, RotateCcw, AlertCircle, Clock, Send, Sparkles,
  GitBranch, Archive, Trash2, Cpu
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Modal, Button, Input, Select, EmptyState } from '../../components/ui'
import ToolLogo from '../../components/common/ToolLogo'

const QA_STATUS_STYLES = {
  published: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  approved: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  passed: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20',
  in_testing: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
  changes_required: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
  not_tested: 'bg-slate-500/10 text-slate-500 border border-slate-500/20',
  draft: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  disabled: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  deleted: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
}

export default function AdminWorkflowQACenter() {
  const navigate = useNavigate()
  const { user, api } = useAuth()

  // State
  const [activeTab, setActiveTab] = useState('inventory') // 'inventory' | 'defects' | 'retest' | 'releases'
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [inventory, setInventory] = useState([])
  const [defects, setDefects] = useState([])
  const [retestQueue, setRetestQueue] = useState([])

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [qaStatusFilter, setQaStatusFilter] = useState('')
  const [integrationFilter, setIntegrationFilter] = useState('')

  // Dynamic category options from loaded inventory
  const availableCategories = useMemo(() => {
    const cats = new Set()
    inventory.forEach((wf) => {
      if (wf.category) cats.add(wf.category.toLowerCase())
    })
    return Array.from(cats).sort()
  }, [inventory])

  // Real filtered inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter((wf) => {
      if (search.trim()) {
        const query = search.toLowerCase().trim()
        const matchName = wf.name?.toLowerCase().includes(query)
        const matchKey = wf.workflow_key?.toLowerCase().includes(query)
        const matchDesc = wf.description?.toLowerCase().includes(query)
        const matchCat = wf.category?.toLowerCase().includes(query)
        const matchInd = wf.industry?.toLowerCase().includes(query)
        if (!matchName && !matchKey && !matchDesc && !matchCat && !matchInd) {
          return false
        }
      }

      if (categoryFilter && wf.category?.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false
      }

      if (qaStatusFilter && wf.qa_status?.toLowerCase() !== qaStatusFilter.toLowerCase()) {
        return false
      }

      return true
    })
  }, [inventory, search, categoryFilter, qaStatusFilter])

  // Modals
  const [selectedWorkflow, setSelectedWorkflow] = useState(null)
  const [workflowManifest, setWorkflowManifest] = useState(null)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [defectModalOpen, setDefectModalOpen] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [manifestModalOpen, setManifestModalOpen] = useState(false)

  // Testing Execution State
  const [testMode, setTestMode] = useState('real_provider') // 'unit' | 'integration' | 'real_provider'
  const [safePreview, setSafePreview] = useState(true)
  const [testInputs, setTestInputs] = useState({})
  const [testingRunning, setTestingRunning] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [reviewVerdict, setReviewVerdict] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Defect Reporting State
  const [defectForm, setDefectForm] = useState({
    node_id: '',
    node_name: '',
    title: '',
    severity: 'medium',
    expected_behavior: '',
    actual_behavior: '',
    reproduction_steps: '',
    sanitized_error: '',
    assigned_developer: '',
    tester_notes: '',
  })
  const [submittingDefect, setSubmittingDefect] = useState(false)

  // Release Approval State
  const [releaseGates, setReleaseGates] = useState(null)
  const [loadingGates, setLoadingGates] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState('')
  const [overrideException, setOverrideException] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [submittingApproval, setSubmittingApproval] = useState(false)

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const [dashRes, invRes, defRes, retRes] = await Promise.all([
        api.get('/admin/qa/dashboard').catch(() => ({ metrics: {}, recent_test_runs: [], recent_defects: [] })),
        api.get('/admin/qa/inventory').catch(() => []),
        api.get('/admin/qa/defects').catch(() => []),
        api.get('/admin/qa/retest-queue').catch(() => []),
      ])
      setDashboard(dashRes)
      setInventory(invRes || [])
      setDefects(defRes || [])
      setRetestQueue(retRes || [])
    } catch (err) {
      console.error('Failed to load QA center data', err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Open Universal Test Workspace
  const handleOpenTestWorkspace = async (wf) => {
    setSelectedWorkflow(wf)
    setTestResult(null)
    setReviewVerdict('')
    setReviewNotes('')
    try {
      const manifestRes = await api.get(`/admin/qa/workflows/${wf.workflow_key}/manifest`)
      setWorkflowManifest(manifestRes)
      // Initialize inputs from manifest samples or defaults
      const initial = manifestRes?.manifest?.sample_inputs || {}
      setTestInputs(initial)
    } catch (e) {
      console.error('Failed to load workflow manifest', e)
    }
    setTestModalOpen(true)
  }

  // Execute Universal Test Run
  const handleRunTest = async () => {
    if (!selectedWorkflow) return
    setTestingRunning(true)
    setTestResult(null)
    try {
      const res = await api.post(`/admin/qa/workflows/${selectedWorkflow.workflow_key}/test-run`, {
        test_mode: testMode,
        input_payload: testInputs,
        safe_preview: safePreview,
      })
      setTestResult(res)
      fetchData() // Refresh inventory metrics
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Test run failed.'
      setTestResult({
        ok: false,
        status: 'failed',
        message: typeof detail === 'string' ? detail : JSON.stringify(detail),
        steps: [
          {
            step_index: 1,
            node_id: 'execution_error',
            label: 'Runner Fault',
            status: 'failed',
            error: typeof detail === 'string' ? detail : JSON.stringify(detail),
          }
        ]
      })
    } finally {
      setTestingRunning(false)
    }
  }

  // Submit Review Verdict
  const handleSubmitReview = async (verdict) => {
    if (!testResult?.test_run_id) return
    setSubmittingReview(true)
    try {
      await api.post(`/admin/qa/test-runs/${testResult.test_run_id}/review`, {
        verdict,
        notes: reviewNotes,
      })
      setReviewVerdict(verdict)
      fetchData()
    } catch (err) {
      alert('Failed to record review: ' + (err?.response?.data?.detail || err?.message))
    } finally {
      setSubmittingReview(false)
    }
  }

  // Open Defect Modal
  const handleOpenDefectModal = (step = null) => {
    setDefectForm({
      node_id: step?.node_id || '',
      node_name: step?.label || '',
      title: step ? `Defect on ${step.label} (${selectedWorkflow?.workflow_key})` : `Issue in ${selectedWorkflow?.name}`,
      severity: 'medium',
      expected_behavior: 'Node processes verified inputs and produces validated schema output.',
      actual_behavior: step?.error || 'Node reported failure or produced incomplete outputs.',
      reproduction_steps: `1. Open QA Test Center\n2. Select workflow '${selectedWorkflow?.workflow_key}'\n3. Run in mode '${testMode}'`,
      sanitized_error: step?.error || '',
      assigned_developer: '',
      tester_notes: '',
    })
    setDefectModalOpen(true)
  }

  // Submit Defect
  const handleSubmitDefect = async (e) => {
    e.preventDefault()
    if (!selectedWorkflow) return
    setSubmittingDefect(true)
    try {
      await api.post('/admin/qa/defects', {
        workflow_key: selectedWorkflow.workflow_key,
        workflow_version: selectedWorkflow.version || '1.0.0',
        test_run_id: testResult?.test_run_id,
        ...defectForm,
      })
      setDefectModalOpen(false)
      fetchData()
    } catch (err) {
      alert('Failed to submit defect: ' + (err?.response?.data?.detail || err?.message))
    } finally {
      setSubmittingDefect(false)
    }
  }

  // Open Release Approval Modal
  const handleOpenReleaseModal = async (wf) => {
    setSelectedWorkflow(wf)
    setReleaseNotes('')
    setOverrideException(false)
    setOverrideReason('')
    setLoadingGates(true)
    setReleaseModalOpen(true)
    try {
      const gatesRes = await api.get(`/admin/qa/workflows/${wf.workflow_key}/release-gates`)
      setReleaseGates(gatesRes)
    } catch (err) {
      console.error('Failed to load release gates', err)
    } finally {
      setLoadingGates(false)
    }
  }

  // Approve Release
  const handleApproveRelease = async () => {
    if (!selectedWorkflow) return
    setSubmittingApproval(true)
    try {
      await api.post(`/admin/qa/workflows/${selectedWorkflow.workflow_key}/approve-release`, {
        version: selectedWorkflow.version || '1.0.0',
        notes: releaseNotes,
        override_exception: overrideException,
        override_reason: overrideReason,
      })
      alert(`Workflow '${selectedWorkflow.name}' approved for release!`)
      setReleaseModalOpen(false)
      fetchData()
    } catch (err) {
      alert('Release approval rejected: ' + (err?.response?.data?.detail || err?.message))
    } finally {
      setSubmittingApproval(false)
    }
  }

  // Publish Workflow
  const handlePublishWorkflow = async (wf) => {
    if (!window.confirm(`Publish workflow '${wf.name}' version ${wf.version} to active client users?`)) return
    try {
      await api.post(`/admin/qa/workflows/${wf.workflow_key}/publish`, {
        version: wf.version || '1.0.0',
      })
      alert(`Workflow '${wf.name}' published successfully! It is now accessible to clients.`)
      fetchData()
    } catch (err) {
      alert('Publication failed: ' + (err?.response?.data?.detail || err?.message))
    }
  }

  // Disable Workflow
  const handleDisableWorkflow = async (wf) => {
    if (!window.confirm(`Disable workflow '${wf.name}'? Normal users will no longer be able to execute it.`)) return
    try {
      await api.post(`/admin/qa/workflows/${wf.workflow_key}/disable`)
      fetchData()
    } catch (err) {
      alert('Failed to disable: ' + (err?.response?.data?.detail || err?.message))
    }
  }

  // Update Defect Status
  const handleUpdateDefectStatus = async (defectId, newStatus) => {
    try {
      await api.patch(`/admin/qa/defects/${defectId}`, { status: newStatus })
      fetchData()
    } catch (err) {
      alert('Failed to update defect: ' + (err?.response?.data?.detail || err?.message))
    }
  }

  // Helper to render QA status badges with live indicators
  const renderQaStatusBadge = (status) => {
    const s = status || 'not_tested'
    const dotColor = {
      published: 'bg-emerald-500',
      approved: 'bg-blue-500',
      passed: 'bg-teal-500',
      in_testing: 'bg-cyan-500 animate-pulse',
      changes_required: 'bg-rose-500',
      failed: 'bg-red-500',
      not_tested: 'bg-slate-400',
      draft: 'bg-purple-500',
      disabled: 'bg-slate-400',
    }[s] || 'bg-slate-400'

    const label = s.replace(/_/g, ' ')
    const style = QA_STATUS_STYLES[s] || QA_STATUS_STYLES.not_tested

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize select-text ${style}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span>{label}</span>
      </span>
    )
  }

  // Metrics
  const metrics = dashboard?.metrics || {}

  return (
    <div className="space-y-6 pb-20 select-text">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Quality Assurance & Governance
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Workflow QA & Release Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Universal end-to-end testing, integration verification, defect tracking, and controlled release publishing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => setActiveTab('inventory')}
            icon={<PlayCircle className="w-4 h-4" />}
          >
            Test Workflows
          </Button>
        </div>
      </div>

      {/* ── Live Database Metrics Dashboard ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 select-text">
        {/* Registered */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider select-text">Registered</span>
            <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white select-text">
            {metrics.total_registered ?? inventory.length}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">Discovered DAGs</div>
        </div>

        {/* Passed Tests */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-900/40 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider select-text">Passed Tests</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 select-text">
            {metrics.passed || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">Verified runs</div>
        </div>

        {/* Open Defects */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-rose-300 dark:hover:border-rose-900/40 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider select-text">Open Defects</span>
            <span className={`w-2 h-2 rounded-full ${(metrics.reported_defects || 0) > 0 ? 'bg-rose-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
          </div>
          <div className={`text-2xl font-bold tracking-tight select-text ${(metrics.reported_defects || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {metrics.reported_defects || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">{metrics.awaiting_fixes || 0} awaiting dev</div>
        </div>

        {/* Retest Queue */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-amber-300 dark:hover:border-amber-900/40 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider select-text">Retest Queue</span>
            <span className={`w-2 h-2 rounded-full ${(metrics.retest_queue || 0) > 0 ? 'bg-amber-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
          </div>
          <div className={`text-2xl font-bold tracking-tight select-text ${(metrics.retest_queue || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {metrics.retest_queue || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">Fix ready to verify</div>
        </div>

        {/* Approved */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-900/40 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider select-text">Approved</span>
            <span className={`w-2 h-2 rounded-full ${(metrics.approved || 0) > 0 ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
          </div>
          <div className={`text-2xl font-bold tracking-tight select-text ${(metrics.approved || 0) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
            {metrics.approved || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">Ready to publish</div>
        </div>

        {/* Published Live */}
        <div className="group relative p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-900/40 transition-all select-text">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider select-text">Published Live</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 select-text">
            {metrics.published || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-medium select-text">Accessible to clients</div>
        </div>
      </div>

      {/* ── Navigation Tabs ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 select-text">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors select-text ${
            activeTab === 'inventory'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Workflow Testing Inventory ({filteredInventory.length !== inventory.length ? `${filteredInventory.length} of ${inventory.length}` : inventory.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('defects')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors select-text ${
            activeTab === 'defects'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Bug className="w-4 h-4" />
          <span>Defect & Dev Feedback Queue</span>
          {metrics.reported_defects > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-rose-500/10 text-rose-600 font-bold select-text">
              {metrics.reported_defects}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('retest')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors select-text ${
            activeTab === 'retest'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Retest Queue ({retestQueue.length})</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          TAB 1: WORKFLOW TESTING INVENTORY
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'inventory' && (
        <div className="space-y-4 select-text">
          {/* Filter Bar */}
          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between select-text">
            <div className="relative w-full sm:w-96 select-text">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search workflows by key, name, or purpose..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all select-text"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-0.5"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                  {availableCategories.length === 0 && (
                    <>
                      <option value="productivity">Productivity</option>
                      <option value="marketing">Marketing</option>
                      <option value="sales">Sales</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="finance">Finance</option>
                      <option value="legal">Legal</option>
                      <option value="operations">Operations</option>
                    </>
                  )}
                </select>
                <Filter className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={qaStatusFilter}
                  onChange={(e) => setQaStatusFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">All QA States</option>
                  <option value="published">Published</option>
                  <option value="approved">Approved</option>
                  <option value="passed">Passed</option>
                  <option value="in_testing">In Testing</option>
                  <option value="not_tested">Not Tested</option>
                  <option value="changes_required">Changes Required</option>
                  <option value="disabled">Disabled</option>
                </select>
                <Sliders className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {(search || categoryFilter || qaStatusFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setCategoryFilter('')
                    setQaStatusFilter('')
                  }}
                  className="px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Workflow Table / Grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm select-text">
                <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800 select-text">
                  <tr>
                    <th className="px-5 py-3.5 select-text">Workflow Name & Purpose</th>
                    <th className="px-5 py-3.5 select-text">Category & Scope</th>
                    <th className="px-5 py-3.5 select-text">QA Status</th>
                    <th className="px-5 py-3.5 select-text">Required Tools</th>
                    <th className="px-5 py-3.5 select-text">Defects</th>
                    <th className="px-5 py-3.5 select-text">Latest Test</th>
                    <th className="px-5 py-3.5 text-right select-text">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 select-text">
                  {filteredInventory.map((wf) => (
                    <tr
                      key={wf.workflow_key}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors select-text"
                    >
                      <td className="px-5 py-4 align-top select-text">
                        <div className="flex items-start gap-2.5 select-text">
                          <div className="min-w-0 flex-1 select-text">
                            <div className="flex items-center gap-2 flex-wrap select-text">
                              <button
                                type="button"
                                onClick={() => navigate(`/workflows/${wf.workflow_key}?qa_test=true&return_to=/admin/workflows/qa-center`)}
                                className="font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left flex items-center gap-1.5 group/title select-text"
                                title="Open live workflow test runner"
                              >
                                <span className="select-text">{wf.name}</span>
                                <ExternalLink size={13} className="text-slate-400 group-hover/title:text-blue-500 opacity-60 group-hover/title:opacity-100 transition-opacity shrink-0" />
                              </button>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 select-text">
                                v{wf.version || '1.0.0'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed select-text" title={wf.description}>
                              {wf.description}
                            </p>
                            <div className="text-[11px] font-mono text-slate-400 mt-1 select-text">
                              {wf.workflow_key}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top select-text whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 capitalize select-text">
                          {wf.category || 'general'}
                        </span>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 select-text">
                          {wf.scope === 'INDUSTRY' ? `Industry: ${wf.industry || 'Custom'}` : 'Global Scope'}
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top select-text whitespace-nowrap">
                        {renderQaStatusBadge(wf.qa_status)}
                      </td>

                      <td className="px-5 py-4 align-top select-text">
                        {wf.required_integrations && wf.required_integrations.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-[200px] select-text">
                            {wf.required_integrations.map((t) => {
                              const isMissing = wf.missing_integrations?.includes(t)
                              return (
                                <span
                                  key={t}
                                  className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md border select-text ${
                                    isMissing
                                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60'
                                  }`}
                                  title={isMissing ? `Missing credentials for ${t}` : `Configured: ${t}`}
                                >
                                  {t}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic select-text">None (Native)</span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top select-text whitespace-nowrap">
                        {wf.open_defects_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActiveTab('defects')}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors select-text"
                            title="View open defects in queue"
                          >
                            <Bug size={12} />
                            <span>{wf.open_defects_count} open</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono select-text">0</span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top select-text whitespace-nowrap">
                        {wf.latest_test ? (
                          <div className="space-y-0.5 select-text">
                            <div className="flex items-center gap-1.5 select-text">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  wf.latest_test.status === 'passed' ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              <span
                                className={`text-xs font-semibold capitalize select-text ${
                                  wf.latest_test.status === 'passed'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {wf.latest_test.status}
                              </span>
                              <span className="text-[11px] text-slate-400 select-text">
                                ({wf.latest_test.test_mode?.replace('_', ' ') || 'unit'})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono pl-3 select-text">
                              {wf.latest_test.duration_ms}ms
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic select-text">Never tested</span>
                        )}
                      </td>

                      <td className="px-5 py-4 align-top text-right select-text whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/workflows/${wf.workflow_key}?qa_test=true&return_to=/admin/workflows/qa-center`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow transition-all"
                            title="Open live workflow screen and run real test"
                          >
                            <Play size={12} className="fill-current" />
                            <span>Test Live</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenReleaseModal(wf)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs transition-all"
                            title="Release Gates & Governance Sign-off"
                          >
                            <ShieldCheck size={13} className="text-blue-500" />
                            <span>Release</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredInventory.length === 0 && (
              <div className="p-12 text-center bg-white dark:bg-slate-900 space-y-3 select-text">
                <Search className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white select-text">No Matching Workflows Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto select-text">
                  No workflows match your search query &ldquo;{search}&rdquo; and active filter parameters.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('')
                    setCategoryFilter('')
                    setQaStatusFilter('')
                  }}
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          TAB 2: DEFECT & DEV FEEDBACK QUEUE
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'defects' && (
        <div className="space-y-4 select-text">
          <div className="flex items-center justify-between select-text">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 select-text">
              <Bug className="w-5 h-5 text-rose-500" />
              <span>Active Defects & Developer Feedback Queue</span>
            </h2>
            <span className="text-sm text-slate-500 select-text">{defects.length} total defect reports</span>
          </div>

          {defects.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl select-text">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white select-text">Zero Active Defects Reported</h3>
              <p className="text-sm text-slate-500 mt-1 select-text">All tested workflow nodes are operating within declared specifications.</p>
            </div>
          ) : (
            <div className="grid gap-3 select-text">
              {defects.map((def) => (
                <div
                  key={def.id}
                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 select-text"
                >
                  <div className="flex items-start justify-between gap-4 select-text">
                    <div className="select-text">
                      <div className="flex items-center gap-2 flex-wrap select-text">
                        <span className={`text-xs uppercase font-bold px-2 py-0.5 rounded-full select-text ${
                          def.severity === 'critical' ? 'bg-red-500/10 text-red-600 border border-red-500/20' :
                          def.severity === 'high' ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20' :
                          'bg-amber-500/10 text-amber-600'
                        }`}>
                          {def.severity}
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-white text-base select-text">{def.title}</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-slate-500 select-text">
                          {def.workflow_key}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 select-text">
                        Reported by <span className="font-medium text-slate-700 dark:text-slate-300 select-text">{def.reported_by}</span> on node{' '}
                        <span className="font-mono text-blue-600 select-text">{def.node_name || def.node_id || 'Pipeline'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={def.status}
                        onChange={(e) => handleUpdateDefectStatus(def.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                      >
                        <option value="open">Open</option>
                        <option value="triaged">Triaged</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="fix_ready">Fix Ready</option>
                        <option value="awaiting_retest">Awaiting Retest</option>
                        <option value="resolved">Resolved</option>
                        <option value="reopened">Reopened</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200/50 dark:border-slate-700/50 select-text">
                    <div className="select-text">
                      <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-0.5 select-text">Expected Behavior:</span>
                      <p className="text-slate-700 dark:text-slate-300 select-text">{def.expected_behavior}</p>
                    </div>
                    <div className="select-text">
                      <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-0.5 select-text">Actual Behavior:</span>
                      <p className="text-rose-600 dark:text-rose-400 select-text">{def.actual_behavior}</p>
                    </div>
                  </div>

                  {def.sanitized_error && (
                    <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/20 text-xs font-mono text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/30 select-text">
                      {def.sanitized_error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          TAB 3: RETEST QUEUE
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'retest' && (
        <div className="space-y-4 select-text">
          <div className="flex items-center justify-between select-text">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 select-text">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              <span>Retest Queue (Fixes Ready for Verification)</span>
            </h2>
          </div>

          {retestQueue.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl select-text">
              <CheckCircle className="w-12 h-12 text-teal-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white select-text">Retest Queue is Clear</h3>
              <p className="text-sm text-slate-500 mt-1 select-text">There are no pending developer fixes awaiting re-verification.</p>
            </div>
          ) : (
            <div className="grid gap-3 select-text">
              {retestQueue.map((item) => (
                <div key={item.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 select-text">
                  <div className="select-text">
                    <div className="flex items-center gap-2 select-text">
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 select-text">
                        {item.status.replace('_', ' ')}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-white select-text">{item.title}</h4>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 select-text">
                      Workflow: <span className="font-mono text-blue-600 select-text">{item.workflow_key}</span> • Node: <span className="select-text">{item.node_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Play size={13} />}
                      onClick={() => {
                        const targetWf = inventory.find((w) => w.workflow_key === item.workflow_key)
                        if (targetWf) handleOpenTestWorkspace(targetWf)
                      }}
                    >
                      Execute Retest
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateDefectStatus(item.id, 'resolved')}
                    >
                      Mark Resolved
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          UNIVERSAL TEST WORKSPACE MODAL
      ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-blue-600" />
            <span>Universal QA Test Workspace: {selectedWorkflow?.name}</span>
          </div>
        }
        size="2xl"
      >
        <div className="space-y-5">
          {/* Workflow Header / Spec Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{selectedWorkflow?.workflow_key} (v{selectedWorkflow?.version})</span>
              <span className="text-slate-500">Handler: {workflowManifest?.manifest?.execution_handler || 'WorkflowOrchestrator'}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">{workflowManifest?.manifest?.description}</p>
          </div>

          {/* Test Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Select Test Execution Mode:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTestMode('unit')}
                className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-all ${
                  testMode === 'unit'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold mb-0.5">1. Unit Test (Mock)</div>
                <div className="text-[10px] text-slate-400 font-normal">Pure mock simulation with synthetic latencies and zero side effects.</div>
              </button>

              <button
                type="button"
                onClick={() => setTestMode('integration')}
                className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-all ${
                  testMode === 'integration'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold mb-0.5">2. Integration (Fixtures)</div>
                <div className="text-[10px] text-slate-400 font-normal">Ingests real test fixtures through live LLM reasoning pipeline.</div>
              </button>

              <button
                type="button"
                onClick={() => setTestMode('real_provider')}
                className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-all ${
                  testMode === 'real_provider'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="font-bold mb-0.5">3. Real Provider Test</div>
                <div className="text-[10px] text-slate-400 font-normal">Authorized tool bindings (Meet, Whisper, Mailgun). Refuses fake success.</div>
              </button>
            </div>
          </div>

          {/* Integration Readiness Banner */}
          {workflowManifest?.missing_integrations?.length > 0 && testMode === 'real_provider' && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Missing Required External Integrations: </span>
                  {workflowManifest.missing_integrations.join(', ')}. Connect tool in Settings to run real provider test.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/admin/providers')}
                icon={<ExternalLink size={13} />}
              >
                Connect Tools
              </Button>
            </div>
          )}

          {/* Safe Preview Toggle */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">Safe Preview / Dry Run Protection</span>
              <span className="text-slate-500 text-[11px]">When enabled, prevents real external actions (email dispatch, calendar mutations).</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={safePreview}
                onChange={(e) => setSafePreview(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Dynamic Workflow Input Form */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Workflow Inputs ({workflowManifest?.manifest?.input_schema?.title || 'Execution Payload'})
            </h4>

            {workflowManifest?.manifest?.input_schema?.properties ? (
              <div className="grid gap-3 max-h-60 overflow-y-auto pr-1">
                {Object.entries(workflowManifest.manifest.input_schema.properties).map(([fieldKey, fieldSpec]) => (
                  <div key={fieldKey} className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>{fieldSpec.title || fieldKey}</span>
                      {workflowManifest.manifest.input_schema.required?.includes(fieldKey) && (
                        <span className="text-rose-500 text-[10px]">Required</span>
                      )}
                    </label>
                    {fieldKey === 'transcript' || fieldKey === 'notes' || fieldKey === 'scoutingNotes' ? (
                      <textarea
                        rows={3}
                        value={testInputs[fieldKey] || ''}
                        onChange={(e) => setTestInputs({ ...testInputs, [fieldKey]: e.target.value })}
                        placeholder={fieldSpec.description || fieldSpec.default || ''}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    ) : (
                      <input
                        type={fieldSpec.type === 'number' || fieldSpec.type === 'integer' ? 'number' : 'text'}
                        value={testInputs[fieldKey] !== undefined ? testInputs[fieldKey] : (fieldSpec.default || '')}
                        onChange={(e) => setTestInputs({ ...testInputs, [fieldKey]: e.target.value })}
                        placeholder={fieldSpec.description || fieldSpec.default || ''}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">No structured input schema declared for this workflow.</div>
            )}
          </div>

          {/* Test Run Execution Button */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Execution will record server-side trace and audit entry.
            </span>
            <Button
              variant="primary"
              onClick={handleRunTest}
              disabled={testingRunning}
              icon={testingRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              className={testingRunning ? 'animate-pulse' : ''}
            >
              {testingRunning ? 'Executing Pipeline...' : `Execute ${testMode.replace('_', ' ').toUpperCase()}`}
            </Button>
          </div>

          {/* Test Run Output & Execution Trace */}
          {testResult && (
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${testResult.ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                    {testResult.status?.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">Run ID: {testResult.test_run_id}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {testResult.duration_ms}ms • {testResult.total_tokens || 0} tokens • ${testResult.total_cost_usd || 0}
                </div>
              </div>

              {/* Node Execution Steps */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Step</th>
                      <th className="px-3 py-2">Node Name</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Report Defect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {testResult.steps?.map((step) => (
                      <tr key={step.step_index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-mono text-slate-400">{step.step_index}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{step.label}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{step.provider}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            step.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                            step.status === 'preview_simulated' ? 'bg-blue-500/10 text-blue-600' :
                            'bg-rose-500/10 text-rose-600'
                          }`}>
                            {step.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenDefectModal(step)}
                            className="text-rose-600 hover:underline text-[11px] font-medium"
                          >
                            Report Issue
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Formatted Business Outputs */}
              {testResult.outputs && Object.keys(testResult.outputs).length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">Verified Business Outputs:</span>
                  <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {JSON.stringify(testResult.outputs, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tester Review Verdict Controls */}
              {testResult.test_run_id && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Record Tester Output Verification Verdict:</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={reviewVerdict === 'correct' ? 'primary' : 'outline'}
                      onClick={() => handleSubmitReview('correct')}
                      disabled={submittingReview}
                    >
                      ✓ Mark as Correct
                    </Button>
                    <Button
                      size="sm"
                      variant={reviewVerdict === 'incomplete' ? 'secondary' : 'outline'}
                      onClick={() => handleSubmitReview('incomplete')}
                      disabled={submittingReview}
                    >
                      ⚠ Incomplete Output
                    </Button>
                    <Button
                      size="sm"
                      variant={reviewVerdict === 'irrelevant' ? 'secondary' : 'outline'}
                      onClick={() => handleSubmitReview('irrelevant')}
                      disabled={submittingReview}
                    >
                      ✗ Irrelevant Content
                    </Button>
                    <Button
                      size="sm"
                      variant={reviewVerdict === 'unsafe' ? 'danger' : 'outline'}
                      onClick={() => handleSubmitReview('unsafe')}
                      disabled={submittingReview}
                    >
                      ⚡ Unsafe / Hallucinated
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ───────────────────────────────────────────────────────────────────────
          DEFECT REPORTING MODAL
      ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={defectModalOpen}
        onClose={() => setDefectModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-rose-600">
            <Bug className="w-5 h-5" />
            <span>Report Workflow Defect to Developers</span>
          </div>
        }
      >
        <form onSubmit={handleSubmitDefect} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Defect Title</label>
            <input
              type="text"
              required
              value={defectForm.title}
              onChange={(e) => setDefectForm({ ...defectForm, title: e.target.value })}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Severity</label>
              <select
                value={defectForm.severity}
                onChange={(e) => setDefectForm({ ...defectForm, severity: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <option value="critical">Critical (Blocks Release)</option>
                <option value="high">High (Blocks Release)</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Assign Developer</label>
              <input
                type="text"
                placeholder="dev@smbflow.test"
                value={defectForm.assigned_developer}
                onChange={(e) => setDefectForm({ ...defectForm, assigned_developer: e.target.value })}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Expected Behavior</label>
            <textarea
              required
              rows={2}
              value={defectForm.expected_behavior}
              onChange={(e) => setDefectForm({ ...defectForm, expected_behavior: e.target.value })}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Actual Behavior / Failure</label>
            <textarea
              required
              rows={2}
              value={defectForm.actual_behavior}
              onChange={(e) => setDefectForm({ ...defectForm, actual_behavior: e.target.value })}
              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setDefectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={submittingDefect}>
              {submittingDefect ? 'Submitting...' : 'Submit Defect & Block Release'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ───────────────────────────────────────────────────────────────────────
          RELEASE GATES & APPROVAL MODAL
      ──────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>Release Approval Gates: {selectedWorkflow?.name}</span>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {loadingGates ? (
            <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Evaluating automated release criteria...
            </div>
          ) : releaseGates ? (
            <div className="space-y-3">
              <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40">
                {Object.entries(releaseGates.gates || {}).map(([gateKey, gateSpec]) => (
                  <div key={gateKey} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {gateSpec.passed ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white capitalize">
                          {gateKey.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[11px] text-slate-500">{gateSpec.details}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      gateSpec.passed ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                    }`}>
                      {gateSpec.passed ? 'PASSED' : 'BLOCKED'}
                    </span>
                  </div>
                ))}
              </div>

              {!releaseGates.all_gates_passed && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Automated Release Gates Incomplete
                  </div>
                  <p className="text-[11px]">
                    This workflow cannot be approved without passing all gates or an explicit authorized override.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={overrideException}
                      onChange={(e) => setOverrideException(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Administrator Override Exception</span>
                  </label>
                  {overrideException && (
                    <input
                      type="text"
                      placeholder="Required justification for override..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full text-xs p-2 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900"
                    />
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block">Approval Sign-off Notes</label>
                <textarea
                  rows={2}
                  placeholder="Record verification notes, scope of release, or compliance approvals..."
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePublishWorkflow(selectedWorkflow)}
                  disabled={selectedWorkflow?.qa_status !== 'approved' && !selectedWorkflow?.active}
                >
                  Publish Version
                </Button>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setReleaseModalOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApproveRelease}
                    disabled={submittingApproval || (!releaseGates.all_gates_passed && !overrideException)}
                  >
                    {submittingApproval ? 'Signing off...' : 'Approve Release'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
