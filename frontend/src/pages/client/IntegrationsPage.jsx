// frontend/src/pages/client/IntegrationsPage.jsx
// Matches Figma: Integrations — connect SMBFlow to existing business systems

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plug, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const INTEGRATION_CATALOG = [
  { id: 'crm',        name: 'CRM System',        category: 'CRM',              desc: 'Sync contacts, leads, and opportunities.' },
  { id: 'billing',    name: 'Billing Platform',   category: 'Finance',          desc: 'Access invoice and payment data.' },
  { id: 'support',    name: 'Support Desk',       category: 'Customer Support', desc: 'Connect support tickets and interactions.' },
  { id: 'email',      name: 'Email Provider',     category: 'Communication',    desc: 'Send automated emails from workflows.' },
  { id: 'slack',      name: 'Slack',              category: 'Communication',    desc: 'Post notifications to Slack channels.' },
  { id: 'erp',        name: 'ERP System',         category: 'Operations',       desc: 'Connect operational and procurement data.' },
  { id: 'storage',    name: 'File Storage',       category: 'Storage',          desc: 'Access documents and files from cloud storage.' },
  { id: 'webhooks',   name: 'Webhooks',           category: 'API',              desc: 'Send and receive HTTP events from external systems.' },
]

const TABS = ['All','Connected','Available']

// ── Connect Modal ─────────────────────────────────────────────────────────────
function ConnectModal({ integration, open, onClose, tenantId, api, onDone }) {
  const [apiKey, setApiKey]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    if (!apiKey.trim()) { setError('API key is required'); return }
    setLoading(true); setError('')
    try {
      await api.post('/credentials', {
        tenant_id:    tenantId,
        tool_name:    integration.id,
        display_name: integration.name,
        credentials:  { api_key: apiKey },
      })
      onDone(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!open || !integration) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Connect {integration.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">{integration.desc}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key / Credentials</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Enter your API key"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submit} disabled={loading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {loading ? 'Connecting…' : 'Connect'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Integration Card ──────────────────────────────────────────────────────────
function IntegrationCard({ integration, connected, onConnect, onDisconnect }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Plug className="w-4 h-4 text-gray-500" />
        </div>
        <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
          connected
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-gray-50 text-gray-500 border-gray-200'
        }`}>
          {connected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900">{integration.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{integration.category}</p>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed flex-1">{integration.desc}</p>

      <button
        onClick={() => connected ? onDisconnect(integration) : onConnect(integration)}
        className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors ${
          connected
            ? 'border border-red-200 text-red-600 hover:bg-red-50'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { user, api } = useAuth()
  const tenantId = user?.tenant_id

  const [tab,         setTab]         = useState('All')
  const [creds,       setCreds]       = useState([])
  const [connecting,  setConnecting]  = useState(null)  // integration obj
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    try {
      const c = await api.get('/credentials').catch(() => [])
      setCreds(Array.isArray(c) ? c : [])
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])

  const connectedIds = new Set(creds.map(c => c.tool_name))

  const filtered = INTEGRATION_CATALOG.filter(i => {
    if (tab === 'Connected') return connectedIds.has(i.id)
    if (tab === 'Available') return !connectedIds.has(i.id)
    return true
  })

  const handleDisconnect = async (integration) => {
    const cred = creds.find(c => c.tool_name === integration.id)
    if (!cred) return
    try { await api.delete(`/credentials/${cred.id}`); load() } catch { /* ignore */ }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect SMBFlow to your existing business systems</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-full p-1 w-fit mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(i => (
            <IntegrationCard
              key={i.id}
              integration={i}
              connected={connectedIds.has(i.id)}
              onConnect={setConnecting}
              onDisconnect={handleDisconnect}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-4 text-center py-12 text-gray-400 text-sm">
              No {tab.toLowerCase()} integrations
            </div>
          )}
        </div>
      )}

      <ConnectModal
        integration={connecting}
        open={!!connecting}
        onClose={() => setConnecting(null)}
        tenantId={tenantId}
        api={api}
        onDone={load}
      />
    </div>
  )
}
