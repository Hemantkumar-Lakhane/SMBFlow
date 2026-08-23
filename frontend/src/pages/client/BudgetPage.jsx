// frontend/src/pages/client/BudgetPage.jsx
// Budget Governor settings: optimization level, caching, A2A, confidence thresholds.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, Toggle, Alert, Spinner, StatCard } from '../../components/ui'
import { BUDGET_LEVELS } from '../../utils/helpers'

// ── Level card ─────────────────────────────────────────────────────────────────
function LevelCard({ level, selected, onClick }) {
  const isSelected = selected === level.n
  const borderCls = isSelected
    ? 'border-blue-500 bg-blue-900/20'
    : 'border-gray-700/50 bg-gray-800/20 hover:border-gray-600 cursor-pointer'

  return (
    <div
      onClick={() => onClick(level.n)}
      className={`rounded-xl border-2 p-4 transition-all ${borderCls}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold ${level.color}`}>{level.name}</span>
        <span className="text-xs text-gray-500">Level {level.n}</span>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div>
          <div className="text-xs text-gray-500">Cost Savings</div>
          <div className={`text-lg font-bold ${level.color}`}>{level.savings}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Accuracy Impact</div>
          <div className="text-sm text-white">{level.accuracy}</div>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{level.desc}</p>
      {isSelected && (
        <div className="mt-3 flex items-center gap-1 text-xs text-blue-400">
          <span>●</span> <span>Currently active</span>
        </div>
      )}
    </div>
  )
}

// ── Savings bar visual ─────────────────────────────────────────────────────────
function SavingsBar({ level }) {
  const info = BUDGET_LEVELS[level] || BUDGET_LEVELS[0]
  const pct = parseInt(info.savings) || 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Est. Cost Savings</span>
        <span className={`font-bold ${info.color}`}>{info.savings}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main BudgetPage ────────────────────────────────────────────────────────────
export default function BudgetPage() {
  const { user, api } = useAuth()
  const tenantId = user?.tenant_id

  const [settings, setSettings] = useState({
    optimization_level:              1,
    enable_caching:                  true,
    cache_ttl_seconds:               3600,
    max_context_tokens:              10000,
    a2a_enabled:                     false,
    auto_retry_on_low_confidence:    true,
    confidence_retry_threshold:      0.6,
    enable_map_reduce_summarization: false,
  })
  const [predictions, setPredictions] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const load = useCallback(async () => {
    if (!tenantId) { setLoading(false); return }
    try {
      const data = await api.get(`/tenants/${tenantId}/budget`)
      setSettings(s => ({
        ...s,
        optimization_level:          data.optimization_level  ?? 1,
        enable_caching:              data.enable_caching       ?? true,
        cache_ttl_seconds:           data.cache_ttl_seconds    ?? 3600,
        max_context_tokens:          data.max_context_tokens   ?? 10000,
        a2a_enabled:                 data.a2a_enabled          ?? false,
        auto_retry_on_low_confidence:data.auto_retry_on_low_confidence ?? true,
        confidence_retry_threshold:  data.confidence_retry_threshold   ?? 0.6,
        enable_map_reduce_summarization: data.enable_map_reduce_summarization ?? false,
      }))
      setPredictions(data.predicted_savings || {})
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [api, tenantId])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await api.put(`/tenants/${tenantId}/budget`, settings)
      setSuccess('Budget settings saved!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!tenantId) return (
    <div className="flex items-center justify-center h-64 text-gray-500">No tenant assigned.</div>
  )

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  const currentPrediction = predictions[settings.optimization_level] || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">💡 Budget Governor</h1>
          <p className="text-gray-400 text-xs mt-0.5">Control LLM cost vs accuracy trade-offs for your workflows</p>
        </div>
        <Button variant="success" loading={saving} onClick={save}>💾 Save Settings</Button>
      </div>

      {error   && <Alert type="error"   onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Current level summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon="💰"
          label="Est. Savings vs Level 0"
          value={currentPrediction.savings_pct != null ? `${currentPrediction.savings_pct}%` : '—'}
          color="text-yellow-400"
        />
        <StatCard
          icon="🎯"
          label="Accuracy Impact"
          value={currentPrediction.accuracy_impact || '—'}
          color={currentPrediction.accuracy_impact === 'None' ? 'text-green-400' : 'text-yellow-400'}
        />
        <StatCard
          icon="⚡"
          label="Active Level"
          value={`Level ${settings.optimization_level}`}
          color="text-blue-400"
          sub={BUDGET_LEVELS[settings.optimization_level]?.name || '—'}
        />
      </div>

      {/* Level selector */}
      <Card title="Optimization Level">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {BUDGET_LEVELS.map(level => (
            <LevelCard
              key={level.n}
              level={level}
              selected={settings.optimization_level}
              onClick={n => set('optimization_level', n)}
            />
          ))}
        </div>
        <SavingsBar level={settings.optimization_level} />
      </Card>

      {/* Caching */}
      <Card title="Redis Caching">
        <div className="space-y-5">
          <Toggle
            checked={settings.enable_caching}
            onChange={v => set('enable_caching', v)}
            label="Enable Semantic Caching"
            description="Cache LLM responses for identical prompts. Reduces cost and latency significantly."
          />
          {settings.enable_caching && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Cache TTL (seconds) — how long to keep cached responses
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={300}
                  max={86400}
                  step={300}
                  value={settings.cache_ttl_seconds}
                  onChange={e => set('cache_ttl_seconds', parseInt(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-white font-mono text-sm w-20 text-right">
                  {settings.cache_ttl_seconds >= 3600
                    ? `${(settings.cache_ttl_seconds / 3600).toFixed(1)}h`
                    : `${settings.cache_ttl_seconds}s`}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>5 min</span><span>1 hr</span><span>24 hr</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Context settings */}
      <Card title="Context Window Limits">
        <div>
          <label className="block text-xs text-gray-400 mb-2">
            Max Context Tokens per Agent
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={2000}
              max={50000}
              step={1000}
              value={settings.max_context_tokens}
              onChange={e => set('max_context_tokens', parseInt(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-white font-mono text-sm w-20 text-right">
              {(settings.max_context_tokens / 1000).toFixed(0)}K
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Larger context = more accurate but more expensive. Aggressive/Budget modes summarise before hitting this limit.
          </p>
        </div>
      </Card>

      {/* Agent-to-Agent */}
      <Card title="Agent-to-Agent (A2A) Protocol">
        <div className="space-y-4">
          <Toggle
            checked={settings.a2a_enabled}
            onChange={v => set('a2a_enabled', v)}
            label="Allow A2A Refinement Requests"
            description="Agents can ask a previous agent to re-run with refined instructions. You'll be asked for permission each time."
          />
          {settings.a2a_enabled && (
            <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 text-xs text-blue-300">
              ℹ️ When an agent requests A2A, you'll see a notification in the workflow view asking for your approval before the extra run is allowed.
            </div>
          )}
        </div>
      </Card>

      {/* Map-Reduce Summarization */}
      <Card title="🗺️ Map-Reduce Summarization">
        <div className="space-y-4">
          <Toggle
            checked={settings.enable_map_reduce_summarization}
            onChange={v => set('enable_map_reduce_summarization', v)}
            label="Enable Map-Reduce Context Summarization"
            description={
              'Recursively chunk → summarise → consolidate large research outputs before '
              + 'passing to the Reasoning Agent. Reduces input tokens by up to 90 % and '
              + 'enables &ldquo;infinite context&rdquo; workflows. '
              + 'Works at ALL optimisation levels (even Level 0 / Max Accuracy).'
            }
          />
          {settings.enable_map_reduce_summarization && (
            <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 text-xs text-blue-300 space-y-1">
              <div className="font-semibold">How it works</div>
              <div>1. Research output is split into ~3 000-token chunks.</div>
              <div>2. Each chunk is summarised in parallel (mini model).</div>
              <div>3. Summaries are merged; if still large the step recurses.</div>
              <div>4. A final Consolidated Anomaly Report is handed to the Reasoning Agent.</div>
            </div>
          )}
          {!settings.enable_map_reduce_summarization && (
            <p className="text-xs text-gray-600">
              Auto-triggers at Level 2+, or when raw data exceeds ~10 K tokens even at Level 0.
              Toggle on to force it at all levels.
            </p>
          )}
        </div>
      </Card>

      {/* Just-in-time accuracy */}
      <Card title="Just-in-Time Accuracy Retry">
        <div className="space-y-5">
          <Toggle
            checked={settings.auto_retry_on_low_confidence}
            onChange={v => set('auto_retry_on_low_confidence', v)}
            label="Auto-retry with Heavy Model on Low Confidence"
            description="If a cheap model returns low confidence, automatically retry once with the heavy tier."
          />
          {settings.auto_retry_on_low_confidence && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Confidence Retry Threshold (retry if below this)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0.3}
                  max={0.9}
                  step={0.05}
                  value={settings.confidence_retry_threshold}
                  onChange={e => set('confidence_retry_threshold', parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-white font-mono text-sm w-16 text-right">
                  {(settings.confidence_retry_threshold * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}