import React, { useState, useEffect } from 'react'
import {
  Plug, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Settings, ShieldCheck,
  ExternalLink, Mail, Calendar, HardDrive, Sliders, Lock, Check, Info, Loader2, Sparkles
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

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
    <div className="p-6 bg-gray-50 min-h-full max-w-7xl mx-auto space-y-6">
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
            <Loader2 className="w-5 h-5 text-white animate-spin flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Completing Google Connection</p>
              <p className="text-xs text-blue-100">{oauthStatusMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tool Connections</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Establish authenticated tool connections, configure permission scopes, and manage AI agent execution capabilities.
        </p>
      </div>

      {/* Security Architecture Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between text-xs text-gray-600 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">MultiFernet Vault Encryption & Policy Boundary</p>
            <p className="text-gray-500">API keys and OAuth tokens are AES-encrypted server-side. AI agents only receive granted scoped capabilities.</p>
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
              className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-gray-300 transition-all"
            >
              <div>
                {/* Card Top */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                      {tool.tool_name === 'gmail' ? (
                        <Mail className="w-4.5 h-4.5 text-blue-600" />
                      ) : tool.tool_name === 'google_workspace' ? (
                        <Calendar className="w-4.5 h-4.5 text-blue-600" />
                      ) : (
                        <Plug className="w-4.5 h-4.5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{tool.display_name}</h3>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{tool.category || 'Integration'}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 border ${
                      isConnected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : isError
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {isConnected ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    ) : isError ? (
                      <AlertTriangle className="w-3 h-3 text-red-600" />
                    ) : (
                      <XCircle className="w-3 h-3 text-gray-400" />
                    )}
                    {isConnected ? 'CONNECTED' : isError ? 'CONNECTION ERROR' : 'NOT CONNECTED'}
                  </span>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed mt-2">{tool.description}</p>

                {/* Account Details if Connected */}
                {isConnected && (
                  <div className="mt-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
                    <p className="text-xs text-gray-700 font-medium flex items-center justify-between">
                      <span className="text-gray-400">Account:</span>
                      <span className="font-mono text-gray-900 text-[11px] truncate max-w-[200px]">{connectedEmail}</span>
                    </p>
                    {conn?.last_tested_at && (
                      <p className="text-[11px] text-gray-400 flex items-center justify-between">
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
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    <span>Agent Permissions</span>
                    <button
                      onClick={() => setCapabilitiesModalConn(conn || { tool_name: tool.tool_name, display_name: tool.display_name, capabilities: tool.capabilities })}
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3 h-3" /> View Scopes
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tool.capabilities.slice(0, 3).map(cap => (
                      <span key={cap.id} className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200">
                        ✓ {cap.name}
                      </span>
                    ))}
                    {tool.capabilities.length > 3 && (
                      <span className="text-[11px] px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded border border-gray-200">
                        +{tool.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="pt-3 border-t border-gray-100 flex items-center gap-2">
                {isConnected || isError ? (
                  <>
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testingId === conn.id}
                      className="flex-1 py-1.5 px-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${testingId === conn.id ? 'animate-spin' : ''}`} />
                      {testingId === conn.id ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleOpenConfig(conn)}
                      className="py-1.5 px-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Sliders className="w-3 h-3 text-gray-500" /> Settings
                    </button>
                    <button
                      onClick={() => handleDisconnect(conn.id)}
                      className="py-1.5 px-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleOpenConnect(tool)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {tool.tool_name === 'gmail' || tool.tool_name === 'google_workspace' ? (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.7 1.7 7.5l3.7 2.8C6.3 7.3 8.9 5 12 5z" />
                          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                          <path fill="#FBBC05" d="M5.4 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.7 7.3C.6 9.5 0 11.9 0 14.4s.6 4.9 1.7 7.1l3.7-6.8z" />
                          <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.7-2.3-6.6-5.3L1.7 15.8C3.5 19.6 7.4 23 12 23z" />
                        </svg>
                        <span>Connect with Google</span>
                      </>
                    ) : (
                      <span>Connect Tool</span>
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



