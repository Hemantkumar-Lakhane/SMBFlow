// frontend/src/pages/client/BudgetPage.jsx
// Matches Figma: Budget & Billing — usage, cost tracking, billing info

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DollarSign } from 'lucide-react'
import { fmtCost } from '../../utils/helpers'

export default function BudgetPage() {
  const { user, api } = useAuth()
  const tenantId = user?.tenant_id

  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState('')
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    if (!tenantId) { setLoading(false); return }
    try {
      const data = await api.get(`/tenants/${tenantId}/budget`)
      setSettings(data)
    } catch { /* no data yet */ }
    finally { setLoading(false) }
  }, [api, tenantId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!settings || !tenantId) return
    setSaving(true); setError(''); setSuccess('')
    try {
      // Send only the fields BudgetSettingsUpdate accepts — extra fields cause 422
      await api.put(`/tenants/${tenantId}/budget`, {
        optimization_level:              settings.optimization_level              ?? 1,
        enable_caching:                  settings.enable_caching                  ?? true,
        cache_ttl_seconds:               settings.cache_ttl_seconds               ?? 3600,
        max_context_tokens:              settings.max_context_tokens              ?? 10000,
        a2a_enabled:                     settings.a2a_enabled                     ?? false,
        auto_retry_on_low_confidence:    settings.auto_retry_on_low_confidence    ?? true,
        confidence_retry_threshold:      settings.confidence_retry_threshold      ?? 0.6,
        enable_map_reduce_summarization: settings.enable_map_reduce_summarization ?? false,
      })
      setSuccess('Budget settings saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const noData = !loading && !settings

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget &amp; Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Usage, cost tracking and billing information</p>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Current spend', value: settings?.current_spend },
          { label: 'Budget limit',  value: settings?.budget_limit },
          { label: 'Runs this month', value: settings?.runs_this_month },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
            <p className={`text-sm font-semibold ${value != null ? 'text-gray-900' : 'text-blue-500 italic'}`}>
              {value != null ? (typeof value === 'number' ? fmtCost(value) : value) : 'No data available'}
            </p>
          </div>
        ))}
      </div>

      {/* Usage History */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-5">Usage History</h2>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : noData ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <DollarSign className="w-10 h-10 text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">No billing data available</p>
              <p className="text-xs text-gray-400 mt-1">
                Cost and usage data will appear here once workflows start running and the billing API is connected.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Optimization level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Optimization Level</label>
              <div className="grid grid-cols-4 gap-2">
                {[0,1,2,3].map(n => {
                  const labels = ['Max Accuracy','Balanced','Aggressive','Budget First']
                  const active = settings?.optimization_level === n
                  return (
                    <button key={n} onClick={() => setSettings(s => ({ ...s, optimization_level: n }))}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}>
                      {labels[n]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Caching toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Semantic Caching</p>
                <p className="text-xs text-gray-400 mt-0.5">Reduce costs by caching similar LLM responses</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, enable_caching: !s.enable_caching }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${settings?.enable_caching ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings?.enable_caching ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <button onClick={save} disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
