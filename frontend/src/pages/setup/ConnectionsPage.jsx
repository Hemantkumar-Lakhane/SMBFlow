import React, { useState, useEffect } from 'react'
import {
  Plug, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Settings, ShieldCheck,
  ExternalLink, Mail, Calendar, HardDrive, Sliders, Lock, Check, Info, Loader2, Terminal
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function ToolLogo({ name, className = 'w-5 h-5' }) {
  const [imgSrc, setImgSrc] = useState(() => {
    if (!name) return null
    if (name === 'sheets' || name === 'sheet') return '/assets/tools/sheet.png'
    if (name === 'google_workspace' || name === 'google_calendar') return '/assets/tools/calendar.png'
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
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3" fill="#4285F4" fillOpacity="0.2" stroke="#4285F4" strokeWidth="1.5" />
        <path d="M16 2V6M8 2V6M3 9H21" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="14" r="1.5" fill="#4285F4" />
      </svg>
    ),
    google_workspace: (
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
  }

  function handleError() {
    if (imgSrc === '/assets/tools/sheets.png') setImgSrc('/assets/tools/sheet.png')
    else if (imgSrc === '/assets/tools/sheet.png') setImgSrc('/assets/tools/sheets.png')
    else setUseFallback(true)
  }

  if (!useFallback && imgSrc) {
    return <img src={imgSrc} alt={name} className={`${className} object-contain`} onError={handleError} />
  }

  return svgFallbacks[name] || <Plug className={className} />
}

export default function ConnectionsPage() {
  const { user, api } = useAuth()
  const [available, setAvailable] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState(null)

  // Modals & Drawers
  const [connectModalTool, setConnectModalTool] = useState(null)
  const [googleConsentModal, setGoogleConsentModal] = useState(false)
  const [configModalConn, setConfigModalConn] = useState(null)
  const [capabilitiesModalConn, setCapabilitiesModalConn] = useState(null)
  const [devSetupModal, setDevSetupModal] = useState(false)

  // Google Scope Selection Form
  const [googleScopes, setGoogleScopes] = useState({
    email: true,
    calendar: true,
    drive: true,
  })

  // Form states
  const [fieldValues, setFieldValues] = useState({})
  const [configValues, setConfigValues] = useState({})
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // OAuth Processing state
  const [oauthProcessing, setOauthProcessing] = useState(false)
  const [oauthStatusMsg, setOauthStatusMsg] = useState('')
  const [successToast, setSuccessToast] = useState(null)

  useEffect(() => {
    loadData()
    handleOAuthCallback()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [availRes, connRes] = await Promise.all([
        api.get('/connections/available').catch(() => []),
        api.get('/connections').catch(() => []),
      ])
      setAvailable(availRes || [])
      setConnections(connRes || [])
    } catch (_) {
    } finally {
      setLoading(false)
    }
  }

  // Handle Google OAuth return callback
  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const error = urlParams.get('error')

    if (error) {
      setErrorMsg(`Google authorization was cancelled or failed: ${error}`)
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (code) {
      setOauthProcessing(true)
      setOauthStatusMsg('Exchanging authorization code with Google...')
      try {
        const redirectUri = window.location.origin + window.location.pathname
        const res = await api.post('/connections/oauth/google/exchange', {
          code,
          redirect_uri: redirectUri,
        })
        setOauthStatusMsg('Encrypting credentials in MultiFernet Vault and verifying health...')
        setSuccessToast(`Successfully connected Google Account (${res.connected_email || 'Verified'})!`)
        setTimeout(() => setSuccessToast(null), 6000)
        await loadData()
      } catch (err) {
        setErrorMsg(err.message || 'Failed to complete Google OAuth exchange.')
      } finally {
        setOauthProcessing(false)
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }
  }

  const handleTest = async (connId) => {
    setTestingId(connId)
    try {
      const res = await api.post(`/connections/${connId}/test`)
      if (res.success) {
        setSuccessToast(`Health check passed for ${res.tool_name || 'integration'}!`)
        setTimeout(() => setSuccessToast(null), 4000)
      } else {
        alert(`Connection test reported an issue: ${res.message || 'Provider unreachable'}`)
      }
      await loadData()
    } catch (err) {
      alert(`Connection test failed: ${err.message}`)
    } finally {
      setTestingId(null)
    }
  }

  // Trigger Connect Flow
  const handleOpenConnect = async (tool) => {
    setErrorMsg('')
    if (tool.tool_name === 'gmail' || tool.tool_name === 'google_workspace') {
      setSubmitting(true)
      try {
        const redirectUri = window.location.origin + window.location.pathname
        const queryParams = new URLSearchParams({
          redirect_uri: redirectUri,
          scopes: 'email,calendar,drive',
        }).toString()
        const res = await api.get(`/connections/oauth/google/authorize?${queryParams}`)

        if (res && res.url) {
          // Direct 1-Click Redirect to Google Consent Screen
          window.location.href = res.url
        } else {
          throw new Error('Google authorization URL was not returned by server.')
        }
      } catch (err) {
        setErrorMsg(err.message || 'Failed to initialize Google connection.')
        alert(err.message || 'Failed to initialize Google connection. Ensure backend is running.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    setConnectModalTool(tool)
    const initial = {}
    const fields = tool.required_fields || []
    fields.forEach(f => { initial[f] = '' })
    setFieldValues(initial)
  }

  // Developer Fast-Connect Simulation for local testing
  const handleDevSimulatedConnect = async () => {
    setSubmitting(true)
    setErrorMsg('')
    try {
      await api.post('/connections', {
        tool_name: 'gmail',
        display_name: 'Gmail / Email',
        credentials: {
          access_token: 'mock_local_dev_token_' + Date.now(),
          refresh_token: 'mock_refresh_token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        config: {
          connected_email: user?.email || 'dev.user@smbflow.local',
          sender_alias: user?.email || 'dev.user@smbflow.local',
          sender_name: user?.full_name || 'SMBFlow Coordinator',
          queue_for_approval: true,
          mode: 'development_simulated',
        },
      })
      setDevSetupModal(false)
      setSuccessToast('Local development Google connection enabled!')
      setTimeout(() => setSuccessToast(null), 5000)
      await loadData()
    } catch (err) {
      setErrorMsg(err.message || 'Simulation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConnectSubmit = async (e) => {
    e.preventDefault()
    if (!connectModalTool) return

    const missing = (connectModalTool.required_fields || []).filter(f => !fieldValues[f]?.trim())
    if (missing.length > 0) {
      setErrorMsg(`Required field(s) missing: ${missing.join(', ')}`)
      return
    }

    setSubmitting(true)
    setErrorMsg('')

    try {
      const credentials = {}
      const config = {}

      Object.entries(fieldValues).forEach(([k, v]) => {
        if (['sender_alias', 'cs_alerts_channel', 'sales_channel', 'base_url', 'pipeline_id'].includes(k)) {
          config[k] = v
        } else {
          credentials[k] = v
        }
      })

      await api.post('/connections', {
        tool_name: connectModalTool.tool_name,
        display_name: connectModalTool.display_name,
        credentials,
        config,
      })

      setConnectModalTool(null)
      setFieldValues({})
      setSuccessToast(`Connected ${connectModalTool.display_name}!`)
      setTimeout(() => setSuccessToast(null), 4000)
      await loadData()
    } catch (err) {
      setErrorMsg(err.message || 'Connection failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Provider Settings Configuration
  const handleOpenConfig = (conn) => {
    setConfigModalConn(conn)
    setErrorMsg('')
    setConfigValues(conn.config || {})
  }

  const handleSaveConfig = async (e) => {
    e.preventDefault()
    if (!configModalConn) return

    setSubmitting(true)
    setErrorMsg('')
    try {
      await api.patch(`/connections/${configModalConn.id}`, {
        config: configValues,
      })
      setConfigModalConn(null)
      setSuccessToast('Settings saved successfully!')
      setTimeout(() => setSuccessToast(null), 4000)
      await loadData()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update configuration')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisconnect = async (connId) => {
    if (!window.confirm('Disconnect this integration? Stored credentials and tokens will be permanently purged from the vault.')) return
    try {
      await api.delete(`/connections/${connId}`)
      setSuccessToast('Integration disconnected.')
      setTimeout(() => setSuccessToast(null), 4000)
      await loadData()
    } catch (err) {
      alert(`Disconnect failed: ${err.message}`)
    }
  }

  const getConnForTool = (toolName) => connections.find(c => c.tool_name === toolName)
  const allScopesSelected = googleScopes.email && googleScopes.calendar && googleScopes.drive

  const toggleSelectAll = () => {
    const nextVal = !allScopesSelected
    setGoogleScopes({
      email: nextVal,
      calendar: nextVal,
      drive: nextVal,
    })
  }

  if (loading && !oauthProcessing) {
    return (
      <div className="p-12 text-center text-gray-500 text-sm flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <span>Loading authenticated tool connections...</span>
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 min-h-full max-w-7xl mx-auto space-y-6 transition-colors">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{successToast}</span>
        </div>
      )}

      {/* OAuth Processing Banner */}
      {oauthProcessing && (
        <div className="bg-blue-600 text-white rounded-xl p-4 shadow-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-white animate-spin shrink-0" />
            <div>
              <p className="font-bold text-sm">Completing Google Connection</p>
              <p className="text-xs text-blue-100">{oauthStatusMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Tool Connections</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Establish authenticated tool connections, configure permission scopes, and manage AI agent execution capabilities.
        </p>
      </div>

      {/* Security Architecture Banner */}
      <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl p-4 shadow-2xs flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-[#182234] border border-blue-100 dark:border-[#233048] flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm">MultiFernet Vault Encryption & Policy Boundary</p>
            <p className="text-slate-500 dark:text-slate-400">API keys and OAuth tokens are AES-encrypted server-side. AI agents only receive granted scoped capabilities.</p>
          </div>
        </div>
      </div>

      {/* Grid of Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {available.map(tool => {
          const conn = getConnForTool(tool.tool_name)
          const isConnected = conn?.status === 'connected' || conn?.status === 'CONNECTED'
          const isError = conn?.status === 'error'
          const connectedEmail = conn?.config?.connected_email || user?.email

          return (
            <div
              key={tool.tool_name}
              className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-all"
            >
              <div>
                {/* Card Top */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] flex items-center justify-center shrink-0 p-1.5">
                      <ToolLogo name={tool.tool_name} className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">{tool.display_name}</h3>
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{tool.category || 'Integration'}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 border ${
                      isConnected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                        : isError
                        ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
                        : 'bg-slate-100 dark:bg-[#182234] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#233048]'
                    }`}
                  >
                    {isConnected ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ) : isError ? (
                      <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-slate-400" />
                    )}
                    {isConnected ? 'CONNECTED' : isError ? 'CONNECTION ERROR' : 'NOT CONNECTED'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2">{tool.description}</p>

                {/* Account Details if Connected */}
                {isConnected && (
                  <div className="mt-3 p-2.5 bg-slate-50 dark:bg-[#0b0f17] rounded-lg border border-slate-100 dark:border-[#1a2336] space-y-1">
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium flex items-center justify-between">
                      <span className="text-slate-400 dark:text-slate-500">Account:</span>
                      <span className="font-mono text-slate-900 dark:text-slate-200 text-[11px] truncate max-w-[200px]">{connectedEmail}</span>
                    </p>
                    {conn?.last_tested_at && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
                        <span>Verified:</span>
                        <span>{new Date(conn.last_tested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Capabilities Chips */}
              {tool.capabilities && tool.capabilities.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">
                    <span>Agent Permissions</span>
                    <button
                      onClick={() => setCapabilitiesModalConn(conn || { tool_name: tool.tool_name, display_name: tool.display_name, capabilities: tool.capabilities })}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldCheck className="w-3 h-3" /> View Scopes
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tool.capabilities.slice(0, 3).map(cap => (
                      <span key={cap.id} className="text-[11px] px-2 py-0.5 bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-[#233048]">
                        ✓ {cap.name}
                      </span>
                    ))}
                    {tool.capabilities.length > 3 && (
                      <span className="text-[11px] px-1.5 py-0.5 bg-slate-50 dark:bg-[#0b0f17] text-slate-400 rounded border border-slate-200 dark:border-[#233048]">
                        +{tool.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="pt-3 border-t border-slate-100 dark:border-[#233048] flex items-center gap-2">
                {isConnected || isError ? (
                  <>
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testingId === conn.id}
                      className="flex-1 py-1.5 px-2.5 border border-slate-200 dark:border-[#233048] hover:bg-slate-50 dark:hover:bg-[#182234] text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${testingId === conn.id ? 'animate-spin' : ''}`} />
                      {testingId === conn.id ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleOpenConfig(conn)}
                      className="py-1.5 px-2.5 border border-slate-200 dark:border-[#233048] hover:bg-slate-50 dark:hover:bg-[#182234] text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3 h-3 text-slate-500 dark:text-slate-400" /> Settings
                    </button>
                    <button
                      onClick={() => handleDisconnect(conn.id)}
                      className="py-1.5 px-2.5 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleOpenConnect(tool)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {tool.tool_name === 'gmail' || tool.tool_name === 'google_workspace' ? (
                      <>
                        <ToolLogo name={tool.tool_name} className="w-4 h-4" />
                        <span>Connect with Google</span>
                      </>
                    ) : (
                      <>
                        <ToolLogo name={tool.tool_name} className="w-4 h-4" />
                        <span>Connect Tool</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STANDARD TOOL CONNECT MODAL (API Keys for Slack, HubSpot, Stripe)   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {connectModalTool && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4 text-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Connect {connectModalTool.display_name}</h3>
              <button
                onClick={() => setConnectModalTool(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{connectModalTool.description}</p>

            <form onSubmit={handleConnectSubmit} className="space-y-4">
              {(connectModalTool.required_fields || ['api_key']).map(field => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type={field.includes('key') || field.includes('token') || field.includes('secret') ? 'password' : 'text'}
                    value={fieldValues[field] || ''}
                    onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
                    placeholder={`Enter ${field.replace(/_/g, ' ')}`}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              ))}

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{errorMsg}</p>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectModalTool(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {submitting ? 'Saving…' : 'Save Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PROVIDER SETTINGS CONFIGURATION MODAL                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {configModalConn && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4 text-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Configure {configModalConn.display_name} Settings</h3>
              <button onClick={() => setConfigModalConn(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Configure provider-specific behavior, default aliases, and notification channels.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              {configModalConn.tool_name === 'gmail' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sender Email Alias</label>
                    <input
                      type="email"
                      value={configValues.sender_alias || ''}
                      onChange={e => setConfigValues({ ...configValues, sender_alias: e.target.value })}
                      placeholder="cs@yourcompany.com"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sender Display Name</label>
                    <input
                      type="text"
                      value={configValues.sender_name || ''}
                      onChange={e => setConfigValues({ ...configValues, sender_name: e.target.value })}
                      placeholder="SMBFlow Coordinator"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-xs font-semibold text-gray-900">Queue Outbound Emails for Approval</p>
                      <p className="text-[11px] text-gray-500">Require human coordinator review before sending</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={configValues.queue_for_approval !== false}
                      onChange={e => setConfigValues({ ...configValues, queue_for_approval: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {configModalConn.tool_name === 'slack' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">CS Alerts Channel</label>
                    <input
                      type="text"
                      value={configValues.cs_alerts_channel || ''}
                      onChange={e => setConfigValues({ ...configValues, cs_alerts_channel: e.target.value })}
                      placeholder="#cs-alerts"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Sales Escalations Channel</label>
                    <input
                      type="text"
                      value={configValues.sales_channel || ''}
                      onChange={e => setConfigValues({ ...configValues, sales_channel: e.target.value })}
                      placeholder="#sales-escalations"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {configModalConn.tool_name === 'hubspot' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">HubSpot Pipeline ID</label>
                  <input
                    type="text"
                    value={configValues.pipeline_id || ''}
                    onChange={e => setConfigValues({ ...configValues, pipeline_id: e.target.value })}
                    placeholder="default_pipeline_id"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{errorMsg}</p>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigModalConn(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {submitting ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CAPABILITIES & ACCESS MANAGEMENT MODAL                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CAPABILITIES & ACCESS MANAGEMENT MODAL                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {capabilitiesModalConn && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-gray-100 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-gray-900">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm font-semibold">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">{capabilitiesModalConn.display_name}</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      Policy Boundary
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Enforced tool execution permissions for workflow agents</p>
                </div>
              </div>
              <button
                onClick={() => setCapabilitiesModalConn(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              {/* Security Policy Notice Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">MultiFernet Vault Encrypted:</span> Raw API keys & tokens are never exposed to agents or frontend. Agents only inherit scoped tool calls.
                </div>
              </div>

              {/* Capabilities List */}
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {(capabilitiesModalConn.capabilities || []).map(cap => {
                  const isApprovalRequired = cap.requires_hitl || cap.risk === 'high'
                  return (
                    <div
                      key={cap.id}
                      className="p-3.5 bg-white border border-gray-200/80 rounded-xl shadow-xs hover:border-blue-200 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-900">{cap.name}</span>
                          <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {cap.id}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-snug">{cap.desc}</p>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {isApprovalRequired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Approval Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Allowed
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {isApprovalRequired ? 'Human Guardrail' : 'Auto-Executed'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">
                {(capabilitiesModalConn.capabilities || []).length} capabilities active
              </span>
              <button
                onClick={() => setCapabilitiesModalConn(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



