import React, { useState, useEffect } from 'react'
import {
  Plug, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Settings, ShieldCheck,
  ExternalLink, Mail, Sliders, Lock, Check
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
  const [configModalConn, setConfigModalConn] = useState(null)
  const [capabilitiesModalConn, setCapabilitiesModalConn] = useState(null)

  // Form states
  const [fieldValues, setFieldValues] = useState({})
  const [configValues, setConfigValues] = useState({})
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
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

  const handleTest = async (connId) => {
    setTestingId(connId)
    try {
      await api.post(`/connections/${connId}/test`)
      await loadData()
    } catch (err) {
      alert(`Connection test failed: ${err.message}`)
    } finally {
      setTestingId(null)
    }
  }

  // Initial Connection Trigger (OAuth or API Key)
  const handleOpenConnect = (tool) => {
    setConnectModalTool(tool)
    setErrorMsg('')
    const initial = {}
    const fields = tool.required_fields || []
    fields.forEach(f => { initial[f] = '' })
    setFieldValues(initial)
  }

  const handleConnectSubmit = async (e) => {
    e.preventDefault()
    if (!connectModalTool) return

    const isOAuth = connectModalTool.auth_type === 'oauth2' || (connectModalTool.required_fields || []).length === 0

    if (!isOAuth) {
      const missing = (connectModalTool.required_fields || []).filter(f => !fieldValues[f]?.trim())
      if (missing.length > 0) {
        setErrorMsg(`Required field(s) missing: ${missing.join(', ')}`)
        return
      }
    }

    setSubmitting(true)
    setErrorMsg('')

    try {
      const credentials = {}
      const config = {}

      Object.entries(fieldValues).forEach(([k, v]) => {
        if (['sender_alias', 'cs_alerts_channel', 'base_url'].includes(k)) {
          config[k] = v
        } else {
          credentials[k] = v
        }
      })

      if (isOAuth) {
        config.connected_email = user?.email || 'authenticated_user'
      }

      await api.post('/connections', {
        tool_name: connectModalTool.tool_name,
        display_name: connectModalTool.display_name,
        credentials,
        config,
      })

      setConnectModalTool(null)
      setFieldValues({})
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
      await loadData()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update configuration')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisconnect = async (connId) => {
    if (!window.confirm('Disconnect this integration? Stored tokens and credentials will be permanently removed.')) return
    try {
      await api.delete(`/connections/${connId}`)
      await loadData()
    } catch (err) {
      alert(`Disconnect failed: ${err.message}`)
    }
  }

  const getConnForTool = (toolName) => connections.find(c => c.tool_name === toolName)

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        Loading tool connections...
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tool Connections</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Establish authenticated tool connections, configure settings, and manage capability permissions for agents.
        </p>
      </div>

      {/* Connection Architecture Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between text-xs text-gray-600 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">MultiFernet Vault Encryption & Policy Boundary</p>
            <p className="text-gray-500">Credentials remain backend-only. Workflow agents inherit strictly granted tool capabilities.</p>
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
                      <Plug className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{tool.display_name}</h3>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{tool.category || 'Integration'}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 border ${
                      isConnected
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : isError
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {isConnected ? (
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
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
                      <span className="text-gray-400">Connected account:</span>
                      <span className="font-mono text-gray-900">{connectedEmail}</span>
                    </p>
                    {conn?.last_tested_at && (
                      <p className="text-[11px] text-gray-400 flex items-center justify-between">
                        <span>Last verified:</span>
                        <span>{new Date(conn.last_tested_at).toLocaleString()}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Capabilities Chips */}
              {tool.capabilities && tool.capabilities.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    <span>Capabilities</span>
                    <button
                      onClick={() => setCapabilitiesModalConn(conn || { tool_name: tool.tool_name, display_name: tool.display_name, capabilities: tool.capabilities })}
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3 h-3" /> Manage Access
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
                      <Sliders className="w-3 h-3 text-gray-500" /> Configure
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
                    {tool.auth_type === 'oauth2' ? (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        Connect with Google
                      </>
                    ) : (
                      'Connect Tool'
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* INITIAL CONNECT MODAL */}
      {connectModalTool && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-6 max-w-md w-full space-y-4 text-gray-900">
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
              {connectModalTool.auth_type === 'oauth2' || (connectModalTool.required_fields || []).length === 0 ? (
                <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-lg space-y-3 text-center">
                  <p className="text-xs text-gray-700">
                    Authenticate securely with your provider account. Tokens will be encrypted and refreshed backend-side.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    {submitting ? 'Authenticating…' : `Connect ${connectModalTool.display_name}`}
                  </button>
                </div>
              ) : (
                (connectModalTool.required_fields || ['api_key']).map(field => (
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
                ))
              )}

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
                {connectModalTool.auth_type !== 'oauth2' && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    {submitting ? 'Saving…' : 'Save Connection'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROVIDER SETTINGS CONFIGURATION MODAL */}
      {configModalConn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-6 max-w-md w-full space-y-4 text-gray-900">
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
                      placeholder="Patient Care Team"
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

      {/* CAPABILITIES & ACCESS MANAGEMENT MODAL */}
      {capabilitiesModalConn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-6 max-w-lg w-full space-y-4 text-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-gray-900">{capabilitiesModalConn.display_name} Capabilities</h3>
              </div>
              <button onClick={() => setCapabilitiesModalConn(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Specific tools exposed by this provider connection. Workflow agents inherit strictly granted capability permissions.
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {(capabilitiesModalConn.capabilities || []).map(cap => (
                <div key={cap.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-gray-900">{cap.name}</span>
                      <span className="font-mono text-[10px] text-gray-400">({cap.id})</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{cap.desc}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${
                    cap.requires_hitl || cap.risk === 'high'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-green-50 text-green-700 border-green-200'
                  }`}>
                    {cap.requires_hitl ? 'Approval Required' : 'Allowed'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCapabilitiesModalConn(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


