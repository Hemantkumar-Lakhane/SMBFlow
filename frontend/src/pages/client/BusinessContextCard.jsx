// frontend/src/pages/client/BusinessContextCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Business Context Pack Configuration Component
// Allows organization administrators to view, edit, and save:
//   • services_offerings
//   • target_market
//   • business_priorities
//   • additional_context
//
// Stored as organization-scoped configuration.
// Supports both form editing and structured JSON mode.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react'
import {
  Briefcase, Save, RefreshCw, Check, AlertCircle, Loader2,
  FileCode, Sparkles, Building, Target, Compass, FileText, ArrowRight
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function BusinessContextCard({ onSaved, inModal = false }) {
  const { api, user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [jsonMode, setJsonMode] = useState(false)
  const [rawJsonText, setRawJsonText] = useState('')

  const [context, setContext] = useState({
    services_offerings: '',
    target_market: '',
    business_priorities: '',
    additional_context: '',
    updated_at: null,
    updated_by: null,
  })

  const loadContext = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // Primary route via meeting intelligence workflow, fallback to org route
      let data = null
      try {
        data = await api.get('/workflows/meeting-intelligence/business-context')
      } catch {
        data = await api.get('/organizations/me/business-context')
      }

      if (data) {
        const loaded = {
          services_offerings: data.services_offerings || '',
          target_market: data.target_market || '',
          business_priorities: data.business_priorities || '',
          additional_context: data.additional_context || '',
          updated_at: data.updated_at || null,
          updated_by: data.updated_by || null,
        }
        setContext(loaded)
        setRawJsonText(JSON.stringify(loaded, null, 2))
      }
    } catch (err) {
      console.warn('Failed to load business context:', err)
      setErrorMsg(err.message || 'Failed to load business context')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadContext()
  }, [loadContext])

  const handleChange = (field, value) => {
    setContext(prev => {
      const next = { ...prev, [field]: value }
      setRawJsonText(JSON.stringify(next, null, 2))
      return next
    })
  }

  const handleJsonChange = (text) => {
    setRawJsonText(text)
    try {
      const parsed = JSON.parse(text)
      setContext(prev => ({
        ...prev,
        services_offerings: parsed.services_offerings || '',
        target_market: parsed.target_market || '',
        business_priorities: parsed.business_priorities || '',
        additional_context: parsed.additional_context || '',
      }))
      setErrorMsg('')
    } catch (e) {
      // Keep typing, don't break UI on transient invalid JSON
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg('')
    setSuccessMsg('')

    let payload = { ...context }
    if (jsonMode) {
      try {
        const parsed = JSON.parse(rawJsonText)
        payload = {
          services_offerings: parsed.services_offerings || '',
          target_market: parsed.target_market || '',
          business_priorities: parsed.business_priorities || '',
          additional_context: parsed.additional_context || '',
        }
      } catch (err) {
        setErrorMsg('Invalid JSON format. Please verify syntax before saving.')
        setSaving(false)
        return
      }
    }

    try {
      let res = null
      try {
        res = await api.put('/workflows/meeting-intelligence/business-context', payload)
      } catch {
        res = await api.put('/organizations/me/business-context', payload)
      }

      if (res) {
        setContext(prev => ({
          ...prev,
          services_offerings: res.services_offerings || payload.services_offerings,
          target_market: res.target_market || payload.target_market,
          business_priorities: res.business_priorities || payload.business_priorities,
          additional_context: res.additional_context || payload.additional_context,
          updated_at: res.updated_at || new Date().toISOString(),
          updated_by: res.updated_by || user?.email || 'admin',
        }))
        setRawJsonText(JSON.stringify(res, null, 2))
      }

      setSuccessMsg('Business Context Pack saved successfully!')
      if (onSaved) onSaved(res || payload)
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save business context.')
    } finally {
      setSaving(false)
    }
  }

  const isConfigured = Boolean(
    context.services_offerings ||
    context.target_market ||
    context.business_priorities ||
    context.additional_context
  )

  return (
    <div className={`bg-white dark:bg-[#121826] border border-slate-200/90 dark:border-[#233048] rounded-3xl p-6 sm:p-7 shadow-xs space-y-6 ${inModal ? 'border-0 p-0 shadow-none' : ''}`}>
      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#1e2a3f] pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Business Context Pack
              </h2>
              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                isConfigured
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-[#182234] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}>
                {isConfigured ? 'Active & Configured' : 'Empty (Default)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Organization-level knowledge grounding Meeting Intelligence without hardcoding assumptions. Empty context is safe.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setJsonMode(!jsonMode)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              jsonMode
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-[#0b0f17] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#233048] hover:bg-slate-50 dark:hover:bg-[#182234]'
            }`}
            title="Toggle Structured JSON Editor"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{jsonMode ? 'Form View' : 'JSON Mode'}</span>
          </button>

          <button
            type="button"
            onClick={loadContext}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#233048] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#182234] transition-colors"
            title="Reload from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Pack</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Status Messages ─────────────────────────────────────────────── */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-medium">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── Editor Body: JSON Mode vs Form Mode ──────────────────────────── */}
      {jsonMode ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>Structured JSON Representation</span>
            <span>UTF-8 / JSONB</span>
          </div>
          <textarea
            rows={12}
            value={rawJsonText}
            onChange={e => handleJsonChange(e.target.value)}
            placeholder="{\n  &quot;services_offerings&quot;: &quot;...&quot;,\n  &quot;target_market&quot;: &quot;...&quot;\n}"
            className="w-full font-mono text-xs p-4 rounded-2xl bg-slate-900 text-emerald-400 dark:bg-[#070a10] dark:text-emerald-300 border border-slate-700 dark:border-[#1e2a3f] outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Services / Offerings */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Building className="w-3.5 h-3.5 text-indigo-500" />
              <span>Services & Core Offerings</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your primary solutions, software products, key capabilities, and value propositions
            </p>
            <textarea
              rows={3}
              value={context.services_offerings}
              onChange={e => handleChange('services_offerings', e.target.value)}
              placeholder="e.g. AI-powered workflow automation, Meeting Intelligence copilots, enterprise CRM sync, customized SLA management..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Target Market / ICP */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span>Target Market & Customer Profile (ICP)</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Ideal customer profile: company sizes, target verticals, buyer roles, and geographic reach
            </p>
            <textarea
              rows={3}
              value={context.target_market}
              onChange={e => handleChange('target_market', e.target.value)}
              placeholder="e.g. Mid-market B2B SaaS and Professional Services companies (20-500 FTEs) in North America and EMEA; VP Operations and CTOs..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Business Priorities */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Compass className="w-3.5 h-3.5 text-amber-500" />
              <span>Current Business Priorities</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Current strategic focus, quarterly goals, pilot qualification criteria, and active campaigns
            </p>
            <textarea
              rows={3}
              value={context.business_priorities}
              onChange={e => handleChange('business_priorities', e.target.value)}
              placeholder="e.g. Q1 enterprise pilot conversions (aiming for 15 signed pilots), SOC2 Type II certification, launching self-serve onboarding..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Additional Context */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <FileText className="w-3.5 h-3.5 text-emerald-500" />
              <span>Additional Context & Constraints</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pricing philosophy, standard pilot terms, non-disclosure requirements, tone guidance
            </p>
            <textarea
              rows={3}
              value={context.additional_context}
              onChange={e => handleChange('additional_context', e.target.value)}
              placeholder="e.g. Standard pilot is 30 days paid at $500/mo with full support; never quote under $300/mo without executive sign-off; tone is consultative and direct..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#0b0f17] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      {/* ── Metadata Footer ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-[#1e2a3f] text-[11px] text-slate-400 dark:text-slate-500">
        <div>
          {context.updated_at ? (
            <span>Last saved: <span className="font-mono text-slate-600 dark:text-slate-300">{new Date(context.updated_at).toLocaleString()}</span> by <span className="font-semibold text-slate-600 dark:text-slate-300">{context.updated_by || 'admin'}</span></span>
          ) : (
            <span>No previous updates recorded (using organization defaults)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Tenant Isolated (PostgreSQL JSONB)</span>
        </div>
      </div>
    </div>
  )
}
