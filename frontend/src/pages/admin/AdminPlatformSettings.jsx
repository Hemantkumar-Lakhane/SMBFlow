// AdminPlatformSettings — Platform-wide configuration
// Data from: GET /api/v1/admin/settings
// Save via:  PATCH /api/v1/admin/settings
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Save, XCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">{title}</h2>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const inputCls  = "border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
const selectCls = inputCls

export default function AdminPlatformSettings() {
  const { api } = useAuth()

  const [settings, setSettings] = useState({})   // raw from API
  const [form, setForm] = useState({
    platform_name:          'SMBFlow',
    environment:            'development',
    timezone:               'UTC',
    require_mfa:            false,
    session_timeout_minutes: 30,
    allow_signups:          true,
    auto_provision_orgs:    false,
    default_llm_provider:   '',
    confidence_threshold:   0.7,
    allow_autonomous:       false,
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await api.get('/admin/settings')
      // d is a flat object: { key: value, ... }
      setSettings(d || {})
      setForm(prev => ({
        ...prev,
        platform_name:           d?.platform_name          ?? prev.platform_name,
        environment:             d?.environment            ?? prev.environment,
        timezone:                d?.timezone               ?? prev.timezone,
        require_mfa:             d?.require_mfa            ?? prev.require_mfa,
        session_timeout_minutes: d?.session_timeout_minutes ?? prev.session_timeout_minutes,
        allow_signups:           d?.allow_signups          ?? prev.allow_signups,
        auto_provision_orgs:     d?.auto_provision_orgs    ?? prev.auto_provision_orgs,
        default_llm_provider:    d?.default_llm_provider   ?? prev.default_llm_provider,
        confidence_threshold:    d?.confidence_threshold   ?? prev.confidence_threshold,
        allow_autonomous:        d?.allow_autonomous       ?? prev.allow_autonomous,
      }))
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null); setSuccess('')
    try {
      await api.patch('/admin/settings', { settings: form })
      setSuccess('Settings saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full bg-slate-50">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Platform Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Global SMBFlow platform configuration — admin only</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={save} disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving…' : 'Save Changes'}
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
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading settings…</div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-4">

          <Section title="General">
            <Row label="Platform Name" sub="Display name for this SMBFlow instance.">
              <input value={form.platform_name} onChange={e => set('platform_name', e.target.value)}
                className={inputCls} style={{ width: 200 }} />
            </Row>
            <Row label="Environment" sub="Current deployment environment.">
              <select value={form.environment} onChange={e => set('environment', e.target.value)}
                className={selectCls} style={{ width: 200 }}>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </Row>
            <Row label="Default Timezone" sub="Used for scheduling and display.">
              <select value={form.timezone} onChange={e => set('timezone', e.target.value)}
                className={selectCls} style={{ width: 200 }}>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
              </select>
            </Row>
          </Section>

          <Section title="Security">
            <Row label="Require MFA for all users" sub="Enforce two-factor authentication platform-wide.">
              <Toggle checked={!!form.require_mfa} onChange={v => set('require_mfa', v)} />
            </Row>
            <Row label="Session Timeout (minutes)" sub="Auto sign-out inactive sessions.">
              <input type="number" min={5} max={1440} value={form.session_timeout_minutes}
                onChange={e => set('session_timeout_minutes', parseInt(e.target.value) || 30)}
                className={inputCls} style={{ width: 80 }} />
            </Row>
            <Row label="Allow new sign-ups" sub="Let new users create accounts.">
              <Toggle checked={!!form.allow_signups} onChange={v => set('allow_signups', v)} />
            </Row>
            <Row label="Auto-provision organizations" sub="Create an org automatically on first login.">
              <Toggle checked={!!form.auto_provision_orgs} onChange={v => set('auto_provision_orgs', v)} />
            </Row>
          </Section>

          <Section title="AI / Model Configuration">
            <Row label="Default LLM Provider" sub="Used when no agent-specific model is set.">
              <select value={form.default_llm_provider} onChange={e => set('default_llm_provider', e.target.value)}
                className={selectCls} style={{ width: 200 }}>
                <option value="">Not set</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google_ai">Google AI</option>
                <option value="groq">Groq</option>
              </select>
            </Row>
            <Row label="Default Confidence Threshold" sub="Minimum score before autonomous action.">
              <input type="number" step="0.1" min="0" max="1"
                value={form.confidence_threshold}
                onChange={e => set('confidence_threshold', parseFloat(e.target.value) || 0.7)}
                className={inputCls} style={{ width: 80 }} />
            </Row>
            <Row label="Allow fully autonomous workflows" sub="Permit workflows to execute without human approval.">
              <Toggle checked={!!form.allow_autonomous} onChange={v => set('allow_autonomous', v)} />
            </Row>
          </Section>

        </div>
      )}
    </div>
  )
}
