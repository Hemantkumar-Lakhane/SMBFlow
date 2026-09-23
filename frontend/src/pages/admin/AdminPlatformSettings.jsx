// AdminPlatformSettings — Platform-wide configuration
// Data from: GET /api/v1/admin/settings
// Save via:  PATCH /api/v1/admin/settings
// NOTE: Platform Name is NOT editable — SMBFlow is the product brand.
//       Only genuine operational settings live here.
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Save, XCircle, CheckCircle2, Shield, Clock, Globe, Cpu, Bot } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-checked={checked}
      role="switch"
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <Icon size={14} className="text-slate-500 shrink-0" />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-5">{children}</div>
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const inputCls  = 'border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white'
const selectCls = inputCls + ' cursor-pointer'

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
]

export default function AdminPlatformSettings() {
  const { api } = useAuth()

  const [form, setForm] = useState({
    // General / Operational
    timezone:               'UTC',
    environment:            'production',
    // Auth / Sign-up
    allow_signups:          true,
    auto_provision_orgs:    false,
    // Security
    require_mfa:            false,
    session_timeout_minutes: 60,
    // AI Defaults
    default_llm_provider:   '',
    confidence_threshold:   0.75,
    allow_autonomous:       false,
    // System behavior
    enable_audit_log:       true,
    run_recovery_on_start:  true,
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
      if (d && typeof d === 'object') {
        setForm(prev => ({
          ...prev,
          timezone:               d.timezone               ?? prev.timezone,
          environment:             d.environment            ?? prev.environment,
          allow_signups:           d.allow_signups          ?? prev.allow_signups,
          auto_provision_orgs:     d.auto_provision_orgs    ?? prev.auto_provision_orgs,
          require_mfa:             d.require_mfa            ?? prev.require_mfa,
          session_timeout_minutes: d.session_timeout_minutes ?? prev.session_timeout_minutes,
          default_llm_provider:    d.default_llm_provider   ?? prev.default_llm_provider,
          confidence_threshold:    d.confidence_threshold   ?? prev.confidence_threshold,
          allow_autonomous:        d.allow_autonomous       ?? prev.allow_autonomous,
          enable_audit_log:        d.enable_audit_log       ?? prev.enable_audit_log,
          run_recovery_on_start:   d.run_recovery_on_start  ?? prev.run_recovery_on_start,
        }))
      }
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
          <p className="text-sm text-slate-500 mt-0.5">Operational configuration for the SMBFlow platform</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Reload settings"
          >
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

          {/* General */}
          <Section icon={Globe} title="General">
            <Row label="Default Timezone" sub="Used for scheduling, display, and audit timestamps.">
              <select value={form.timezone} onChange={e => set('timezone', e.target.value)}
                className={selectCls} style={{ width: 220 }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Row>
            <Row label="Deployment Environment" sub="Controls logging verbosity and feature flags.">
              <select value={form.environment} onChange={e => set('environment', e.target.value)}
                className={selectCls} style={{ width: 160 }}>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </Row>
          </Section>

          {/* Sign-up & Provisioning */}
          <Section icon={Clock} title="Sign-up & Onboarding">
            <Row label="Allow new sign-ups" sub="Let new users create accounts via the public sign-up flow.">
              <Toggle checked={!!form.allow_signups} onChange={v => set('allow_signups', v)} />
            </Row>
            <Row label="Auto-provision organizations" sub="Automatically create a workspace on first login, no admin required.">
              <Toggle checked={!!form.auto_provision_orgs} onChange={v => set('auto_provision_orgs', v)} />
            </Row>
          </Section>

          {/* Security */}
          <Section icon={Shield} title="Security & Session">
            <Row label="Require MFA for all users" sub="Enforce two-factor authentication platform-wide.">
              <Toggle checked={!!form.require_mfa} onChange={v => set('require_mfa', v)} />
            </Row>
            <Row label="Session timeout (minutes)" sub="Auto sign-out inactive sessions after this period.">
              <input type="number" min={5} max={1440} value={form.session_timeout_minutes}
                onChange={e => set('session_timeout_minutes', parseInt(e.target.value) || 60)}
                className={inputCls} style={{ width: 80 }} />
            </Row>
          </Section>

          {/* AI & Automation Policy */}
          <Section icon={Cpu} title="AI & Automation Policy">
            <Row label="Default LLM Provider" sub="Platform-wide fallback when no agent-specific model is set.">
              <select value={form.default_llm_provider} onChange={e => set('default_llm_provider', e.target.value)}
                className={selectCls} style={{ width: 200 }}>
                <option value="">Not set (use llm_config.json)</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google_ai">Google AI (Gemini)</option>
                <option value="groq">Groq</option>
              </select>
            </Row>
            <Row label="Default confidence threshold" sub="Minimum score required before an autonomous action is taken (0.0–1.0).">
              <input type="number" step="0.05" min="0" max="1"
                value={form.confidence_threshold}
                onChange={e => set('confidence_threshold', parseFloat(e.target.value) || 0.75)}
                className={inputCls} style={{ width: 80 }} />
            </Row>
            <Row label="Allow fully autonomous workflows" sub="Permit workflows to execute without any human approval gate.">
              <Toggle checked={!!form.allow_autonomous} onChange={v => set('allow_autonomous', v)} />
            </Row>
          </Section>

          {/* System Behavior */}
          <Section icon={Bot} title="System Behavior">
            <Row label="Enable audit log" sub="Record all admin and platform actions to the audit_events table.">
              <Toggle checked={!!form.enable_audit_log} onChange={v => set('enable_audit_log', v)} />
            </Row>
            <Row label="Recover interrupted workflows on start" sub="Mark workflows that were running during a server restart as failed.">
              <Toggle checked={!!form.run_recovery_on_start} onChange={v => set('run_recovery_on_start', v)} />
            </Row>
          </Section>

        </div>
      )}
    </div>
  )
}
