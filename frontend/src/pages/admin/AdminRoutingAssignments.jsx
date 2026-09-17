// AdminRoutingAssignments — LLM Routing Configuration
// Data from: GET /api/v1/admin/routing
// PATCH /api/v1/admin/settings  (saves routing config under key "llm_routing")
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, XCircle, Save, AlertCircle, CheckCircle2, GitMerge } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const PROVIDER_OPTIONS = ['anthropic', 'openai', 'google_ai', 'groq', 'pollinations', '']

function ProviderSelect({ value, onChange, label }) {
  return (
    <div>
      {label && <p className="text-xs font-semibold text-slate-600 mb-1">{label}</p>}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
      >
        <option value="">— not set —</option>
        <option value="anthropic">Anthropic</option>
        <option value="openai">OpenAI</option>
        <option value="google_ai">Google AI (Gemini)</option>
        <option value="groq">Groq</option>
        <option value="pollinations">Pollinations AI</option>
      </select>
    </div>
  )
}

export default function AdminRoutingAssignments() {
  const { api } = useAuth()
  const [routing,  setRouting]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState('')

  // Editable defaults
  const [defaults, setDefaults] = useState({
    primary_provider:  '',
    fallback_provider: '',
    image_provider:    '',
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await api.get('/admin/routing')
      setRouting(d)
      if (d?.current_defaults) {
        setDefaults({
          primary_provider:  d.current_defaults.primary_provider  || '',
          fallback_provider: d.current_defaults.fallback_provider || '',
          image_provider:    d.current_defaults.image_provider    || '',
        })
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load routing config')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null); setSuccess('')
    try {
      const payload = {
        ...routing,
        current_defaults: defaults,
        note: null,
      }
      await api.patch('/admin/settings', { settings: { llm_routing: payload } })
      setSuccess('Routing configuration saved.')
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const hierarchy = routing?.hierarchy || []

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Routing</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure which AI providers handle platform-wide requests. More specific assignments override these defaults.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={save} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle size={14} className="shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 size={14} className="shrink-0" />{success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Assignment hierarchy */}
          {hierarchy.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <GitMerge size={15} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900">Assignment Hierarchy</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-3">
                {hierarchy.map((h, i) => (
                  <span key={h.level} className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">{h.label}</span>
                    {i < hierarchy.length - 1 && <span className="text-slate-300">›</span>}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {hierarchy.map(h => (
                  <div key={h.level} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600 min-w-[160px]">{h.label}:</span>
                    <span>{h.description}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                <AlertCircle size={13} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  The most specific valid configuration applies. A workflow override takes precedence over an agent assignment, which takes precedence over the task default.
                </p>
              </div>
            </div>
          )}

          {/* Platform defaults editor */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Platform Default Providers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ProviderSelect
                label="Primary LLM Provider"
                value={defaults.primary_provider}
                onChange={v => setDefaults(d => ({ ...d, primary_provider: v }))}
              />
              <ProviderSelect
                label="Fallback LLM Provider"
                value={defaults.fallback_provider}
                onChange={v => setDefaults(d => ({ ...d, fallback_provider: v }))}
              />
              <ProviderSelect
                label="Image Generation Provider"
                value={defaults.image_provider}
                onChange={v => setDefaults(d => ({ ...d, image_provider: v }))}
              />
            </div>
            {routing?.note && (
              <p className="text-xs text-slate-400 mt-3 italic">{routing.note}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
