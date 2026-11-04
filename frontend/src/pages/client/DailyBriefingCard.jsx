// frontend/src/pages/client/DailyBriefingCard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Daily Briefing Executive Card & Configuration Modal
// Displays:
//   - Today's & upcoming meetings
//   - Key synthesized priorities
//   - Pending internal commitments & waiting-on-contact items
//   - Follow-up email drafts awaiting review (with 1-click navigation)
//   - Suggested contact follow-ups (overdue touches)
//   - Verified contact research & news
//   - Manual "Generate Now" & Delivery Config Modal (time + timezone)
// Never fabricates missing data.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Calendar, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Settings, ExternalLink, ArrowRight, User, Users, Briefcase,
  FileText, ShieldCheck, Mail, Check, X, AlertCircle, ChevronRight
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WSContext'
import { timeAgo } from '../../utils/helpers'

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
]

export default function DailyBriefingCard() {
  const navigate = useNavigate()
  const { api, user } = useAuth()
  const { subscribe } = useWebSocket()

  const [briefing, setBriefing] = useState(null)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    enabled: true,
    time: '08:00',
    timezone: 'UTC'
  })
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [activeTab, setActiveTab] = useState('priorities') // 'priorities' | 'meetings' | 'commitments' | 'intelligence'

  // Fetch Briefing
  const fetchBriefing = useCallback(async () => {
    try {
      const res = await api.get('/daily-briefing')
      setBriefing(res)
    } catch (err) {
      console.warn('Failed to load daily briefing:', err)
    } finally {
      setLoading(false)
    }
  }, [api])

  // Fetch Delivery Config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/daily-briefing/config')
      setConfig(res)
      setConfigForm({
        enabled: res.enabled ?? true,
        time: res.time || '08:00',
        timezone: res.timezone || 'UTC'
      })
    } catch (err) {
      console.warn('Failed to load daily briefing config:', err)
    }
  }, [api])

  useEffect(() => {
    fetchBriefing()
    fetchConfig()
  }, [fetchBriefing, fetchConfig])

  // Real-time subscription to briefing updates
  useEffect(() => {
    if (!subscribe) return
    const unsubs = [
      subscribe('daily_briefing_updated', (event) => {
        if (event?.briefing) {
          setBriefing(event.briefing)
        } else {
          fetchBriefing()
        }
      })
    ]
    return () => unsubs.forEach(fn => fn && fn())
  }, [subscribe, fetchBriefing])

  // Manual Generate / Regenerate
  const handleGenerateNow = async () => {
    setGenerating(true)
    setFeedbackMsg('')
    try {
      const res = await api.post('/daily-briefing/generate', { force: true })
      setBriefing(res)
      setFeedbackMsg('Briefing regenerated successfully')
      setTimeout(() => setFeedbackMsg(''), 4000)
    } catch (err) {
      console.error('Failed to generate briefing:', err)
      setFeedbackMsg('Failed to generate briefing. Please retry.')
      setTimeout(() => setFeedbackMsg(''), 5000)
    } finally {
      setGenerating(false)
    }
  }

  // Save Delivery Config
  const handleSaveConfig = async (e) => {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const res = await api.put('/daily-briefing/config', configForm)
      setConfig(res)
      setConfigModalOpen(false)
      setFeedbackMsg('Schedule configuration updated')
      setTimeout(() => setFeedbackMsg(''), 4000)
    } catch (err) {
      console.error('Failed to update config:', err)
      alert(err.message || 'Failed to update schedule configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  const sections = briefing?.sections || briefing?.content || {}
  const totals = sections.totals || {
    meetings_today: 0,
    upcoming_meetings: 0,
    our_commitments: 0,
    waiting_on_contacts: 0,
    drafts_review: 0,
    suggested_followups: 0,
    verified_research: 0
  }

  const meetingsToday = sections.meetings_today || []
  const upcomingMeetings = sections.upcoming_meetings || []
  const priorities = sections.priorities || []
  const ourCommitments = sections.pending_commitments || []
  const waitingContacts = sections.contacts_waiting || []
  const draftsReview = sections.drafts_awaiting_review || []
  const followups = sections.suggested_followups || []
  const researchHighlights = sections.research_highlights || []

  return (
    <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl shadow-2xs p-5 mb-6 transition-all">
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-[#1e293b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Executive Daily Briefing
              </h2>
              {briefing?.briefing_date && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                  {briefing.briefing_date}
                </span>
              )}
              {config?.enabled ? (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Scheduled ({config.time} {config.timezone})
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                  Manual Only
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live intelligence roll-up from Meeting Intelligence: schedules, commitments, pending reviews, and verified contact research.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          {feedbackMsg && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in mr-2">
              {feedbackMsg}
            </span>
          )}

          <button
            onClick={() => setConfigModalOpen(true)}
            title="Configure delivery time and timezone"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-[#182234] hover:bg-slate-200 dark:hover:bg-[#1e2b42] text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-[#233048] transition-colors cursor-pointer"
          >
            <Settings size={13} />
            <span>Schedule</span>
          </button>

          <button
            onClick={handleGenerateNow}
            disabled={generating}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            <span>{generating ? 'Regenerating…' : 'Generate Now'}</span>
          </button>
        </div>
      </div>

      {/* ── Summary Counters Strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 my-4">
        <div
          onClick={() => setActiveTab('meetings')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'meetings'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Today's Mtgs</span>
          <span className="text-lg font-bold text-slate-900 dark:text-white">{totals.meetings_today}</span>
        </div>

        <div
          onClick={() => setActiveTab('meetings')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'meetings'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Upcoming</span>
          <span className="text-lg font-bold text-slate-900 dark:text-white">{totals.upcoming_meetings}</span>
        </div>

        <div
          onClick={() => setActiveTab('priorities')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'priorities'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Key Priorities</span>
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{priorities.length}</span>
        </div>

        <div
          onClick={() => setActiveTab('commitments')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'commitments'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Our Commitments</span>
          <span className="text-lg font-bold text-slate-900 dark:text-white">{totals.our_commitments}</span>
        </div>

        <div
          onClick={() => setActiveTab('commitments')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'commitments'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Waiting On</span>
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{totals.waiting_on_contacts}</span>
        </div>

        <div
          onClick={() => setActiveTab('commitments')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'commitments'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Drafts Awaiting</span>
          <span className={`text-lg font-bold ${totals.drafts_review > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {totals.drafts_review}
          </span>
        </div>

        <div
          onClick={() => setActiveTab('intelligence')}
          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
            activeTab === 'intelligence'
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
              : 'bg-slate-50/60 dark:bg-[#161f30] border-slate-200 dark:border-[#1e293b] hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Enriched Intel</span>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{totals.verified_research}</span>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-[#1e293b] mb-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('priorities')}
          className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'priorities'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Priorities ({priorities.length})
        </button>
        <button
          onClick={() => setActiveTab('meetings')}
          className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'meetings'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Meetings ({meetingsToday.length + upcomingMeetings.length})
        </button>
        <button
          onClick={() => setActiveTab('commitments')}
          className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'commitments'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Commitments & Reviews ({ourCommitments.length + waitingContacts.length + draftsReview.length})
        </button>
        <button
          onClick={() => setActiveTab('intelligence')}
          className={`pb-2 px-3 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'intelligence'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Enriched Intel & Follow-ups ({followups.length + researchHighlights.length})
        </button>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
          <RefreshCw size={18} className="animate-spin mb-2 text-blue-500" />
          <span>Hydrating daily briefing…</span>
        </div>
      ) : (
        <div>
          {/* TAB 1: PRIORITIES */}
          {activeTab === 'priorities' && (
            <div className="space-y-2.5">
              {priorities.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-slate-50/50 dark:bg-[#161f30]/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-500/80 mb-1.5" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">All clear for today</p>
                  <p className="text-[11px] text-slate-400">No urgent commitments or pending review drafts recorded.</p>
                </div>
              ) : (
                priorities.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/60 flex items-start justify-between gap-3 hover:bg-slate-100/60 dark:hover:bg-[#1a2538] transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        {item.priority === 'urgent' ? (
                          <AlertTriangle size={15} className="text-amber-500" />
                        ) : item.priority === 'high' ? (
                          <Clock size={15} className="text-blue-500" />
                        ) : (
                          <CheckCircle2 size={15} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            item.priority === 'urgent'
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                              : 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                          }`}>
                            {item.category || item.priority}
                          </span>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </p>
                        </div>
                        {item.detail && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {item.detail}
                          </p>
                        )}
                        {item.due_date && (
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">
                            Target Date: {item.due_date}
                          </p>
                        )}
                      </div>
                    </div>

                    {item.category === 'draft_review' && (
                      <button
                        onClick={() => navigate('/escalations')}
                        className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Review</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: MEETINGS */}
          {activeTab === 'meetings' && (
            <div className="space-y-4">
              {/* Today's Meetings */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={14} className="text-blue-500" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                    Today's Schedule ({meetingsToday.length})
                  </h3>
                </div>

                {meetingsToday.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 pl-2">No meetings on the calendar for today.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {meetingsToday.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/50 dark:bg-[#161f30] flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                              {m.time}
                            </span>
                            {m.prep_status && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                {m.prep_status}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                            {m.title}
                          </p>
                          {m.participants?.length > 0 && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 truncate">
                              <Users size={12} className="shrink-0" />
                              <span>{m.participants.join(', ')}</span>
                            </p>
                          )}
                        </div>
                        {m.run_id && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#1e293b] flex justify-end">
                            <button
                              onClick={() => navigate('/workflows/meeting_intelligence_followup')}
                              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>Open Prep & Intel</span>
                              <ChevronRight size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Meetings (Next 7 Days) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wider">
                    Upcoming (Next 7 Days) ({upcomingMeetings.length})
                  </h3>
                </div>

                {upcomingMeetings.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2 pl-2">No upcoming meetings scheduled in the next 7 days.</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingMeetings.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-white dark:bg-[#121826] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 w-24 shrink-0">
                            {m.date} {m.time}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {m.title}
                            </span>
                            {m.participants?.length > 0 && (
                              <span className="text-[11px] text-slate-400 ml-2">
                                ({m.participants.join(', ')})
                              </span>
                            )}
                          </div>
                        </div>
                        {m.prep_status && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400">
                            {m.prep_status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMMITMENTS & REVIEWS */}
          {activeTab === 'commitments' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column 1: Our Commitments */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/40">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-blue-500" />
                    <span>Our Commitments</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-slate-500">{ourCommitments.length}</span>
                </div>

                {ourCommitments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">Zero pending commitments.</p>
                ) : (
                  <div className="space-y-2">
                    {ourCommitments.map((c, idx) => (
                      <div key={idx} className="p-2 rounded bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-xs">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{c.title}</p>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400 font-mono">
                          <span>Owner: {c.owner || 'You'}</span>
                          {c.due_date && <span>Due: {c.due_date}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Column 2: Waiting On Contact */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/40">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} className="text-amber-500" />
                    <span>Waiting On Contact</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-slate-500">{waitingContacts.length}</span>
                </div>

                {waitingContacts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No pending deliverables from contacts.</p>
                ) : (
                  <div className="space-y-2">
                    {waitingContacts.map((w, idx) => (
                      <div key={idx} className="p-2 rounded bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-xs">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{w.title}</p>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                          <span className="font-semibold text-amber-600 dark:text-amber-400">{w.contact}</span>
                          {w.waiting_since && <span className="font-mono">{w.waiting_since}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Column 3: Drafts Awaiting Review */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/40">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Mail size={13} className="text-blue-500" />
                    <span>Follow-Up Drafts</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{draftsReview.length}</span>
                </div>

                {draftsReview.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No follow-up drafts awaiting human review.</p>
                ) : (
                  <div className="space-y-2">
                    {draftsReview.map((d, idx) => (
                      <div key={idx} className="p-2 rounded bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-xs">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{d.subject || 'Follow-up Email'}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">To: {d.recipient}</p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 dark:border-[#1e293b]">
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                            Review Required
                          </span>
                          <button
                            onClick={() => navigate('/escalations')}
                            className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Approve Draft</span>
                            <ArrowRight size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ENRICHED INTEL & SUGGESTED FOLLOW-UPS */}
          {activeTab === 'intelligence' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Suggested Follow-ups */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/40">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={13} className="text-blue-500" />
                    <span>Suggested Follow-Ups (Stale Touches)</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-slate-500">{followups.length}</span>
                </div>

                {followups.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">All contacts have active, recent touchpoints.</p>
                ) : (
                  <div className="space-y-2">
                    {followups.map((f, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-xs">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-800 dark:text-slate-200">{f.contact_name}</p>
                          {f.days_since_last_touch != null && (
                            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                              {f.days_since_last_touch}d since touch
                            </span>
                          )}
                        </div>
                        {f.company && <p className="text-[11px] text-slate-500 dark:text-slate-400">{f.company}</p>}
                        {f.reason && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 italic">{f.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verified Research Highlights */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-[#233048] bg-slate-50/40 dark:bg-[#161f30]/40">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span>Verified Contact Research & News</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{researchHighlights.length}</span>
                </div>

                {researchHighlights.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No verified contact research records logged yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {researchHighlights.map((r, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{r.contact_name}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <ShieldCheck size={10} />
                            Verified Serper Intel
                          </span>
                        </div>
                        {r.headline && (
                          <p className="font-semibold text-slate-700 dark:text-slate-300 mt-1">{r.headline}</p>
                        )}
                        {r.summary && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{r.summary}</p>
                        )}
                        {r.source_url && (
                          <div className="mt-1.5 flex justify-end">
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <span>Source Provenance</span>
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Briefing Schedule & Timezone Modal ───────────────────────────────── */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-[#233048] rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e293b]">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-blue-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Daily Briefing Delivery Schedule</h3>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 mt-4 text-xs">
              {/* Enabled Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-[#182234] border border-slate-200 dark:border-[#233048]">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Automatic Generation</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Generate and rehydrate briefing daily at specified time</p>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Time Input */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Delivery Time (24-Hour Local Time HH:MM)
                </label>
                <input
                  type="time"
                  required
                  value={configForm.time}
                  onChange={(e) => setConfigForm({ ...configForm, time: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] rounded-lg text-slate-900 dark:text-white font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Timezone Select */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Organization Timezone (IANA)
                </label>
                <select
                  value={configForm.timezone}
                  onChange={(e) => setConfigForm({ ...configForm, timezone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#182234] border border-slate-200 dark:border-[#233048] rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Briefing scheduler will evaluate this local timezone to compute exact UTC delivery.
                </p>
              </div>

              {/* UTC Equivalent Preview */}
              {config?.scheduled_time_utc && (
                <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px]">
                  Scheduled UTC execution time: <span className="font-mono font-bold">{config.scheduled_time_utc} UTC</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#182234] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingConfig ? 'Saving…' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
