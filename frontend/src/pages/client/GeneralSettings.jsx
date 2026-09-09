// frontend/src/pages/client/GeneralSettings.jsx
// Matches Figma: General Settings — org profile, notifications, security, data retention

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'

const INDUSTRIES = ['SaaS','Retail','Healthcare','Finance','Real Estate','Logistics','Other']
const TIMEZONES  = ['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Tokyo']
const RETENTION_OPTS = ['30 days','60 days','90 days','6 months','1 year','Indefinite']

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {children}
    </div>
  )
}

export default function GeneralSettings() {
  const { user, api } = useAuth()
  const tenantId = user?.tenant_id

  const [form, setForm] = useState({
    orgName:   '',
    industry:  '',
    timezone:  'UTC',
    emailNotif: true,
    slackNotif: false,
    approvalAlerts: true,
    twoFA:     false,
    sessionTimeout: 30,
    runLogsRetention: '90 days',
    evidenceRetention: '1 year',
  })
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState('')
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    if (!tenantId) return
    try {
      const t = await api.get(`/tenants/${tenantId}`)
      if (t?.name)   setForm(f => ({ ...f, orgName: t.name }))
      if (t?.industry) setForm(f => ({ ...f, industry: t.industry }))
      if (t?.config?.timezone) setForm(f => ({ ...f, timezone: t.config.timezone }))
    } catch { /* no data */ }
  }, [api, tenantId])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      if (tenantId) {
        await api.put(`/tenants/${tenantId}/config`, {
          config: { timezone: form.timezone, notifications: { email: form.emailNotif, slack: form.slackNotif, approvals: form.approvalAlerts } }
        })
      }
      setSuccess('Settings saved successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your organization profile, notifications, and security</p>
        </div>
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}
      {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="space-y-4 max-w-2xl">
        {/* Organization Profile */}
        <Section title="Organization Profile">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
              <input value={form.orgName} onChange={e => set('orgName', e.target.value)} placeholder="Your Company Ltd."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
              <div className="relative">
                <select value={form.industry} onChange={e => set('industry', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white">
                  <option value="">Select Industry...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i.toLowerCase()}>{i}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▾</div>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
            <div className="relative w-48">
              <select value={form.timezone} onChange={e => set('timezone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white">
                {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▾</div>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          {[
            { key: 'emailNotif',    label: 'Email notifications',  desc: 'Receive email alerts for approvals and workflow events' },
            { key: 'slackNotif',    label: 'Slack notifications',   desc: 'Post workflow updates to a Slack channel' },
            { key: 'approvalAlerts',label: 'Approval alerts',       desc: 'Get notified immediately when an action requires your approval' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <Toggle checked={form[key]} onChange={v => set(key, v)} />
            </div>
          ))}
        </Section>

        {/* Security */}
        <Section title="Security">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Two-factor authentication</p>
              <p className="text-xs text-gray-500 mt-0.5">Require 2FA for all sign-ins</p>
            </div>
            <Toggle checked={form.twoFA} onChange={v => set('twoFA', v)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Session timeout (minutes)</label>
            <input type="number" value={form.sessionTimeout} onChange={e => set('sessionTimeout', parseInt(e.target.value) || 30)} min={5} max={1440}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </Section>

        {/* Data Retention */}
        <Section title="Data Retention">
          <p className="text-xs text-gray-500 -mt-2">Configure how long SMBFlow retains workflow run data and evidence records.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Run logs retention</label>
              <div className="relative">
                <select value={form.runLogsRetention} onChange={e => set('runLogsRetention', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white">
                  {RETENTION_OPTS.map(o => <option key={o}>{o}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▾</div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Evidence retention</label>
              <div className="relative">
                <select value={form.evidenceRetention} onChange={e => set('evidenceRetention', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white">
                  {RETENTION_OPTS.map(o => <option key={o}>{o}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▾</div>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
