/**
 * Conversation Ingestion & Webhook Stream Capture
 * Manages real-time capture sources, webhook ingestion streams, and idempotency checks.
 */
import React, { useState, useEffect } from 'react'
import {
  Radio, Copy, Check, RefreshCw, AlertCircle, CheckCircle2,
  Clock, ArrowRight, ExternalLink, ShieldCheck, Zap,
  Terminal, AlertTriangle, Layers, Play, CheckCircle, Video, Bot, Loader2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { formatISTTime, formatISTDateTime } from '../../utils/helpers'

export default function AutomaticIngestionModal({ onClose, onLoadRun, initialTab = 'google_meet' }) {
  const { user, api } = useAuth()

  const [activeTab, setActiveTab] = useState(initialTab) // 'google_meet' | 'stream' | 'docs' | 'sources'
  const [ingestions, setIngestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [testingIngest, setTestingIngest] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Google Meet Hands-Free Capture State
  const [meetUrl, setMeetUrl] = useState('')
  const [meetTitle, setMeetTitle] = useState('')
  const [contactName, setContactName] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [activeCapture, setActiveCapture] = useState(null)
  const [meetError, setMeetError] = useState(null)

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

  // Poll active Google Meet capture status until completed or failed
  useEffect(() => {
    let interval = null
    if (activeCapture && activeCapture.ingestion_id && !['completed', 'failed'].includes(activeCapture.status)) {
      interval = setInterval(async () => {
        try {
          const idToPoll = activeCapture.bot_id || activeCapture.ingestion_id
          const res = await api.get(`/workflows/meeting-intelligence/google-meet/status/${idToPoll}`)
          if (res) {
            setActiveCapture(prev => ({
              ...prev,
              status: res.status,
              instance_id: res.instance_id || prev?.instance_id,
              error_message: res.error_message,
              conversation_title: res.conversation_title || prev?.conversation_title,
              contact_name: res.contact_name || prev?.contact_name,
            }))
            if (res.status === 'completed' || res.status === 'failed') {
              loadIngestions()
            }
          }
        } catch (err) {
          console.error('Error polling Google Meet capture status:', err)
        }
      }, 3000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [activeCapture?.status, activeCapture?.ingestion_id, activeCapture?.bot_id])

  // Start Google Meet Capture
  const handleStartCapture = async (e) => {
    if (e) e.preventDefault()
    if (!meetUrl.trim()) {
      setMeetError('Google Meet URL is required.')
      return
    }

    if (!meetUrl.includes('meet.google.com/')) {
      setMeetError('Invalid meeting link. URL must contain meet.google.com (e.g. https://meet.google.com/abc-defg-hij).')
      return
    }

    setMeetError(null)
    setIsCapturing(true)
    try {
      const payload = {
        meeting_url: meetUrl.trim(),
        conversation_title: meetTitle.trim() || undefined,
        contact_name: contactName.trim() || undefined,
      }
      const res = await api.post('/workflows/meeting-intelligence/google-meet/capture', payload)
      setActiveCapture({
        ingestion_id: res.ingestion_id,
        bot_id: res.bot_id,
        status: res.status || 'waiting_for_bot',
        meeting_url: res.meeting_url || meetUrl,
        conversation_title: res.conversation_title,
        contact_name: res.contact_name,
        message: res.message,
      })
      await loadIngestions()
    } catch (err) {
      console.error('Failed to start Google Meet capture:', err)
      setMeetError(err?.response?.data?.detail || err?.message || 'Failed to dispatch meeting bot. Check RECALL_API_KEY.')
    } finally {
      setIsCapturing(false)
    }
  }

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
        conversation_title: `Live Test Ingestion (${formatISTTime(new Date())})`,
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
              Hands-free Google Meet bot capture and webhook streams automatically feeding Nodes 1 → 5
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
      <div className="flex items-center gap-2 pt-3 pb-3 border-b border-slate-100 dark:border-[#1a2336] text-xs flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('google_meet')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'google_meet'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182234]'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Google Meet Capture</span>
          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500 text-white uppercase tracking-wider">
            Hands-Free
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stream')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'stream'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#182234]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
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
          <Terminal className="w-3.5 h-3.5" />
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
          <Layers className="w-3.5 h-3.5" />
          <span>Supported Matrix</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">

        {/* ── TAB: Hands-Free Google Meet Capture ────────────────────────── */}
        {activeTab === 'google_meet' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-200/80 dark:border-violet-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50/80 dark:bg-[#182234] border border-purple-200/60 dark:border-purple-900/40 overflow-hidden shrink-0 shadow-xs p-1 flex items-center justify-center">
                    <img src="/robot.png" alt="Bot" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Hands-Free Google Meet Capture</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                        Recall.ai Bot
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Paste a Google Meet link. The meeting bot joins, records, transcribes, and runs Nodes 1 → 5 automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Advisory Consent & Security Notice (Requirements 11 & 12) */}
            <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11.5px] leading-relaxed space-y-1">
                <div className="font-bold">Participant Consent & Admission Protocol</div>
                <p>
                  The autonomous meeting bot (<strong>SMBFlow Notetaker</strong>) will request to join the Google Meet session.
                  Standard Google Meet admission controls apply: a meeting host or participant must admit the bot from the waiting room.
                  Please ensure that all meeting participants are informed and consent to audio recording and automated AI transcription.
                </p>
              </div>
            </div>

            {/* Capture Form */}
            <form onSubmit={handleStartCapture} className="p-4 rounded-2xl bg-slate-50 dark:bg-[#121826] border border-slate-200 dark:border-[#233048] space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Google Meet URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={meetUrl}
                    onChange={(e) => {
                      setMeetUrl(e.target.value)
                      if (meetError) setMeetError(null)
                    }}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    disabled={isCapturing}
                    className="w-full bg-white dark:bg-[#0b0f17] border border-slate-300 dark:border-[#233048] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                  />
                </div>
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Format: https://meet.google.com/xxx-yyyy-zzz (meeting code must be included)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Conversation Title <span className="text-slate-400 text-[10px] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={meetTitle}
                    onChange={(e) => setMeetTitle(e.target.value)}
                    placeholder="e.g. Q3 Pipeline Review"
                    disabled={isCapturing}
                    className="w-full bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-[#233048] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Contact Name <span className="text-slate-400 text-[10px] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                    disabled={isCapturing}
                    className="w-full bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-[#233048] rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Error display */}
              {meetError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{meetError}</div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-violet-500" />
                  <span>Uses RECALL_API_KEY connector</span>
                </span>

                <button
                  type="submit"
                  disabled={isCapturing || !meetUrl.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  {isCapturing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching Bot...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Google Meet Capture</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Active Capture Live Progress Display (Requirement 10) */}
            {activeCapture && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#1a2336]">
                  <div>
                    <h5 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Active Google Meet Capture</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {activeCapture.bot_id ? `(${activeCapture.bot_id})` : ''}
                      </span>
                    </h5>
                    <p className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                      {activeCapture.meeting_url}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {['completed', 'failed'].includes(activeCapture.status) && (
                      <button
                        type="button"
                        onClick={() => setActiveCapture(null)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* 5 Status Stages Display */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-1">
                  {/* Step 1: Waiting for bot */}
                  <div className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                    activeCapture.status === 'waiting_for_bot'
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                      : ['bot_joined', 'capturing', 'processing_transcript', 'processing', 'completed'].includes(activeCapture.status)
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-[#0b0f17] border-slate-200 dark:border-[#233048] text-slate-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Step 1</span>
                      {activeCapture.status === 'waiting_for_bot' ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      ) : ['bot_joined', 'capturing', 'processing_transcript', 'processing', 'completed'].includes(activeCapture.status) ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="font-semibold text-[11px]">Waiting for bot</div>
                    <div className="text-[9.5px] leading-tight opacity-80">
                      Bot requesting admission to meeting
                    </div>
                  </div>

                  {/* Step 2: Bot joined / capturing */}
                  <div className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                    ['bot_joined', 'capturing'].includes(activeCapture.status)
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                      : ['processing_transcript', 'processing', 'completed'].includes(activeCapture.status)
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-[#0b0f17] border-slate-200 dark:border-[#233048] text-slate-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Step 2</span>
                      {['bot_joined', 'capturing'].includes(activeCapture.status) ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      ) : ['processing_transcript', 'processing', 'completed'].includes(activeCapture.status) ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="font-semibold text-[11px]">Bot joined / capturing</div>
                    <div className="text-[9.5px] leading-tight opacity-80">
                      Recording live audio & conversation
                    </div>
                  </div>

                  {/* Step 3: Processing transcript */}
                  <div className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                    ['processing_transcript', 'processing'].includes(activeCapture.status)
                      ? 'bg-violet-50 dark:bg-violet-950/50 border-violet-300 dark:border-violet-600 text-violet-900 dark:text-violet-200 ring-2 ring-violet-500/20'
                      : activeCapture.status === 'completed'
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-[#0b0f17] border-slate-200 dark:border-[#233048] text-slate-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Step 3</span>
                      {['processing_transcript', 'processing'].includes(activeCapture.status) ? (
                        <Loader2 className="w-3.5 h-3.5 text-violet-600 animate-spin" />
                      ) : activeCapture.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="font-semibold text-[11px]">Processing transcript</div>
                    <div className="text-[9.5px] leading-tight opacity-80">
                      Executing Node 1 → Node 5 pipeline
                    </div>
                  </div>

                  {/* Step 4: Completed */}
                  <div className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                    activeCapture.status === 'completed'
                      ? 'bg-emerald-100/70 dark:bg-emerald-950/70 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30 font-bold'
                      : 'bg-slate-50 dark:bg-[#0b0f17] border-slate-200 dark:border-[#233048] text-slate-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Step 4</span>
                      {activeCapture.status === 'completed' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="text-[11px]">Completed</div>
                    <div className="text-[9.5px] leading-tight opacity-80 font-normal">
                      Pipeline finished successfully
                    </div>
                  </div>

                  {/* Step 5: Failed */}
                  <div className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                    activeCapture.status === 'failed'
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                      : 'bg-slate-50 dark:bg-[#0b0f17] border-slate-200 dark:border-[#233048] text-slate-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Status</span>
                      {activeCapture.status === 'failed' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <div className="font-semibold text-[11px]">
                      {activeCapture.status === 'failed' ? 'Failed' : 'Error state'}
                    </div>
                    <div className="text-[9.5px] leading-tight opacity-80 truncate">
                      {activeCapture.error_message || 'No errors reported'}
                    </div>
                  </div>
                </div>

                {/* Completed Action: View Run */}
                {activeCapture.status === 'completed' && activeCapture.instance_id && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium">
                        Meeting captured and all 5 nodes processed! Workflow Instance ID: <code className="font-mono text-[10.5px]">{activeCapture.instance_id.slice(0, 8)}...</code>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onLoadRun) onLoadRun(activeCapture.instance_id)
                        if (onClose) onClose()
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all text-xs"
                    >
                      <span>View Workflow Run</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Failed Action */}
                {activeCapture.status === 'failed' && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between flex-wrap gap-2 text-xs text-rose-800 dark:text-rose-300">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{activeCapture.error_message || 'Bot capture failed or meeting was cancelled.'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveCapture(null)}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs cursor-pointer"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
                          <span>{formatISTDateTime(item.received_at)}</span>
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
                <div className="p-3 rounded-xl bg-white dark:bg-[#121826] border border-emerald-300 dark:border-emerald-800 space-y-1 shadow-xs">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Google Meet Hands-Free Capture</span>
                    </span>
                    <span className="text-[9px] font-mono uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                      Recall.ai
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Autonomous meeting bot joins Google Meet, transcribes conversation, and automatically feeds the result into Nodes 1–5.
                  </p>
                </div>

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
