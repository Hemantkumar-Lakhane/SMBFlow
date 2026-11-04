// frontend/src/pages/client/CentralMemoryQueryCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Natural-Language Central Memory Query Component
// Allows users to query their organization's stored relationship memory.
// Returns concise, grounded answers with complete source conversation citations.
// Never invents facts; excludes uncertain contact research.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import {
  Search, Sparkles, Database, CheckCircle, AlertTriangle, Clock,
  User, ExternalLink, ArrowRight, CornerDownLeft, ShieldCheck, ChevronRight,
  Layers, Bookmark, FileText
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function CentralMemoryQueryCard({
  contactName = null,
  contactId = null,
  initialQuery = '',
  compact = false,
}) {
  const { api } = useAuth()

  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [showSources, setShowSources] = useState(true)

  // Example suggested chips tailored to contact or general org memory
  const chips = [
    contactName ? `What did ${contactName} commit to?` : 'What did Rahul commit to?',
    contactName ? `What opportunities have we discussed with ${contactName}?` : 'What opportunities have we discussed with Rahul?',
    'What are my pending commitments?',
    'When did we last discuss the AI pilot?',
  ]

  const handleSearch = async (queryText = query) => {
    const q = (queryText || '').trim()
    if (!q) return

    setLoading(true)
    setError('')
    try {
      const payload = {
        query: q,
        contact_name: contactName || undefined,
        contact_id: contactId || undefined,
        use_llm: true,
      }

      let data = null
      try {
        data = await api.post('/workflows/meeting-intelligence/central-memory/query', payload)
      } catch (firstErr) {
        data = await api.post('/workflows/meeting-intelligence/memory/query', payload)
      }

      setResult(data)
    } catch (err) {
      console.error('Failed to query Central Memory:', err)
      setError(err.message || 'Failed to query Central Memory')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] shadow-xs space-y-4 ${compact ? 'p-3' : 'p-5'}`}>
      {/* ── Console Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-[#1e2a3f]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span>Central Memory Natural-Language Query</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                Grounded & Isolated
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Query relationship intelligence, agreed commitments, and conversation milestones across your organization
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Zero Hallucination Guarantee</span>
        </div>
      </div>

      {/* ── Query Input Bar ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={contactName ? `Ask about ${contactName} (e.g. commitments, opportunities, last meeting)...` : 'Ask anything across your relationship memory...'}
            disabled={loading}
            className="w-full pl-10 pr-24 py-3 text-xs rounded-xl border border-slate-200 dark:border-[#233048] bg-slate-50/70 dark:bg-[#0b0f17] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all font-medium"
          />
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-98"
          >
            {loading ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Ask</span>
                <CornerDownLeft className="w-3 h-3" />
              </>
            )}
          </button>
        </div>

        {/* ── Query Suggestion Chips ────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Try:</span>
          {chips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(chip)
                handleSearch(chip)
              }}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 hover:text-teal-700 dark:hover:text-teal-300 border border-slate-200 dark:border-[#233048] transition-all cursor-pointer truncate max-w-xs"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Query Results View ──────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4 pt-2">
          {/* Answer Card */}
          <div className={`p-4 rounded-xl border transition-all ${
            result.has_results
              ? 'bg-teal-50/40 dark:bg-[#0e1726] border-teal-200/80 dark:border-teal-900/60'
              : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50'
          }`}>
            {/* Header / Strategy Badges */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-teal-100 dark:border-teal-950/80 flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${result.has_results ? 'bg-teal-500' : 'bg-amber-500'}`} />
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {result.has_results ? 'Grounded Memory Answer' : 'Insufficient Evidence'}
                </span>
                {result.matched_contact && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white dark:bg-[#182234] border border-slate-200 dark:border-[#233048] text-slate-700 dark:text-slate-300 font-semibold">
                    Contact: {result.matched_contact}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#182234] text-slate-500 dark:text-slate-400">
                  {result.execution_strategy === 'llm_grounded' ? 'LLM Grounded' : result.execution_strategy === 'deterministic' ? 'Deterministic Extraction' : 'No Match'}
                </span>
              </div>
            </div>

            {/* Answer Content */}
            <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line font-medium">
              {result.answer}
            </div>
          </div>

          {/* Sources & Provenance */}
          {result.sources && result.sources.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e2a3f] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-teal-500" />
                  <span>Verified Source Conversations ({result.sources.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSources(!showSources)}
                  className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-semibold"
                >
                  {showSources ? 'Hide Sources' : 'Show Sources'}
                </button>
              </div>

              {showSources && (
                <div className="space-y-1.5">
                  {result.sources.map((src, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#121826] border border-slate-200/80 dark:border-[#1e2a3f] text-xs gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {sIdx + 1}
                        </span>
                        <div className="truncate">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                            {src.title}
                          </span>
                          {src.contact_name && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Attendee: {src.contact_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#182234] text-slate-600 dark:text-slate-400">
                          {src.date || 'Recent'}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                          ID: {src.conversation_id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cited Granular Items */}
          {result.cited_items && result.cited_items.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-[#1e2a3f] space-y-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>Cited Memory Items ({result.cited_items.length})</span>
              </div>
              <div className="space-y-1.5">
                {result.cited_items.map((it, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-white dark:bg-[#121826] border border-slate-200/80 dark:border-[#1e2a3f] text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                        it.category === 'commitment'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : it.category === 'opportunity'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-100 dark:bg-[#182234] text-slate-700 dark:text-slate-300'
                      }`}>
                        {it.category}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {it.source_conversation_title} ({it.source_date || 'Date N/A'})
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-medium pl-1">
                      {it.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Guidance */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-between pt-1">
            <span>Query executed strictly across organization Central Memory.</span>
            <span>External web research excluded to prevent fabrication.</span>
          </div>
        </div>
      )}
    </div>
  )
}
