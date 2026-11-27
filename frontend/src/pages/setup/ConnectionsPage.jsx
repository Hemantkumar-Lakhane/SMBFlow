/**
 * Integrations & Tool Connections
 * Clean, categorized integration hub with real-time OAuth 2.0 consent flows,
 * live API key verification, and per-tool connection health testing.
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, MoreVertical, X, CheckCircle2, AlertCircle, Loader2,
  ShieldCheck, LogOut, ExternalLink, RefreshCw, KeyRound
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import ToolLogo from '../../components/common/ToolLogo'

const CATEGORY_META = [
  {
    key: 'Google Workspace',
    title: 'Google Workspace',
    subtitle: 'Connect Gmail, Calendar, Drive, Docs, Sheets, Slides, Meet, Tasks, Contacts, Forms, YouTube, and Analytics.',
  },
  {
    key: 'AI & Models',
    title: 'AI & Models',
    subtitle: 'Connect LLM API keys for workflow reasoning, extraction, and multimodal agents.',
  },
  {
    key: 'Messaging & Collaboration',
    title: 'Messaging & Collaboration',
    subtitle: 'Send real-time alerts, human-in-the-loop approvals, and customer updates.',
  },
  {
    key: 'CRM, Billing & Operations',
    title: 'CRM, Billing & Operations',
    subtitle: 'Sync leads, payments, meeting bots, and live web research.',
  },
]

const handledOAuthCodes = new Set()

export default function ConnectionsPage() {
  const { api } = useAuth()
  const [available, setAvailable] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [viewMode, setViewMode] = useState('discover') // 'discover' | 'connected'
  const [searchQuery, setSearchQuery] = useState('')

  // Detail / Connect Modal
  const [selectedTool, setSelectedTool] = useState(null)
  const [modalTab, setModalTab] = useState('overview') // 'overview' | 'accounts'
  const [fieldValues, setFieldValues] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [testingId, setTestingId] = useState(null)
  const [modalFeedback, setModalFeedback] = useState(null) // { type: 'success'|'error', text: string }

  // Page-level feedback
  const [toast, setToast] = useState(null) // { type: 'success'|'error', text: string }
  const [oauthProcessing, setOauthProcessing] = useState(false)

  useEffect(() => {
    loadData()
    handleOAuthCallback()
  }, [])

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 5000)
  }

  const loadData = async (forceRefresh = false) => {
    setLoading(true)
    try {
      const [availRes, connRes] = await Promise.all([
        api.get('/connections/available').catch(() => []),
        api.get(forceRefresh ? '/connections?refresh=true' : '/connections').catch(() => []),
      ])
      setAvailable(availRes || [])
      setConnections(connRes || [])
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')
    const error = urlParams.get('error')

    if (error) {
      showToast('error', `Google authorization was cancelled: ${error}`)
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (code) {
      if (handledOAuthCodes.has(code)) return
      handledOAuthCodes.add(code)
      const redirectUri = window.location.origin + window.location.pathname
      // Strip OAuth params immediately so React 18 StrictMode double-mount never replays the single-use code
      window.history.replaceState({}, document.title, window.location.pathname)
      setOauthProcessing(true)
      try {
        const res = await api.post('/connections/oauth/google/exchange', {
          code,
          redirect_uri: redirectUri,
          state: state || undefined,
        })
        showToast('success', res.message || `Connected ${res.display_name || 'Google'} (${res.connected_email || 'Verified'})`)
        await loadData(true)
      } catch (err) {
        showToast('error', err.message || 'Failed to complete Google OAuth exchange.')
      } finally {
        setOauthProcessing(false)
      }
    }
  }

  const getConnForTool = (toolName) =>
    connections.find((c) => c.tool_name?.toLowerCase() === toolName?.toLowerCase())

  const openToolModal = (tool, initialTab = 'overview') => {
    setSelectedTool(tool)
    setModalTab(initialTab)
    setModalFeedback(null)
    const initial = {}
    ;(tool.required_fields || []).forEach((f) => {
      initial[f] = ''
    })
    setFieldValues(initial)
  }

  const startGoogleOAuth = async (tool) => {
    setSubmitting(true)
    setModalFeedback(null)
    try {
      const redirectUri = window.location.origin + window.location.pathname
      const queryParams = new URLSearchParams({
        redirect_uri: redirectUri,
        tool_name: tool.tool_name,
      }).toString()
      const res = await api.get(`/connections/oauth/google/authorize?${queryParams}`)
      if (res && res.url) {
        window.location.href = res.url
      } else {
        throw new Error('Google authorization URL was not returned.')
      }
    } catch (err) {
      setModalFeedback({ type: 'error', text: err.message || 'Failed to start Google OAuth.' })
      setSubmitting(false)
    }
  }

  const handleApiKeySubmit = async (e) => {
    e.preventDefault()
    if (!selectedTool) return
    setSubmitting(true)
    setModalFeedback(null)
    try {
      const res = await api.post('/connections', {
        tool_name: selectedTool.tool_name,
        display_name: selectedTool.display_name,
        credentials: fieldValues,
        config: {},
      })
      setFieldValues({})
      setModalFeedback({
        type: 'success',
        text: res?.config?.last_verify_message || `Connected and verified ${selectedTool.display_name}!`,
      })
      await loadData()
    } catch (err) {
      setModalFeedback({ type: 'error', text: err.message || 'Verification failed. Check your key and try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleTestConnection = async (connId) => {
    setTestingId(connId)
    setModalFeedback(null)
    try {
      const res = await api.post(`/connections/${connId}/test`)
      if (res && res.success) {
        setModalFeedback({
          type: 'success',
          text: res.message || 'Connection verified in real time!',
          items: res.details?.preview_items || [],
          rows: res.details?.preview_rows || [],
          externalUrl: res.details?.external_url || null,
          externalLabel: res.details?.external_label || 'Open',
        })
        await loadData(true)
      } else {
        setModalFeedback({ type: 'error', text: res?.message || 'Health check failed. Please reconnect.' })
        await loadData(true)
      }
    } catch (err) {
      setModalFeedback({ type: 'error', text: err.message || 'Health check failed.' })
    } finally {
      setTestingId(null)
    }
  }

  const handleDisconnect = async (connId, displayName) => {
    setSubmitting(true)
    setModalFeedback(null)
    try {
      await api.delete(`/connections/${connId}`)
      setModalFeedback({ type: 'success', text: `Signed out of ${displayName}.` })
      await loadData(true)
    } catch (err) {
      setModalFeedback({ type: 'error', text: err.message || 'Failed to sign out.' })
    } finally {
      setSubmitting(false)
    }
  }

  const connectedCount = useMemo(() => {
    const availableNames = new Set(available.map((t) => t.tool_name))
    return connections.filter((c) => c.status === 'connected' && availableNames.has(c.tool_name)).length
  }, [available, connections])

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return available.filter((tool) => {
      if (viewMode === 'connected') {
        const c = getConnForTool(tool.tool_name)
        if (!c || c.status !== 'connected') return false
      }
      if (!q) return true
      return (
        tool.display_name?.toLowerCase().includes(q) ||
        tool.description?.toLowerCase().includes(q) ||
        tool.category?.toLowerCase().includes(q) ||
        tool.tool_name?.toLowerCase().includes(q)
      )
    })
  }, [available, connections, viewMode, searchQuery])

  const sections = useMemo(() => {
    return CATEGORY_META.map((cat) => ({
      ...cat,
      tools: filteredTools.filter((t) => t.category === cat.key),
    })).filter((sec) => sec.tools.length > 0)
  }, [filteredTools])

  const selectedConn = selectedTool ? getConnForTool(selectedTool.tool_name) : null
  const isSelectedConnected = selectedConn?.status === 'connected'

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0d1017] text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-7">

        {/* ── Top Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Integrations
          </h1>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-full bg-slate-200/80 dark:bg-[#161b26] border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('discover')}
                className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'discover'
                    ? 'bg-white dark:bg-[#252b3b] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Discover
              </button>
              <button
                type="button"
                onClick={() => setViewMode('connected')}
                className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'connected'
                    ? 'bg-white dark:bg-[#252b3b] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Connected{connectedCount > 0 ? ` (${connectedCount})` : ''}
              </button>
            </div>

            <button
              type="button"
              onClick={() => loadData(true)}
              title="Refresh & verify all connections"
              className="p-2 rounded-full bg-white dark:bg-[#161b26] border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Search Bar ─────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search integrations..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#141821] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500/60 transition-colors"
          />
        </div>

        {/* ── OAuth Processing / Toast Banners ───────────────────────────── */}
        {oauthProcessing && (
          <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-200 text-xs flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Completing Google OAuth verification and storing encrypted credentials...</span>
          </div>
        )}

        {toast && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{toast.text}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Categorized Sections ────────────────────────────────────────── */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span>Loading integrations...</span>
          </div>
        ) : sections.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {viewMode === 'connected' ? 'No connected integrations yet' : 'No matching integrations found'}
            </p>
            <p className="text-xs text-slate-400">
              {viewMode === 'connected'
                ? 'Switch to Discover to connect Google Workspace, AI models, or messaging tools.'
                : 'Try a different search term.'}
            </p>
          </div>
        ) : (
          <div className="space-y-9">
            {sections.map((section) => (
              <section key={section.key} className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {section.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {section.subtitle}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  {section.tools.map((tool) => {
                    const conn = getConnForTool(tool.tool_name)
                    const isConnected = conn?.status === 'connected'
                    const hasError = conn?.status === 'error'

                    return (
                      <div
                        key={tool.tool_name}
                        onClick={() => openToolModal(tool, isConnected ? 'accounts' : 'overview')}
                        className="group flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-white dark:hover:bg-[#151922] border border-transparent hover:border-slate-200/80 dark:hover:border-white/10 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                            <ToolLogo name={tool.tool_name} className="w-8 h-8" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {tool.display_name}
                              </h3>
                              {isConnected && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Connected
                                </span>
                              )}
                              {hasError && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                                  Reconnect
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {tool.description}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openToolModal(tool, 'accounts')
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                          title={isConnected ? 'Manage connection' : 'Connect'}
                        >
                          {isConnected ? (
                            <MoreVertical className="w-4 h-4" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Integration Detail & Auth Modal ──────────────────────────────── */}
      {selectedTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedTool(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <ToolLogo name={selectedTool.tool_name} className="w-9 h-9" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {selectedTool.display_name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedTool.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Workflow Examples Box (plain bullets, no repeated logos) */}
            {selectedTool.examples && selectedTool.examples.length > 0 && (
              <ul className="mx-6 mb-4 px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#191d27] border border-slate-200/70 dark:border-white/5 space-y-1.5 list-disc list-inside">
                {selectedTool.examples.map((ex, idx) => (
                  <li key={idx} className="text-xs text-slate-600 dark:text-slate-300">
                    {ex}
                  </li>
                ))}
              </ul>
            )}

            {/* Modal Tabs */}
            <div className="px-6 flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
              <button
                type="button"
                onClick={() => setModalTab('overview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  modalTab === 'overview'
                    ? 'bg-slate-200/80 dark:bg-white/10 text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setModalTab('accounts')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  modalTab === 'accounts'
                    ? 'bg-slate-200/80 dark:bg-white/10 text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Account & Permissions
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {modalFeedback && (
                <div
                  className={`rounded-xl border text-xs overflow-hidden ${
                    modalFeedback.type === 'success'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300'
                  }`}
                >
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {modalFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span className="font-medium truncate">{modalFeedback.text}</span>
                    </div>
                    {modalFeedback.externalUrl && (
                      <a
                        href={modalFeedback.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        <span>{modalFeedback.externalLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {modalFeedback.rows && modalFeedback.rows.length > 0 ? (
                    <div className="bg-white dark:bg-[#11151d] border-t border-emerald-200/70 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                      {modalFeedback.rows.map((row, i) => (
                        <a
                          key={i}
                          href={row.url || modalFeedback.externalUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {row.subtitle || row.title}
                            </span>
                            {row.meta && (
                              <span className="text-[10px] text-slate-400 shrink-0">{row.meta}</span>
                            )}
                          </div>
                          {row.subtitle && (
                            <div className="text-[11px] text-slate-700 dark:text-slate-200 truncate">
                              {row.title}
                            </div>
                          )}
                          {row.snippet && (
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {row.snippet}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  ) : modalFeedback.items && modalFeedback.items.length > 0 ? (
                    <ul className="px-3.5 pb-2.5 pl-8 space-y-0.5 text-[11px] opacity-90 list-disc">
                      {modalFeedback.items.map((item, i) => (
                        <li key={i} className="truncate">{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}

              {modalTab === 'overview' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Capabilities enabled for your workflows
                    </h4>
                    <div className="space-y-2">
                      {(selectedTool.capabilities || []).map((cap) => (
                        <div
                          key={cap.id}
                          className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#191d27] border border-slate-200/70 dark:border-white/5"
                        >
                          <div>
                            <p className="text-xs font-medium text-slate-900 dark:text-white">{cap.name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{cap.desc}</p>
                          </div>
                          {cap.requires_hitl && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                              Approval Required
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setModalTab('accounts')}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      {isSelectedConnected ? 'Manage Connection' : 'Configure & Connect'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Credentials are encrypted with MultiFernet in your organization vault and only sent to the authorized domains below.
                  </p>

                  {/* Auth & Scopes Card */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#191d27] border border-slate-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {selectedTool.oauth_provider === 'google' ? 'Google OAuth' : selectedTool.display_name}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          · {isSelectedConnected ? 'Connected' : selectedConn?.status === 'reauth_required' ? 'Session expired' : 'Not connected'}
                        </span>
                      </div>
                    </div>

                    {selectedTool.domains && selectedTool.domains.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Domains: </span>
                        {selectedTool.domains.join(', ')}
                      </div>
                    )}

                    {selectedTool.oauth_scopes && selectedTool.oauth_scopes.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                        <div className="font-medium text-slate-600 dark:text-slate-300">Scopes:</div>
                        <div className="pl-2 space-y-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all">
                          {selectedTool.oauth_scopes.map((s) => (
                            <div key={s}>{s}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Connected Account Bar (only when real auth exists) */}
                    {selectedConn && isSelectedConnected ? (
                      <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                            {selectedTool.oauth_provider === 'google'
                              ? (selectedConn.account_email || selectedConn.config?.connected_email || 'Authorized Google Account')
                              : (selectedConn.config?.last_verify_message || 'Verified API Key')}
                          </div>
                          {selectedConn.last_tested_at && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Verified {new Date(selectedConn.last_tested_at).toLocaleString()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={testingId === selectedConn.id}
                            onClick={() => handleTestConnection(selectedConn.id)}
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-[#232836] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1.5 cursor-pointer"
                          >
                            {testingId === selectedConn.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>Test</span>
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleDisconnect(selectedConn.id, selectedTool.display_name)}
                            className="px-2.5 py-1 rounded-md bg-white dark:bg-[#232836] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    ) : selectedTool.oauth_provider === 'google' ? (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedConn?.status === 'reauth_required'
                            ? 'OAuth session expired. Reconnect to continue.'
                            : 'No Google account authorized yet.'}
                        </span>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => startGoogleOAuth(selectedTool)}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-60 shrink-0"
                        >
                          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Connect with Google</span>
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleApiKeySubmit} className="pt-2 space-y-3 border-t border-slate-200 dark:border-white/10">
                        {(selectedTool.required_fields || ['api_key']).map((f) => (
                          <div key={f} className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 capitalize flex items-center gap-1.5">
                              <KeyRound className="w-3 h-3 text-slate-400" />
                              <span>{f.replace(/_/g, ' ')}</span>
                            </label>
                            <input
                              type={f.includes('key') || f.includes('secret') || f.includes('token') ? 'password' : 'text'}
                              value={fieldValues[f] || ''}
                              onChange={(e) => setFieldValues((prev) => ({ ...prev, [f]: e.target.value }))}
                              required
                              placeholder={`Paste ${f.replace(/_/g, ' ')}...`}
                              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0f1219] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                            />
                          </div>
                        ))}
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={submitting}
                            className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-60"
                          >
                            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>Verify & Connect</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
