// frontend/src/pages/client/AutomaticIngestionModal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Automatic Conversation Ingestion & Capture Modal
// Displays webhook stream, capture sources matrix, idempotency tracking,
// and retry controls for external recordings entering Node 1 → Node 5.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react'
import {
  Radio, Copy, Check, RefreshCw, AlertCircle, CheckCircle2,
  Clock, ArrowRight, ExternalLink, ShieldCheck, Zap,
  Terminal, AlertTriangle, Layers, Play, CheckCircle
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function AutomaticIngestionModal({ onClose, onLoadRun }) {
  const { user, api } = useAuth()

  const [activeTab, setActiveTab] = useState('stream') // 'stream' | 'docs' | 'sources'
  const [ingestions, setIngestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [testingIngest, setTestingIngest] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const orgId = user?.organization_id || user?.organizationId || '00000000-0000-0000-0000-000000000001'
  const webhookUrl = `${window.location.origin}/api/v1/workflows/meeting-intelligence/webhook/${orgId}`

  const samplePayload = {
    external_event_id: `rec_${Date.now().toString(36)}`,
    source: 'external_webhook',
    conversation_title: 'Quarterly Strategy & Expansion Review',
    contact_name: 'Rahul Sharma',
    conversation_type: 'Online Meeting',
    conversation_date: new Date().toISOString().slice(0, 10),
    language: 'English',
    transcript_text: 'Rahul Sharma: Thanks for taking the time to meet today. In Q3, our primary focus is expanding our B2B pipeline. I will send over the revised pricing proposal by Friday. Also, our engineering team committed to deliver the API integration specifications by next Wednesday. Let us schedule a follow-up demonstration for next month.',
    metadata: {
      provider: 'webhook_simulator',
      format: 'transcript_notes',
    },
  }

  // Load automatic ingestion stream records
  const loadIngestions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/workflows/meeting-intelligence/ingestions')
      if (res && Array.isArray(res.items)) {
        setIngestions(res.items)
      } else if (Array.isArray(res)) {
        setIngestions(res)
      }
    } catch (err) {
      console.error('Failed to load automatic ingestions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIngestions()
  }, [])

  // Retry failed ingestion
  const handleRetry = async (ingestionId) => {
    setRetryingId(ingestionId)
    try {
      await api.post(`/workflows/meeting-intelligence/ingestions/${ingestionId}/retry`)
      await loadIngestions()
    } catch (err) {
      console.error('Failed to retry ingestion:', err)
    } finally {
      setRetryingId(null)
    }
  }

  // Quick simulate / test webhook from UI
  const handleTestIngest = async () => {
    setTestingIngest(true)
    setTestResult(null)
    try {
      const testEventId = `sim_ui_${Date.now()}`
      const payload = {
        ...samplePayload,
        external_event_id: testEventId,
        conversation_title: `Live Test Ingestion (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      }
      const res = await api.post(`/workflows/meeting-intelligence/webhook/${orgId}`, payload)
      setTestResult({ success: true, message: `Simulated ingestion successful: ${res?.external_event_id || testEventId}` })
      await loadIngestions()
    } catch (err) {
      setTestResult({ success: false, message: err?.response?.data?.detail || err?.message || 'Ingest test failed' })
    } finally {
      setTestingIngest(false)
    }
  }

  const filteredIngestions = ingestions.filter(item => {
    if (statusFilter === 'all') return true
    return item.status === statusFilter
  })

  const copyToClipboard = (text, setCopied) => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#233048]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Automatic Conversation Ingestion & Capture</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                Node 1 Trigger
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              External webhook stream and REST ingestion automatically routed into Node 1 → Node 5
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadIngestions}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#182234] transition-colors cursor-pointer"
            title="Refresh stream"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 pt-3 pb-3 border-b border-slate-100 dark:border-[#1a2336] text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('stream')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'stream'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182234]'
          }`}
        >
          <span>Ingestion Stream & History</span>
          {ingestions.length > 0 && (
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
              activeTab === 'stream' ? 'bg-violet-700 text-white' : 'bg-slate-200 dark:bg-[#233048] text-slate-700 dark:text-slate-300'
            }`}>
              {ingestions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('docs')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'docs'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182234]'
          }`}
        >
          <span>Webhook & API Specs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sources')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'sources'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182234]'
          }`}
        >
          <span>Supported vs Provider Matrix</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">

        {/* ── TAB 1: Ingestion Stream & History ───────────────────────────── */}
        {activeTab === 'stream' && (
          <div className="space-y-4">
            {/* Filter Pills & Test Button */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                {['all', 'completed', 'processing', 'failed'].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                      statusFilter === filter
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold'
                        : 'bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#233048]'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleTestIngest}
                disabled={testingIngest}
                className="px-3 py-1 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Simulate incoming external webhook call"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{testingIngest ? 'Simulating Ingest...' : 'Simulate Ingest Webhook'}</span>
              </button>
            </div>

            {/* Test result banner */}
            {testResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}>
                <span>{testResult.message}</span>
                <button
                  type="button"
                  onClick={() => setTestResult(null)}
                  className="font-bold underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Ingestions List */}
            {loading && ingestions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-violet-600" />
                <span>Loading automatic ingestions...</span>
              </div>
            ) : filteredIngestions.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-[#233048] rounded-2xl p-6">
                <Radio className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Ingestions Found</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                  External recordings delivered via the Webhook or Ingestion API will appear here automatically and execute through Nodes 1–5.
                </p>
                <button
                  type="button"
                  onClick={handleTestIngest}
                  className="mt-3 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Send Test Webhook Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIngestions.map((item) => {
                  const isCompleted = item.status === 'completed'
                  const isProcessing = item.status === 'processing'
                  const isFailed = item.status === 'failed'

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5"
                    >
                      {/* Top Row: Title, Status Badge, External Event ID */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                              {item.conversation_title}
                            </h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] text-slate-600 dark:text-slate-300">
                              {item.source}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Contact: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.contact_name}</span>
                            {' • '}
                            Type: <span>{item.conversation_type}</span>
                            {' • '}
                            Date: <span>{item.conversation_date}</span>
                          </p>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Completed</span>
                            </span>
                          ) : isProcessing ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                              <RefreshCw className="w-3 h-3 text-sky-600 dark:text-sky-400 animate-spin" />
                              <span>Processing</span>
                            </span>
                          ) : isFailed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span>Received</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details row: Event ID, timestamp, retries */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-[#1a2336] pt-2 flex-wrap gap-2">
                        <div className="flex items-center gap-3 font-mono text-[10px]">
                          <span>Event: <strong className="text-slate-700 dark:text-slate-300">{item.external_event_id}</strong></span>
                          <span>•</span>
                          <span>{new Date(item.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                          {item.retry_count > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">{item.retry_count} {item.retry_count === 1 ? 'retry' : 'retries'}</span>
                            </>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          {isFailed && (
                            <button
                              type="button"
                              onClick={() => handleRetry(item.id)}
                              disabled={retryingId === item.id}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                              <span>{retryingId === item.id ? 'Retrying...' : 'Retry Pipeline'}</span>
                            </button>
                          )}

                          {item.instance_id && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onLoadRun) onLoadRun(item.instance_id)
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                              title="Load this workflow run in the runner canvas"
                            >
                              <span>View in Pipeline</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Error message snippet if failed */}
                      {isFailed && item.error_message && (
                        <div className="p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-800 dark:text-rose-300 font-mono">
                          Error: {item.error_message}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Webhook & API Specification ─────────────────────────── */}
        {activeTab === 'docs' && (
          <div className="space-y-4 text-xs">
            {/* Webhook URL Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                  Incoming Tenant Webhook URL (POST)
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Tenant Isolated
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-[#233048] rounded-lg px-3 py-1.5 font-mono text-[11px] text-slate-900 dark:text-slate-100 select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-semibold shrink-0 flex items-center gap-1 transition-all cursor-pointer"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Any external recording service, automation trigger, or webhook dispatcher can POST to this endpoint. The tenant UUID is automatically isolated.
              </p>
            </div>

            {/* Direct REST Ingestion Endpoint */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                  Direct REST Ingestion API (POST)
                </span>
                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold">
                  JWT Authenticated
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-[#233048] font-mono text-[11px] text-slate-800 dark:text-slate-200">
                POST /api/v1/workflows/meeting-intelligence/ingest
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                For backend applications and scripts passing an Authorization Bearer header.
              </p>
            </div>

            {/* Idempotency Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-900 dark:text-blue-200 font-bold">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Strict Idempotency Mechanism</span>
              </div>
              <p className="text-[11px] text-blue-800 dark:text-blue-300">
                Deduplication is guaranteed on the compound key <code className="font-mono bg-blue-100 dark:bg-blue-900/60 px-1 py-0.2 rounded">(organization_id, external_event_id)</code>. Re-sending the same external event ID will NEVER create duplicate workflow runs, contact records, Central Memory statements, action tasks, or email drafts. It safely returns the existing record and status.
              </p>
            </div>

            {/* Sample Payload JSON */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                  Sample Webhook JSON Body
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(samplePayload, null, 2), setCopiedPayload)}
                  className="text-violet-600 dark:text-violet-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedPayload ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload ? 'Copied JSON' : 'Copy Sample'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[10.5px] overflow-x-auto max-h-52">
                {JSON.stringify(samplePayload, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* ── TAB 3: Supported vs Future Capture Sources ──────────────────── */}
        {activeTab === 'sources' && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Real Provider Policy:</strong> We do NOT fake or mock Microsoft Teams, telephony, or wearable capture connectors without genuine provider credentials and webhook configurations. Below is the exact live status of all capture mechanisms.
              </div>
            </div>

            {/* Genuinely Supported Sources */}
            <div className="space-y-2">
              <h4 className="font-bold text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Genuinely Supported (Live & Operational)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white dark:bg-[#121826] border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Webhook Recording Ingest</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    External recording services post JSON webhooks with audio references directly to the tenant endpoint.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121826] border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Direct REST Ingestion API</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Programmatic ingestion via authenticated REST endpoint with custom metadata, contact name, and language detection.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121826] border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Direct Audio Upload / Storage</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pre-uploaded audio files stored in <code className="font-mono">storage/audio/</code> or validated remote download URLs.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#121826] border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Automated Node 1 → Node 5 Pipeline</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Automatic sequential execution through Whisper/Mock transcription, structured extraction, Central Memory indexing, and follow-up draft generation.
                  </p>
                </div>
              </div>
            </div>

            {/* Provider-Dependent Sources */}
            <div className="space-y-2 pt-2">
              <h4 className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Provider-Dependent (Requires External Connector Setup)</span>
              </h4>

              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Microsoft Teams Real-Time Meeting Bot
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Requires Azure Bot Framework registration, Microsoft Graph webhook subscription, and Microsoft 365 Admin Consent for live bot attendance.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 shrink-0">
                    Requires Azure App
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Zoom Cloud Recording Webhook
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Requires a Zoom Marketplace Server-to-Server OAuth app with the <code className="font-mono">recording:completed</code> webhook pointing to this endpoint.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 shrink-0">
                    Requires Zoom App
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Twilio / VoIP Telephony Recording
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Requires Twilio Programmable Voice Call Recording callback URL configured to forward the recording media URL upon call wrap-up.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 shrink-0">
                    Requires Twilio Hook
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Wearable & Ambient Microphones (Limitless / Plaud / Friend)
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Requires hardware manufacturer API integration or local Bluetooth companion syncing application.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 shrink-0">
                    Hardware API
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
