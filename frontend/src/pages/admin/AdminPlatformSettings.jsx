import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export default function AdminPlatformSettings() {
  const [form, setForm] = useState({
    platformName: 'SMBFlow',
    environment: 'Development',
    timezone: 'UTC',
    mfa: false,
    sessionTimeout: 30,
    defaultProvider: '',
    confidenceThreshold: 0.7,
    autonomous: false,
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSuccess('Settings saved!')
    setTimeout(() => setSuccess(''), 3000)
  }

  const inputCls = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
  const selectCls = inputCls + " appearance-none pr-8"

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Global SMBFlow platform configuration — admin only</p>
        </div>
        <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

      <div className="max-w-2xl space-y-4">
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Platform settings are not yet connected to the backend API. Changes made here will not persist until the admin settings API endpoint is confirmed and wired.</p>
        </div>

        <Section title="General">
          <Row label="Platform name" sub="Display name for this SMBFlow instance.">
            <input value={form.platformName} onChange={e=>set('platformName',e.target.value)} className={inputCls} style={{width:200}} />
          </Row>
          <Row label="Environment" sub="Current deployment environment.">
            <select value={form.environment} onChange={e=>set('environment',e.target.value)} className={selectCls} style={{width:200}}>
              <option>Development</option><option>Staging</option><option>Production</option>
            </select>
          </Row>
          <Row label="Default timezone" sub="Used for scheduling and display.">
            <select value={form.timezone} onChange={e=>set('timezone',e.target.value)} className={selectCls} style={{width:200}}>
              <option>UTC</option><option>America/New_York</option><option>America/Los_Angeles</option><option>Europe/London</option>
            </select>
          </Row>
        </Section>

        <Section title="Security">
          <Row label="Require MFA for all users" sub="Enforce two-factor authentication platform-wide.">
            <Toggle checked={form.mfa} onChange={v=>set('mfa',v)} />
          </Row>
          <Row label="Session timeout (minutes)" sub="Automatically sign out inactive sessions.">
            <input type="number" value={form.sessionTimeout} onChange={e=>set('sessionTimeout',parseInt(e.target.value)||30)} className={inputCls} style={{width:80}} />
          </Row>
          <Row label="Access policies" sub="Role and permission configuration.">
            <span className="text-sm text-gray-400 italic">Connect admin API to configure</span>
          </Row>
        </Section>

        <Section title="AI / Model Configuration">
          <Row label="Default LLM provider" sub="Provider used when no agent-specific model is set.">
            <select value={form.defaultProvider} onChange={e=>set('defaultProvider',e.target.value)} className={selectCls} style={{width:200}}>
              <option value="">Select provider...</option><option>anthropic</option><option>openai</option><option>groq</option><option>google</option>
            </select>
          </Row>
          <Row label="Default confidence threshold" sub="Minimum score before autonomous action is permitted.">
            <input type="number" step="0.1" min="0" max="1" value={form.confidenceThreshold} onChange={e=>set('confidenceThreshold',parseFloat(e.target.value)||0.7)} className={inputCls} style={{width:80}} />
          </Row>
          <Row label="Allow fully autonomous workflows" sub="Permit workflows to execute without human approval.">
            <Toggle checked={form.autonomous} onChange={v=>set('autonomous',v)} />
          </Row>
        </Section>

        <Section title="Platform Integrations">
          <p className="text-xs text-gray-400 italic">Platform-level integration credentials will be configured here once the integration API is connected. Do not enter credentials until the backend storage is confirmed secure.</p>
        </Section>

        <Section title="System">
          {[
            { label:'API status',           value:'Not connected' },
            { label:'Background services',  value:'Status unavailable' },
            { label:'Database connection',  value:'Status unavailable' },
            { label:'Platform version',     value:'Not reported' },
          ].map(r => (
            <Row key={r.label} label={r.label}>
              <span className="text-sm text-gray-400 italic">{r.value}</span>
            </Row>
          ))}
        </Section>
      </div>
    </div>
  )
}
